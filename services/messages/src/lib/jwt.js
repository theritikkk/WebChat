import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

// Refuse to start in production with a weak/default secret
if (process.env.NODE_ENV === "production" && JWT_SECRET === "dev-secret-change-me") {
  console.error(
    "[FATAL] JWT_SECRET is set to the default dev value. " +
    "Set a strong random secret (e.g. openssl rand -hex 64) before running in production."
  );
  process.exit(1);
}

export function getUserFromBearer(req) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return null;
  }
  try {
    const secret = process.env.JWT_SECRET || "dev-secret-change-me";
    const decoded = jwt.verify(token, secret);
    if (decoded.typ === "refresh") {
      return null;
    }
    return { id: decoded.sub, username: decoded.username };
  } catch {
    return null;
  }
}
