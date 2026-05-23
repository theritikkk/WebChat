import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Server } from "socket.io";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import { verifySocketToken, assertRoomMember, persistMessage } from "./lib/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const PORT = Number(process.env.PORT_CHAT) || 5000;
const origins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.use(helmet());
app.use(cors({ origin: origins.length ? origins : true }));
app.use(morgan("dev"));
app.get("/health", (_req, res) => res.json({ ok: true, service: "chat" }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: origins.length ? origins : "*",
    methods: ["GET", "POST"]
  }
});

const redisUrl = process.env.REDIS_URL;
if (redisUrl) {
  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();
  Promise.all([pubClient.connect(), subClient.connect()])
    .then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      console.log("Socket.io Redis adapter enabled");
    })
    .catch((err) => {
      console.warn("Redis adapter disabled:", err.message);
    });
}

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    const user = verifySocketToken(token);
    socket.data.user = user;
    socket.data.token = token;
    socket.data.rooms = new Set();
    next();
  } catch (e) {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  const { user, token } = socket.data;
  const authHeader = `Bearer ${token}`;

  io.emit("user_online", { user_id: user.id, username: user.username });

  socket.on("join_room", async (payload, cb) => {
    const roomId = typeof payload === "string" ? payload : payload?.roomId;
    if (!roomId) {
      return cb?.({ error: "roomId required" });
    }
    try {
      const ok = await assertRoomMember(authHeader, roomId);
      if (!ok) {
        return cb?.({ error: "Cannot join room" });
      }
      await socket.join(roomId);
      socket.data.rooms.add(roomId);
      socket.to(roomId).emit("user_joined", {
        user_id: user.id,
        username: user.username,
        room_id: roomId
      });
      cb?.({ ok: true });
    } catch (e) {
      console.error(e);
      cb?.({ error: "join failed" });
    }
  });

  socket.on("leave_room", (payload) => {
    const roomId = typeof payload === "string" ? payload : payload?.roomId;
    if (!roomId) {
      return;
    }
    socket.leave(roomId);
    socket.data.rooms.delete(roomId);
    socket.to(roomId).emit("user_left", {
      user_id: user.id,
      username: user.username,
      room_id: roomId
    });
  });

  socket.on("send_message", async (payload, cb) => {
    const { roomId, content, message_type = "text" } = payload || {};
    if (!roomId || !socket.rooms.has(roomId)) {
      return cb?.({ error: "Not in room" });
    }
    try {
      const saved = await persistMessage({
        roomId,
        token,
        content: content ?? "",
        message_type
      });
      const out = { ...saved, room_id: roomId };
      io.to(roomId).emit("receive_message", out);
      cb?.({ ok: true, id: out._id });
    } catch (e) {
      console.error(e);
      cb?.({ error: "send failed" });
    }
  });

  socket.on("typing_start", async (payload) => {
    const roomId = typeof payload === "string" ? payload : payload?.roomId;
    if (!roomId || !socket.rooms.has(roomId)) {
      return;
    }
    socket.to(roomId).emit("user_typing", {
      user_id: user.id,
      username: user.username,
      room_id: roomId,
      typing: true
    });
  });

  socket.on("typing_stop", async (payload) => {
    const roomId = typeof payload === "string" ? payload : payload?.roomId;
    if (!roomId || !socket.rooms.has(roomId)) {
      return;
    }
    socket.to(roomId).emit("user_typing", {
      user_id: user.id,
      username: user.username,
      room_id: roomId,
      typing: false
    });
  });

  socket.on("disconnect", () => {
    for (const roomId of socket.data.rooms) {
      socket.to(roomId).emit("user_left", {
        user_id: user.id,
        username: user.username,
        room_id: roomId
      });
    }
    io.emit("user_offline", { user_id: user.id, username: user.username });
  });
});

server.listen(PORT, () => {
  console.log(`Chat service listening on ${PORT}`);
});
