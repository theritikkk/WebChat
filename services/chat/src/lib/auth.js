import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { createClient } from "redis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || "http://127.0.0.1:3001";
const MESSAGES_SERVICE_URL = process.env.MESSAGES_SERVICE_URL || "http://127.0.0.1:3003";
const REDIS_TTL = 60; // seconds

// Refuse to start in production with a weak/default secret
if (process.env.NODE_ENV === "production" && JWT_SECRET === "dev-secret-change-me") {
  console.error(
    "[FATAL] JWT_SECRET is set to the default dev value. " +
    "Set a strong random secret (e.g. openssl rand -hex 64) before running in production."
  );
  process.exit(1);
}

// Shared Redis client for room-membership cache (set after connect)
let _redis = null;

export function setAuthRedisClient(client) {
  _redis = client;
}

export function verifySocketToken(token) {
  if (!token) throw new Error("Missing token");
  const decoded = jwt.verify(token, JWT_SECRET);
  if (decoded.typ === "refresh") throw new Error("Invalid token type");
  return { id: decoded.sub, email: decoded.email, username: decoded.username };
}

/**
 * Check room membership — Redis-cached for REDIS_TTL seconds.
 * Key: room:{roomId}:member:{userId}
 */
export async function assertRoomMember(authBearer, roomId, userId) {
  const cacheKey = `room:${roomId}:member:${userId ?? authBearer.slice(7, 55)}`;

  if (_redis) {
    try {
      const cached = await _redis.get(cacheKey);
      if (cached !== null) return cached === "1";
    } catch {
      // Redis error — proceed with live check
    }
  }

  const res = await fetch(`${AUTH_SERVICE_URL}/api/v1/rooms/${roomId}`, {
    headers: { Authorization: authBearer }
  });
  const isMember = res.ok;

  if (_redis) {
    try {
      await _redis.set(cacheKey, isMember ? "1" : "0", { EX: REDIS_TTL });
    } catch {
      // Non-fatal
    }
  }

  return isMember;
}

export async function persistMessage({ roomId, token, content, message_type, file_url }) {
  const res = await fetch(`${MESSAGES_SERVICE_URL}/api/v1/rooms/${roomId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ content, message_type, file_url })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Persist failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function ackMessageDelivered({ roomId, messageId, token }) {
  try {
    await fetch(`${MESSAGES_SERVICE_URL}/api/v1/rooms/${roomId}/messages/${messageId}/ack`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    });
  } catch (err) {
    console.warn("[chat] ack delivery failed:", err.message);
  }
}

export async function ackMessageRead({ roomId, messageId, token }) {
  try {
    await fetch(`${MESSAGES_SERVICE_URL}/api/v1/rooms/${roomId}/messages/${messageId}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    });
  } catch (err) {
    console.warn("[chat] ack read failed:", err.message);
  }
}

export async function initAuthRedis(redisUrl) {
  if (!redisUrl) return null;
  try {
    const client = createClient({ url: redisUrl });
    client.on("error", (err) => console.warn("[chat-auth] Redis error:", err.message));
    await client.connect();
    setAuthRedisClient(client);
    console.log("[chat-auth] Redis cache connected");
    return client;
  } catch (err) {
    console.warn("[chat-auth] Redis unavailable:", err.message);
    return null;
  }
}
