/**
 * Redis cache helpers for room membership lookups.
 * Reduces auth service calls by caching membership checks for 60 seconds.
 */

let redisClient = null;
const DEFAULT_TTL = 60; // seconds

export function setRedisClient(client) {
  redisClient = client;
}

/**
 * Build a cache key for room membership.
 * Key format: room:{roomId}:member:{userId}
 */
function memberKey(roomId, userId) {
  return `room:${roomId}:member:${userId}`;
}

/**
 * Get cached membership result. Returns null if not cached.
 */
export async function getCachedMembership(roomId, userId) {
  if (!redisClient) return null;
  try {
    const val = await redisClient.get(memberKey(roomId, userId));
    if (val === null) return null;
    return val === "1";
  } catch (err) {
    console.warn("[cache] Redis GET error:", err.message);
    return null;
  }
}

/**
 * Cache a membership result (true = member, false = not a member).
 */
export async function setCachedMembership(roomId, userId, isMember, ttl = DEFAULT_TTL) {
  if (!redisClient) return;
  try {
    await redisClient.set(memberKey(roomId, userId), isMember ? "1" : "0", { EX: ttl });
  } catch (err) {
    console.warn("[cache] Redis SET error:", err.message);
  }
}

/**
 * Invalidate membership cache (e.g. on kick/leave).
 */
export async function invalidateMembership(roomId, userId) {
  if (!redisClient) return;
  try {
    await redisClient.del(memberKey(roomId, userId));
  } catch (err) {
    console.warn("[cache] Redis DEL error:", err.message);
  }
}
