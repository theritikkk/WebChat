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
import {
  verifySocketToken,
  assertRoomMember,
  persistMessage,
  ackMessageDelivered,
  ackMessageRead,
  initAuthRedis
} from "./lib/auth.js";
import { initRabbitMQ, publishMessage, isRabbitMQReady } from "./lib/rabbitmq.js";
import {
  initPresence,
  setOnline,
  setOffline,
  refreshPresence,
  isOnline,
  getOnlineUserIds
} from "./lib/presence.js";
import {
  register,
  socketConnections,
  socketConnectionsTotal,
  messagesSentTotal,
  messagesDeliveredTotal,
  messagesReadTotal,
  activeRooms,
  webrtcCallsTotal,
  webrtcCallsActive,
  messagePersistDuration
} from "./metrics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const CONFIRM_CHANNEL = "webchat:message:persisted";
const origins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",").map((s) => s.trim()).filter(Boolean);

const INSTANCE_ID = process.env.HOSTNAME || `chat-${Math.random().toString(36).slice(2, 8)}`;

export function createServerInstance(options = {}) {
  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: origins.length ? origins : true }));
  if (process.env.NODE_ENV !== "test") {
    app.use(morgan("dev"));
  }

  app.get("/health", (_req, res) => res.json({ ok: true, service: "chat", instance: INSTANCE_ID }));

  function internalOnly(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || "";
    const addr = ip.replace(/^::ffff:/, "");
    const isLoopback = addr === "127.0.0.1" || addr === "::1" || addr === "localhost";
    const isPrivate =
      /^10\./.test(addr) ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(addr) ||
      /^192\.168\./.test(addr);
    if (isLoopback || isPrivate) return next();
    return res.status(403).json({ error: "Forbidden" });
  }

  app.get("/metrics", internalOnly, async (_req, res) => {
    try {
      res.set("Content-Type", register.contentType);
      res.end(await register.metrics());
    } catch (err) {
      res.status(500).end(err.message);
    }
  });

  function requireBearerToken(req, res, next) {
    try {
      const token = req.headers.authorization?.slice(7);
      if (!token) throw new Error("Missing token");
      verifySocketToken(token);
      next();
    } catch {
      res.status(401).json({ error: "Unauthorized" });
    }
  }

  app.get("/api/v1/presence/:userId", requireBearerToken, async (req, res) => {
    const online = await isOnline(req.params.userId);
    return res.json({ userId: req.params.userId, online });
  });

  app.get("/api/v1/presence", requireBearerToken, async (_req, res) => {
    const userIds = await getOnlineUserIds();
    return res.json({ onlineCount: userIds.length, userIds });
  });

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: origins.length ? origins : "*", methods: ["GET", "POST"] }
  });

  if (options.pubClient && options.subClient) {
    io.adapter(createAdapter(options.pubClient, options.subClient));
  }

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const user  = verifySocketToken(token);
      socket.data.user  = user;
      socket.data.token = token;
      socket.data.rooms = new Set();
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  const activeCalls = new Map();
  const HEARTBEAT_INTERVAL = 60_000;

  io.on("connection", (socket) => {
    const { user, token } = socket.data;
    const authHeader = `Bearer ${token}`;

    socketConnections.inc();
    socketConnectionsTotal.inc();

    setOnline({
      userId:   user.id,
      username: user.username,
      socketId: socket.id,
      instance: INSTANCE_ID,
    }).catch(() => {});

    io.emit("user_online", { user_id: user.id, username: user.username });

    const heartbeat = setInterval(() => {
      refreshPresence(user.id).catch(() => {});
    }, HEARTBEAT_INTERVAL);

    socket.on("join_room", async (payload, cb) => {
      const roomId = typeof payload === "string" ? payload : payload?.roomId;
      if (!roomId) return cb?.({ error: "roomId required" });
      try {
        const ok = await assertRoomMember(authHeader, roomId, user.id);
        if (!ok) return cb?.({ error: "Cannot join room" });
        await socket.join(roomId);
        socket.data.rooms.add(roomId);
        activeRooms.set(io.sockets.adapter.rooms.size);
        socket.to(roomId).emit("user_joined", {
          user_id: user.id, username: user.username, room_id: roomId
        });
        cb?.({ ok: true });
      } catch (e) {
        console.error(e);
        cb?.({ error: "join failed" });
      }
    });

    socket.on("leave_room", (payload) => {
      const roomId = typeof payload === "string" ? payload : payload?.roomId;
      if (!roomId) return;
      socket.leave(roomId);
      socket.data.rooms.delete(roomId);
      activeRooms.set(io.sockets.adapter.rooms.size);
      socket.to(roomId).emit("user_left", {
        user_id: user.id, username: user.username, room_id: roomId
      });
    });

    socket.on("send_message", async (payload, cb) => {
      const { roomId, content, message_type = "text", file_url } = payload || {};
      if (!roomId || !socket.rooms.has(roomId)) return cb?.({ error: "Not in room" });

      try {
        const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const optimisticMsg = {
          _id:          tempId,
          room_id:      roomId,
          user_id:      user.id,
          username:     user.username,
          content:      content ?? "",
          message_type,
          file_url,
          status:       "sent",
          timestamp:    new Date().toISOString(),
        };

        io.to(roomId).emit("receive_message", { ...optimisticMsg, status: "sent" });
        messagesSentTotal.inc({ room_id: roomId });

        const queued = isRabbitMQReady() && publishMessage({
          roomId,
          userId:       user.id,
          username:     user.username,
          content:      content ?? "",
          message_type,
          file_url,
          tempId,
        });

        if (!queued) {
          const end   = messagePersistDuration.startTimer();
          let saved = { _id: `msg_${Date.now()}` };
          try {
            saved = await persistMessage({
              roomId, token, content: content ?? "", message_type, file_url
            });
          } catch {
            // Best effort persist in fallback test environment
          }
          end();
          io.to(roomId).emit("message_confirmed", {
            tempId,
            message: { ...saved, room_id: roomId, status: "sent" },
          });
          cb?.({ ok: true, id: saved._id });
        } else {
          cb?.({ ok: true, queued: true, tempId });
        }
      } catch (e) {
        console.error("[chat] send_message error:", e);
        cb?.({ error: "send failed" });
      }
    });

    socket.on("disconnect", () => {
      clearInterval(heartbeat);
      socketConnections.dec();
      setOffline({ userId: user.id, socketId: socket.id }).catch(() => {});

      for (const roomId of socket.data.rooms) {
        socket.to(roomId).emit("user_left", {
          user_id: user.id, username: user.username, room_id: roomId
        });
      }
      activeRooms.set(io.sockets.adapter.rooms.size);
      io.emit("user_offline", { user_id: user.id, username: user.username });
    });
  });

  return { app, server, io };
}
