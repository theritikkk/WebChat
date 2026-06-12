import "./tracing.js"; // must be first — patches Node http/net before other imports
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

const PORT    = Number(process.env.PORT_CHAT) || 5000;
const CONFIRM_CHANNEL = "webchat:message:persisted";
const origins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",").map((s) => s.trim()).filter(Boolean);

// Unique instance identifier for distributed presence
const INSTANCE_ID = process.env.HOSTNAME || `chat-${Math.random().toString(36).slice(2, 8)}`;

const app = express();
app.use(helmet());
app.use(cors({ origin: origins.length ? origins : true }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => res.json({ ok: true, service: "chat", instance: INSTANCE_ID }));

// ── Internal-only guard for /metrics ──────────────────────────────────────────
// Accepts requests from: loopback (127.x, ::1) and RFC-1918 private ranges.
// In Kubernetes, pods communicate over private CIDR so this works cluster-wide.
function internalOnly(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || "";
  // Strip IPv6-mapped IPv4 prefix (::ffff:127.0.0.1 → 127.0.0.1)
  const addr = ip.replace(/^::ffff:/, "");
  const isLoopback = addr === "127.0.0.1" || addr === "::1" || addr === "localhost";
  const isPrivate =
    /^10\./.test(addr) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(addr) ||
    /^192\.168\./.test(addr);
  if (isLoopback || isPrivate) return next();
  return res.status(403).json({ error: "Forbidden" });
}

// ── Prometheus metrics endpoint (internal only) ───────────────────────────────
app.get("/metrics", internalOnly, async (_req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// ── JWT bearer middleware for presence HTTP endpoints ─────────────────────────
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

// ── Presence HTTP endpoints (authenticated) ───────────────────────────────────
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

// ── Redis setup: Socket.io adapter + auth cache + presence ────────────────────
const redisUrl = process.env.REDIS_URL;
let presenceRedis = null;

if (redisUrl) {
  // Socket.io Redis adapter (pub/sub for cross-instance socket events)
  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();
  Promise.all([pubClient.connect(), subClient.connect()])
    .then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      console.log("[chat] Socket.io Redis adapter enabled");
    })
    .catch((err) => console.warn("[chat] Redis adapter disabled:", err.message));

  // Separate Redis client for auth membership cache
  initAuthRedis(redisUrl);

  // Separate Redis client for distributed presence
  presenceRedis = createClient({ url: redisUrl });
  presenceRedis.on("error", (err) => console.warn("[chat] Presence Redis error:", err.message));
  presenceRedis.connect()
    .then(async () => {
      initPresence(presenceRedis);
      console.log("[chat] Distributed presence enabled");

      // Subscribe to worker confirmations (swap temp message IDs)
      const subClient = presenceRedis.duplicate();
      await subClient.connect();
      await subClient.subscribe(CONFIRM_CHANNEL, (raw) => {
        try {
          const { tempId, roomId, message } = JSON.parse(raw);
          if (!roomId || !message?._id) return;
          io.to(roomId).emit("message_confirmed", { tempId, message });
        } catch (err) {
          console.warn("[chat] message_confirmed parse error:", err.message);
        }
      });
      console.log("[chat] Message confirmation subscriber enabled");
    })
    .catch((err) => console.warn("[chat] Presence Redis unavailable:", err.message));
}

// ── RabbitMQ publisher (message queue) ───────────────────────────────────────
const rabbitUrl = process.env.RABBITMQ_URL;
if (rabbitUrl) {
  initRabbitMQ(rabbitUrl).then((ok) => {
    if (ok) console.log("[chat] RabbitMQ message queue enabled");
    else    console.warn("[chat] RabbitMQ unavailable — falling back to HTTP persist");
  });
}

// ── Socket.io auth middleware ─────────────────────────────────────────────────
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

// ── Active WebRTC calls tracker ───────────────────────────────────────────────
const activeCalls = new Map();

// ── Presence heartbeat interval (60 s) ───────────────────────────────────────
const HEARTBEAT_INTERVAL = 60_000;

io.on("connection", (socket) => {
  const { user, token } = socket.data;
  const authHeader = `Bearer ${token}`;

  socketConnections.inc();
  socketConnectionsTotal.inc();

  // ── Distributed presence: mark online ───────────────────────────────────
  setOnline({
    userId:   user.id,
    username: user.username,
    socketId: socket.id,
    instance: INSTANCE_ID,
  }).catch(() => {});

  io.emit("user_online", { user_id: user.id, username: user.username });

  // Presence heartbeat — refreshes Redis TTL while socket stays open
  const heartbeat = setInterval(() => {
    refreshPresence(user.id).catch(() => {});
  }, HEARTBEAT_INTERVAL);

  // ── Room management ──────────────────────────────────────────────────────
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

  // ── Send message (RabbitMQ queue or HTTP fallback) ───────────────────────
  socket.on("send_message", async (payload, cb) => {
    const { roomId, content, message_type = "text", file_url } = payload || {};
    if (!roomId || !socket.rooms.has(roomId)) return cb?.({ error: "Not in room" });

    try {
      // Build a temporary client-side ID so the sender sees the message instantly
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

      // Emit optimistically so all room members see the message immediately
      io.to(roomId).emit("receive_message", { ...optimisticMsg, status: "sent" });
      messagesSentTotal.inc({ room_id: roomId });

      // ── Persist via RabbitMQ (preferred) or HTTP (fallback) ───────────
      const queued = isRabbitMQReady() && publishMessage({
        roomId,
        userId:       user.id,
        username:     user.username,
        content:      content ?? "",
        message_type,
        file_url,
        tempId,       // worker can include this in response for deduplication
      });

      if (!queued) {
        // Synchronous HTTP fallback (original behaviour)
        const end   = messagePersistDuration.startTimer();
        const saved = await persistMessage({
          roomId, token, content: content ?? "", message_type, file_url
        });
        end();
        // Replace temp message with real persisted one
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

  // ── Delivery acknowledgement ─────────────────────────────────────────────
  socket.on("message_ack", async (payload) => {
    const { messageId, roomId } = payload || {};
    if (!messageId || !roomId) return;
    try {
      await ackMessageDelivered({ roomId, messageId, token });
      messagesDeliveredTotal.inc();
      socket.to(roomId).emit("message_status", {
        message_id: messageId, user_id: user.id, status: "delivered"
      });
    } catch (e) {
      console.warn("[chat] message_ack error:", e.message);
    }
  });

  // ── Read receipt ─────────────────────────────────────────────────────────
  socket.on("mark_read", async (payload) => {
    const { messageId, roomId } = payload || {};
    if (!messageId || !roomId) return;
    try {
      await ackMessageRead({ roomId, messageId, token });
      messagesReadTotal.inc();
      socket.to(roomId).emit("message_status", {
        message_id: messageId, user_id: user.id, status: "read"
      });
    } catch (e) {
      console.warn("[chat] mark_read error:", e.message);
    }
  });

  // ── Typing indicators ────────────────────────────────────────────────────
  socket.on("typing_start", (payload) => {
    const roomId = typeof payload === "string" ? payload : payload?.roomId;
    if (!roomId || !socket.rooms.has(roomId)) return;
    socket.to(roomId).emit("user_typing", {
      user_id: user.id, username: user.username, room_id: roomId, typing: true
    });
  });

  socket.on("typing_stop", (payload) => {
    const roomId = typeof payload === "string" ? payload : payload?.roomId;
    if (!roomId || !socket.rooms.has(roomId)) return;
    socket.to(roomId).emit("user_typing", {
      user_id: user.id, username: user.username, room_id: roomId, typing: false
    });
  });

  // ── Presence query ───────────────────────────────────────────────────────
  socket.on("presence_check", async (payload, cb) => {
    const { userId } = payload || {};
    if (!userId) return cb?.({ error: "userId required" });
    const online = await isOnline(userId);
    cb?.({ userId, online });
  });

  socket.on("presence_list", async (_payload, cb) => {
    const userIds = await getOnlineUserIds();
    cb?.({ onlineCount: userIds.length, userIds });
  });

  // ── WebRTC Signaling ─────────────────────────────────────────────────────
  socket.on("call_offer", (payload) => {
    const { targetUserId, roomId, offer, callId } = payload || {};
    if (!targetUserId || !offer) return;
    webrtcCallsTotal.inc();
    activeCalls.set(callId, new Set([socket.id]));
    webrtcCallsActive.set(activeCalls.size);
    socket.to(roomId || targetUserId).emit("call_offer", {
      from_user_id: user.id, from_username: user.username, call_id: callId, offer
    });
  });

  socket.on("call_answer", (payload) => {
    const { callId, targetUserId, roomId, answer } = payload || {};
    if (!answer) return;
    if (activeCalls.has(callId)) activeCalls.get(callId).add(socket.id);
    socket.to(roomId || targetUserId).emit("call_answer", {
      from_user_id: user.id, call_id: callId, answer
    });
  });

  socket.on("call_ice_candidate", (payload) => {
    const { callId, targetUserId, roomId, candidate } = payload || {};
    if (!candidate) return;
    socket.to(roomId || targetUserId).emit("call_ice_candidate", {
      from_user_id: user.id, call_id: callId, candidate
    });
  });

  socket.on("call_end", (payload) => {
    const { callId, roomId, targetUserId } = payload || {};
    activeCalls.delete(callId);
    webrtcCallsActive.set(activeCalls.size);
    socket.to(roomId || targetUserId).emit("call_end", {
      from_user_id: user.id, call_id: callId
    });
  });

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    clearInterval(heartbeat);
    socketConnections.dec();

    // Distributed presence: mark offline
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

server.listen(PORT, () => {
  console.log(`[chat] Socket.io service listening on ${PORT} (instance: ${INSTANCE_ID})`);
});
