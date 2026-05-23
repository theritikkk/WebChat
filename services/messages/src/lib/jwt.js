import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export function getUserFromBearer(req) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return null;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.typ === "refresh") {
      return null;
    }
    return { id: decoded.sub, username: decoded.username };
  } catch {
    return null;
  }
}
