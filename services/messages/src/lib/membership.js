import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { getCachedMembership, setCachedMembership } from "./cache.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || "http://127.0.0.1:3001";

/**
 * Check if the bearer token belongs to a member of roomId.
 * Results are cached in Redis for 60 s to reduce auth-service load.
 */
export async function assertRoomMember(authHeader, roomId) {
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }

  // Extract a stable userId from the token (first 48 chars of payload) for cache key.
  // We don't re-verify here — the auth service does the real check on cache miss.
  const tokenSnippet = authHeader.slice(7, 55);

  const cached = await getCachedMembership(roomId, tokenSnippet);
  if (cached !== null) {
    return cached;
  }

  const res = await fetch(`${AUTH_SERVICE_URL}/api/v1/rooms/${roomId}`, {
    headers: { Authorization: authHeader }
  });

  const isMember = res.ok;
  await setCachedMembership(roomId, tokenSnippet, isMember, 60);
  return isMember;
}
