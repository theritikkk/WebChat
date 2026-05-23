import { Router } from "express";
import { body, param, validationResult } from "express-validator";
import { Room, RoomMember, User } from "../models/index.js";
import { verifyJwt } from "../middleware/verifyJwt.js";

const router = Router();
router.use(verifyJwt);

router.post(
  "/",
  body("name").trim().isLength({ min: 1, max: 128 }),
  body("room_type").optional().isIn(["public", "private", "direct"]),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { name, room_type = "public" } = req.body;
    const room = await Room.create({
      name,
      room_type,
      created_by: req.user.id
    });
    await RoomMember.create({
      room_id: room.id,
      user_id: req.user.id,
      role: "admin"
    });
    return res.status(201).json(room);
  }
);

router.get("/", async (req, res) => {
  const memberships = await RoomMember.findAll({
    where: { user_id: req.user.id },
    include: [{ model: Room, required: true }]
  });
  const rooms = memberships.map((m) => ({
    ...m.Room.toJSON(),
    role: m.role,
    joined_at: m.joined_at
  }));
  return res.json(rooms);
});

router.post(
  "/:roomId/join",
  param("roomId").isUUID(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { roomId } = req.params;
    const room = await Room.findByPk(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    if (room.room_type === "private") {
      return res.status(403).json({ error: "Private room — invite required" });
    }
    const [member, created] = await RoomMember.findOrCreate({
      where: { room_id: roomId, user_id: req.user.id },
      defaults: { role: "member", joined_at: new Date() }
    });
    return res.status(created ? 201 : 200).json(member);
  }
);

router.get("/:roomId/members", param("roomId").isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { roomId } = req.params;
  const allowed = await RoomMember.findOne({ where: { room_id: roomId, user_id: req.user.id } });
  if (!allowed) {
    return res.status(403).json({ error: "Not a member of this room" });
  }
  const rows = await RoomMember.findAll({
    where: { room_id: roomId },
    include: [{ model: User, attributes: ["id", "username", "avatar_url", "status", "last_seen"] }]
  });
  return res.json(
    rows.map((r) => ({
      user_id: r.user_id,
      role: r.role,
      joined_at: r.joined_at,
      user: r.User
    }))
  );
});

router.get("/:roomId", param("roomId").isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { roomId } = req.params;
  const member = await RoomMember.findOne({ where: { room_id: roomId, user_id: req.user.id } });
  if (!member) {
    return res.status(403).json({ error: "Not a member" });
  }
  const room = await Room.findByPk(roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }
  return res.json({ ...room.toJSON(), role: member.role });
});

export default router;
