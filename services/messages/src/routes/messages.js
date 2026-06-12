import { Router } from "express";
import sanitizeHtml from "sanitize-html";
import { Message } from "../models/Message.js";
import { assertRoomMember } from "../lib/membership.js";
import { getUserFromBearer } from "../lib/jwt.js";
import { indexMessage, searchMessages, deleteFromIndex } from "../lib/elastic.js";

/**
 * Sanitize user-supplied message content.
 * Strips all HTML/script tags (XSS prevention) while preserving the plain text.
 * A strict allowlist is used: no tags allowed at all for chat messages.
 */
function sanitizeContent(raw) {
  if (!raw || typeof raw !== "string") return "";
  // Strip ALL HTML — chat messages are plain text
  return sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} }).trim();
}

export function messagesRouter() {
  const router = Router({ mergeParams: true });

  // ─── GET /  — list or search messages ──────────────────────────────────────
  router.get("/", async (req, res) => {
    const { roomId } = req.params;
    const ok = await assertRoomMember(req.headers.authorization, roomId);
    if (!ok) return res.status(403).json({ error: "Forbidden or invalid token" });

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const before = req.query.before;
    const searchQuery = req.query.q?.trim();

    // ── Elasticsearch full-text search ─────────────────────────────────────
    if (searchQuery) {
      const esResults = await searchMessages(roomId, searchQuery, limit);
      if (esResults !== null) {
        return res.json({ messages: esResults, source: "elasticsearch" });
      }
      // Fallback: MongoDB regex
      const q = { room_id: roomId, deleted: false, content: { $regex: searchQuery, $options: "i" } };
      const desc = await Message.find(q).sort({ timestamp: -1 }).limit(limit).lean();
      return res.json({ messages: desc.reverse(), source: "mongodb-fallback" });
    }

    // ── Paginated history ──────────────────────────────────────────────────
    const q = { room_id: roomId, deleted: false };
    if (before) q.timestamp = { $lt: new Date(before) };

    const desc = await Message.find(q).sort({ timestamp: -1 }).limit(limit).lean();
    const chronological = desc.reverse();
    return res.json({
      messages: chronological,
      nextBefore: chronological.length ? chronological[0].timestamp : null
    });
  });

  // ─── POST /  — create a message ────────────────────────────────────────────
  router.post("/", async (req, res) => {
    const { roomId } = req.params;
    const ok = await assertRoomMember(req.headers.authorization, roomId);
    if (!ok) return res.status(403).json({ error: "Forbidden or invalid token" });

    const user = getUserFromBearer(req);
    if (!user?.id) return res.status(401).json({ error: "Invalid token" });

    const { content = "", message_type = "text", file_url } = req.body;
    const sanitized = sanitizeContent(content);
    const doc = await Message.create({
      room_id: roomId,
      user_id: user.id,
      username: user.username,
      message_type,
      content: sanitized,
      file_url,
      status: "sent"
    });

    // Index in Elasticsearch (non-blocking, best-effort)
    indexMessage(doc).catch(() => {});

    return res.status(201).json(doc);
  });

  // ─── PATCH /:messageId/ack  — delivery acknowledgement ─────────────────────
  router.patch("/:messageId/ack", async (req, res) => {
    const { roomId, messageId } = req.params;
    const ok = await assertRoomMember(req.headers.authorization, roomId);
    if (!ok) return res.status(403).json({ error: "Forbidden" });

    const user = getUserFromBearer(req);
    if (!user?.id) return res.status(401).json({ error: "Invalid token" });

    const now = new Date();
    const msg = await Message.findOneAndUpdate(
      { _id: messageId, room_id: roomId, "deliveries.user_id": { $ne: user.id } },
      {
        $push: { deliveries: { user_id: user.id, delivered_at: now } },
        $set: { status: "delivered" }
      },
      { new: true }
    );

    // If the delivery record already exists, just update delivered_at
    if (!msg) {
      await Message.updateOne(
        { _id: messageId, room_id: roomId, "deliveries.user_id": user.id },
        { $set: { "deliveries.$.delivered_at": now }, status: "delivered" }
      );
    }

    return res.json({ ok: true, status: "delivered", at: now });
  });

  // ─── PATCH /:messageId/read  — read receipt ────────────────────────────────
  router.patch("/:messageId/read", async (req, res) => {
    const { roomId, messageId } = req.params;
    const ok = await assertRoomMember(req.headers.authorization, roomId);
    if (!ok) return res.status(403).json({ error: "Forbidden" });

    const user = getUserFromBearer(req);
    if (!user?.id) return res.status(401).json({ error: "Invalid token" });

    const now = new Date();

    // Upsert: if no delivery record yet, insert one; otherwise update readAt
    const existing = await Message.findOne({
      _id: messageId,
      room_id: roomId,
      "deliveries.user_id": user.id
    });

    if (existing) {
      await Message.updateOne(
        { _id: messageId, "deliveries.user_id": user.id },
        {
          $set: {
            "deliveries.$.read_at": now,
            "deliveries.$.delivered_at": now,
            status: "read"
          }
        }
      );
    } else {
      await Message.updateOne(
        { _id: messageId, room_id: roomId },
        {
          $push: { deliveries: { user_id: user.id, delivered_at: now, read_at: now } },
          $set: { status: "read" }
        }
      );
    }

    return res.json({ ok: true, status: "read", at: now });
  });

  // PATCH /:messageId — edit message (author only)
  router.patch("/:messageId", async (req, res) => {
    const { roomId, messageId } = req.params;
    const ok = await assertRoomMember(req.headers.authorization, roomId);
    if (!ok) return res.status(403).json({ error: "Forbidden" });

    const user = getUserFromBearer(req);
    if (!user?.id) return res.status(401).json({ error: "Invalid token" });

    const { content } = req.body || {};
    if (!content?.trim()) return res.status(400).json({ error: "content required" });
    const sanitized = sanitizeContent(content);
    if (!sanitized) return res.status(400).json({ error: "content required" });

    const msg = await Message.findOneAndUpdate(
      { _id: messageId, room_id: roomId, user_id: user.id, deleted: false },
      { $set: { content: sanitized, edited: true } },
      { new: true }
    );
    if (!msg) return res.status(404).json({ error: "Message not found" });
    indexMessage(msg).catch(() => {});
    return res.json(msg);
  });

  // DELETE /:messageId — soft delete (author only)
  router.delete("/:messageId", async (req, res) => {
    const { roomId, messageId } = req.params;
    const ok = await assertRoomMember(req.headers.authorization, roomId);
    if (!ok) return res.status(403).json({ error: "Forbidden" });

    const user = getUserFromBearer(req);
    if (!user?.id) return res.status(401).json({ error: "Invalid token" });

    const msg = await Message.findOneAndUpdate(
      { _id: messageId, room_id: roomId, user_id: user.id, deleted: false },
      { $set: { deleted: true, content: "" } },
      { new: true }
    );
    if (!msg) return res.status(404).json({ error: "Message not found" });
    deleteFromIndex(messageId).catch(() => {});
    return res.json({ ok: true, id: messageId });
  });

  return router;
}
