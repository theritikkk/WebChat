import crypto from "crypto";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../../.env") });

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || "15m";

export function signAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRES });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function hashRefreshToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function randomRefreshToken() {
  return crypto.randomBytes(48).toString("base64url");
}
