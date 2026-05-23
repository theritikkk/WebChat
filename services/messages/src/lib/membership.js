import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || "http://127.0.0.1:3001";

export async function assertRoomMember(authHeader, roomId) {
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }
  const res = await fetch(`${AUTH_SERVICE_URL}/api/v1/rooms/${roomId}`, {
    headers: { Authorization: authHeader }
  });
  return res.ok;
}
