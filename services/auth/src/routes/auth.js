import { Router } from "express";
import bcrypt from "bcrypt";
import { body, validationResult } from "express-validator";
import { User, RefreshToken } from "../models/index.js";
import { signAccessToken, hashRefreshToken, randomRefreshToken } from "../lib/tokens.js";
import { verifyJwt } from "../middleware/verifyJwt.js";

const router = Router();
const SALT_ROUNDS = 12;

router.post(
  "/register",
  body("email").isEmail().normalizeEmail(),
  body("username").trim().isLength({ min: 2, max: 64 }),
  body("password").isLength({ min: 8 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { email, username, password } = req.body;
    try {
      const existing = await User.findOne({ where: { email } });
      if (existing) {
        return res.status(409).json({ error: "Email already registered" });
      }
      const taken = await User.findOne({ where: { username } });
      if (taken) {
        return res.status(409).json({ error: "Username taken" });
      }
      const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
      const user = await User.create({ email, username, password_hash, status: "offline" });
      const accessToken = signAccessToken({
        sub: user.id,
        email: user.email,
        username: user.username
      });
      const rawRefresh = randomRefreshToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await RefreshToken.create({
        user_id: user.id,
        token_hash: hashRefreshToken(rawRefresh),
        expires_at: expiresAt
      });
      return res.status(201).json({
        user: { id: user.id, email: user.email, username: user.username, status: user.status },
        accessToken,
        refreshToken: rawRefresh
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Registration failed" });
    }
  }
);

router.post(
  "/login",
  body("email").isEmail().normalizeEmail(),
  body("password").notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { email, password } = req.body;
    try {
      const user = await User.findOne({ where: { email } });
      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const accessToken = signAccessToken({
        sub: user.id,
        email: user.email,
        username: user.username
      });
      const rawRefresh = randomRefreshToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await RefreshToken.create({
        user_id: user.id,
        token_hash: hashRefreshToken(rawRefresh),
        expires_at: expiresAt
      });
      return res.json({
        user: { id: user.id, email: user.email, username: user.username, status: user.status },
        accessToken,
        refreshToken: rawRefresh
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Login failed" });
    }
  }
);

router.post("/refresh", body("refreshToken").notEmpty(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { refreshToken: raw } = req.body;
  try {
    const hash = hashRefreshToken(raw);
    const row = await RefreshToken.findOne({
      where: { token_hash: hash },
      include: [User]
    });
    if (!row || row.expires_at < new Date()) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }
    await row.destroy();
    const user = await User.findByPk(row.user_id);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      username: user.username
    });
    const newRaw = randomRefreshToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await RefreshToken.create({
      user_id: user.id,
      token_hash: hashRefreshToken(newRaw),
      expires_at: expiresAt
    });
    return res.json({ accessToken, refreshToken: newRaw });
  } catch {
    return res.status(401).json({ error: "Invalid refresh token" });
  }
});

router.get("/me", verifyJwt, async (req, res) => {
  const user = await User.findByPk(req.user.id, {
    attributes: ["id", "email", "username", "avatar_url", "status", "last_seen", "created_at"]
  });
  if (!user) {
    return res.status(404).json({ error: "Not found" });
  }
  return res.json(user);
});

export default router;
