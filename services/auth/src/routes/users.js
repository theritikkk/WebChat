import { Router } from "express";
import { param, validationResult } from "express-validator";
import { User } from "../models/index.js";
import { verifyJwt } from "../middleware/verifyJwt.js";

const router = Router();

router.get("/:id", verifyJwt, param("id").isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const user = await User.findByPk(req.params.id, {
    attributes: ["id", "username", "avatar_url", "status", "last_seen", "created_at"]
  });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  return res.json(user);
});

export default router;
