import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || "http://127.0.0.1:3001";
const MESSAGES_SERVICE_URL = process.env.MESSAGES_SERVICE_URL || "http://127.0.0.1:3003";

export function verifySocketToken(token) {
  if (!token) {
    throw new Error("Missing token");
  }
  const decoded = jwt.verify(token, JWT_SECRET);
  if (decoded.typ === "refresh") {
    throw new Error("Invalid token type");
  }
  return { id: decoded.sub, email: decoded.email, username: decoded.username };
}

export async function assertRoomMember(authBearer, roomId) {
  const res = await fetch(`${AUTH_SERVICE_URL}/api/v1/rooms/${roomId}`, {
    headers: { Authorization: authBearer }
  });
  return res.ok;
}

export async function persistMessage({ roomId, token, content, message_type }) {
  const res = await fetch(`${MESSAGES_SERVICE_URL}/api/v1/rooms/${roomId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content,
      message_type
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Persist failed: ${res.status} ${text}`);
  }
  return res.json();
}
