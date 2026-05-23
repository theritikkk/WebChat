import { Router } from "express";
import { Message } from "../models/Message.js";
import { assertRoomMember } from "../lib/membership.js";
import { getUserFromBearer } from "../lib/jwt.js";

export function messagesRouter() {
  const router = Router({ mergeParams: true });

  router.get("/", async (req, res) => {
    const { roomId } = req.params;
    const ok = await assertRoomMember(req.headers.authorization, roomId);
    if (!ok) {
      return res.status(403).json({ error: "Forbidden or invalid token" });
    }
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const before = req.query.before;
    const q = { room_id: roomId, deleted: false };
    if (before) {
      q.timestamp = { $lt: new Date(before) };
    }
    const search = req.query.q?.trim();
    if (search) {
      q.content = { $regex: search, $options: "i" };
    }
    const desc = await Message.find(q).sort({ timestamp: -1 }).limit(limit).lean();
    const chronological = desc.reverse();
    return res.json({
      messages: chronological,
      nextBefore: chronological.length ? chronological[0].timestamp : null
    });
  });

  router.post("/", async (req, res) => {
    const { roomId } = req.params;
    const ok = await assertRoomMember(req.headers.authorization, roomId);
    if (!ok) {
      return res.status(403).json({ error: "Forbidden or invalid token" });
    }
    const user = getUserFromBearer(req);
    if (!user?.id) {
      return res.status(401).json({ error: "Invalid token" });
    }
    const { content = "", message_type = "text", file_url } = req.body;
    const doc = await Message.create({
      room_id: roomId,
      user_id: user.id,
      username: user.username,
      message_type,
      content,
      file_url
    });
    return res.status(201).json(doc);
  });

  return router;
}
