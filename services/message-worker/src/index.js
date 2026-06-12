/**
 * Message Worker Service
 * ─────────────────────
 * Consumes message-persist jobs from RabbitMQ and:
 *   1. Saves the message to MongoDB
 *   2. Indexes the message in Elasticsearch (best-effort)
 *
 * Architecture:
 *   Chat Service  →  RabbitMQ (webchat.messages exchange)  →  THIS WORKER  →  MongoDB + ES
 *
 * Benefits over synchronous HTTP persist:
 *   - Chat service is never blocked waiting for Mongo writes
 *   - Worker can be scaled independently
 *   - Messages are durable in RabbitMQ if Mongo is temporarily down
 *   - Dead-letter queue catches messages that fail after N retries
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import amqplib from "amqplib";
import mongoose from "mongoose";
import { createClient } from "redis";
import { Client as ESClient } from "@elastic/elasticsearch";
import sanitizeHtml from "sanitize-html";

/**
 * Sanitize user-supplied message content before persisting.
 * Strips ALL HTML tags — chat messages are plain text.
 */
function sanitizeContent(raw) {
  if (!raw || typeof raw !== "string") return "";
  return sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} }).trim();
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../.env") });

// ── Config ─────────────────────────────────────────────────────────────────────
const RABBITMQ_URL   = process.env.RABBITMQ_URL   || "amqp://guest:guest@localhost:5672";
const MONGO_URI      = process.env.MONGO_URI       || "mongodb://127.0.0.1:27017/webchat";
const ES_URL         = process.env.ELASTICSEARCH_URL || "http://127.0.0.1:9200";
const ES_INDEX       = process.env.ES_INDEX        || "webchat-messages";
const REDIS_URL      = process.env.REDIS_URL;
const CONFIRM_CHANNEL = "webchat:message:persisted";
const EXCHANGE       = "webchat.messages";
const QUEUE          = "messages.persist";
const DLX_EXCHANGE   = "webchat.messages.dlx";
const DLX_QUEUE      = "messages.persist.dead";
const ROUTING_KEY    = "message.persist";
const PREFETCH       = 10;  // process up to 10 messages concurrently
const MAX_RETRIES    = 3;   // nack → DLQ after this many attempts

// ── MongoDB Message Schema ──────────────────────────────────────────────────────
const deliverySchema = new mongoose.Schema(
  {
    user_id:      { type: String, required: true },
    delivered_at: { type: Date },
    read_at:      { type: Date },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    room_id:      { type: String, required: true, index: true },
    user_id:      { type: String, required: true },
    username:     { type: String },
    message_type: { type: String, enum: ["text", "image", "file", "system"], default: "text" },
    content:      { type: String, default: "" },
    file_url:     { type: String },
    edited:       { type: Boolean, default: false },
    deleted:      { type: Boolean, default: false },
    deliveries:   { type: [deliverySchema], default: [] },
    status:       { type: String, enum: ["sent", "delivered", "read"], default: "sent" },
    // Track that this came via the queue (useful for debugging)
    _via_queue:   { type: Boolean, default: true },
  },
  { timestamps: { createdAt: "timestamp", updatedAt: "updated_at" } }
);

messageSchema.index({ room_id: 1, timestamp: -1 });

let Message;

// ── Redis publisher (notify chat service of persisted messages) ───────────────
let redisPub = null;

async function initRedis() {
  if (!REDIS_URL) return;
  try {
    redisPub = createClient({ url: REDIS_URL });
    redisPub.on("error", (err) => console.warn("[worker] Redis error:", err.message));
    await redisPub.connect();
    console.log("[worker] Redis publisher connected");
  } catch (err) {
    console.warn("[worker] Redis unavailable:", err.message);
    redisPub = null;
  }
}

async function notifyMessageConfirmed(tempId, roomId, doc) {
  if (!redisPub || !tempId) return;
  try {
    await redisPub.publish(CONFIRM_CHANNEL, JSON.stringify({
      tempId,
      roomId,
      message: {
        _id:          doc._id.toString(),
        room_id:      doc.room_id,
        user_id:      doc.user_id,
        username:     doc.username,
        content:      doc.content,
        message_type: doc.message_type,
        file_url:     doc.file_url,
        status:       doc.status || "sent",
        timestamp:    doc.timestamp,
      },
    }));
  } catch (err) {
    console.warn("[worker] Redis publish error:", err.message);
  }
}

// ── Elasticsearch client ────────────────────────────────────────────────────────
let esClient = null;

async function initElastic() {
  try {
    esClient = new ESClient({ node: ES_URL });
    await esClient.ping();
    // Ensure index exists
    const exists = await esClient.indices.exists({ index: ES_INDEX });
    if (!exists) {
      await esClient.indices.create({
        index: ES_INDEX,
        body: {
          mappings: {
            properties: {
              room_id:   { type: "keyword" },
              user_id:   { type: "keyword" },
              username:  { type: "keyword" },
              content:   { type: "text", analyzer: "standard" },
              timestamp: { type: "date" },
              message_type: { type: "keyword" },
            },
          },
        },
      });
    }
    console.log("[worker] Elasticsearch connected:", ES_URL);
  } catch (err) {
    console.warn("[worker] Elasticsearch unavailable:", err.message);
    esClient = null;
  }
}

async function indexInES(doc) {
  if (!esClient) return;
  try {
    await esClient.index({
      index: ES_INDEX,
      id: doc._id.toString(),
      document: {
        room_id:      doc.room_id,
        user_id:      doc.user_id,
        username:     doc.username,
        content:      doc.content,
        message_type: doc.message_type,
        file_url:     doc.file_url,
        timestamp:    doc.timestamp,
      },
    });
  } catch (err) {
    console.warn("[worker] ES index error:", err.message);
  }
}

// ── RabbitMQ consumer ───────────────────────────────────────────────────────────
async function connectAndConsume() {
  console.log("[worker] Connecting to RabbitMQ:", RABBITMQ_URL);
  const conn = await amqplib.connect(RABBITMQ_URL);

  conn.on("error", (err) => {
    console.error("[worker] RabbitMQ connection error:", err.message);
    setTimeout(main, 5_000);
  });
  conn.on("close", () => {
    console.warn("[worker] RabbitMQ connection closed — reconnecting …");
    setTimeout(main, 5_000);
  });

  const ch = await conn.createChannel();
  ch.prefetch(PREFETCH);

  // ── Dead-letter exchange / queue ──────────────────────────────────────────
  await ch.assertExchange(DLX_EXCHANGE, "direct", { durable: true });
  await ch.assertQueue(DLX_QUEUE, { durable: true });
  await ch.bindQueue(DLX_QUEUE, DLX_EXCHANGE, ROUTING_KEY);

  // ── Main exchange / queue ─────────────────────────────────────────────────
  await ch.assertExchange(EXCHANGE, "direct", { durable: true });
  await ch.assertQueue(QUEUE, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange":    DLX_EXCHANGE,
      "x-dead-letter-routing-key": ROUTING_KEY,
      "x-message-ttl":             600_000, // 10 min — allow backlog under load
    },
  });
  await ch.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);

  console.log("[worker] Waiting for messages on queue:", QUEUE);

  ch.consume(QUEUE, async (msg) => {
    if (!msg) return;

    let payload;
    try {
      payload = JSON.parse(msg.content.toString());
    } catch {
      console.warn("[worker] Invalid JSON in message — nacking to DLQ");
      ch.nack(msg, false, false);
      return;
    }

    const retries = (msg.properties.headers?.["x-retry-count"] || 0);

    try {
      const doc = await Message.create({
        room_id:      payload.roomId,
        user_id:      payload.userId,
        username:     payload.username,
        message_type: payload.message_type || "text",
        content:      sanitizeContent(payload.content || ""),
        file_url:     payload.file_url,
        status:       "sent",
        _via_queue:   true,
      });

      // Best-effort ES index (non-blocking)
      indexInES(doc).catch(() => {});

      // Notify chat service to swap temp IDs for real Mongo IDs
      await notifyMessageConfirmed(payload.tempId, payload.roomId, doc);

      ch.ack(msg);
      console.log(`[worker] Persisted message ${doc._id} for room ${payload.roomId}`);
    } catch (err) {
      console.error("[worker] Failed to persist message:", err.message);

      if (retries >= MAX_RETRIES) {
        console.warn(`[worker] Max retries (${MAX_RETRIES}) reached — sending to DLQ`);
        ch.nack(msg, false, false);
      } else {
        const headers = { ...(msg.properties.headers || {}), "x-retry-count": retries + 1 };
        ch.publish(EXCHANGE, ROUTING_KEY, msg.content, {
          persistent: true,
          headers,
        });
        ch.ack(msg);
      }
    }
  });
}

// ── Bootstrap ───────────────────────────────────────────────────────────────────
async function main() {
  try {
    // MongoDB
    await mongoose.connect(MONGO_URI);
    Message = mongoose.model("Message", messageSchema);
    console.log("[worker] MongoDB connected");

    // Elasticsearch
    await initElastic();

    // Redis (message confirmation pub/sub)
    await initRedis();

    // RabbitMQ
    await connectAndConsume();
  } catch (err) {
    console.error("[worker] Startup error:", err.message);
    setTimeout(main, 10_000);
  }
}

main();
