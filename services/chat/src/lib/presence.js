/**
 * Distributed Presence — Redis-backed.
 *
 * Problem: With multiple Chat service instances behind a load balancer,
 * a user connected to Chat-1 is invisible to Chat-2/3/4 unless we
 * share presence state.
 *
 * Solution: Every connect/disconnect writes to Redis:
 *   Key:  presence:{userId}
 *   Val:  JSON { userId, username, socketId, instance, connectedAt }
 *   TTL:  PRESENCE_TTL (refreshed on heartbeat)
 *
 * Any instance can call getOnlineUsers() or isOnline(userId) to read
 * the full global presence map from Redis.
 */

const PRESENCE_TTL = 300; // seconds — refreshed every ~60 s via heartbeat
const PRESENCE_PREFIX = "presence:";
const PRESENCE_SET = "presence:online"; // sorted set for efficient listing

let _redis = null;

export function initPresence(redisClient) {
  _redis = redisClient;
  console.log("[presence] Distributed presence enabled via Redis");
}

/**
 * Mark a user as online. Call on socket "connection".
 */
export async function setOnline({ userId, username, socketId, instance }) {
  if (!_redis) return;
  try {
    const key = `${PRESENCE_PREFIX}${userId}`;
    const value = JSON.stringify({ userId, username, socketId, instance, connectedAt: Date.now() });
    // Hash entry for individual user lookup
    await _redis.set(key, value, { EX: PRESENCE_TTL });
    // Sorted set — score = timestamp for ordering; used for bulk listing
    await _redis.zAdd(PRESENCE_SET, [{ score: Date.now(), value: userId }]);
  } catch (err) {
    console.warn("[presence] setOnline error:", err.message);
  }
}

/**
 * Mark a user as offline. Call on socket "disconnect".
 * Note: In a multi-instance setup only remove if this instance owns the key.
 */
export async function setOffline({ userId, socketId }) {
  if (!_redis) return;
  try {
    const key = `${PRESENCE_PREFIX}${userId}`;
    const raw = await _redis.get(key);
    if (!raw) return;
    const data = JSON.parse(raw);
    // Only delete if the current socket owns the presence key
    // (prevents race where a reconnect on another instance sets a new key and
    //  the old instance's disconnect wipes it)
    if (data.socketId === socketId) {
      await _redis.del(key);
      await _redis.zRem(PRESENCE_SET, userId);
    }
  } catch (err) {
    console.warn("[presence] setOffline error:", err.message);
  }
}

/**
 * Refresh TTL while a user stays connected (call from a heartbeat interval).
 */
export async function refreshPresence(userId) {
  if (!_redis) return;
  try {
    await _redis.expire(`${PRESENCE_PREFIX}${userId}`, PRESENCE_TTL);
  } catch (err) {
    console.warn("[presence] refreshPresence error:", err.message);
  }
}

/**
 * Check if a specific user is online (any instance).
 * @returns {boolean}
 */
export async function isOnline(userId) {
  if (!_redis) return false;
  try {
    const val = await _redis.get(`${PRESENCE_PREFIX}${userId}`);
    return val !== null;
  } catch {
    return false;
  }
}

/**
 * Get presence data for a specific user.
 * @returns {Object|null}
 */
export async function getPresence(userId) {
  if (!_redis) return null;
  try {
    const raw = await _redis.get(`${PRESENCE_PREFIX}${userId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Get all online user IDs across all instances.
 * Prunes stale entries (whose keys have expired) from the sorted set.
 * @returns {string[]} array of userId strings
 */
export async function getOnlineUserIds() {
  if (!_redis) return [];
  try {
    const candidates = await _redis.zRange(PRESENCE_SET, 0, -1);
    const alive = [];
    for (const userId of candidates) {
      const exists = await _redis.exists(`${PRESENCE_PREFIX}${userId}`);
      if (exists) {
        alive.push(userId);
      } else {
        // Prune stale entry
        await _redis.zRem(PRESENCE_SET, userId).catch(() => {});
      }
    }
    return alive;
  } catch {
    return [];
  }
}
