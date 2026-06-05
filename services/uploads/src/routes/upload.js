/**
 * Upload routes — presigned URL generation for direct browser → MinIO uploads.
 *
 * Flow:
 *   1. Client sends  POST /api/v1/upload/presign  { filename, contentType, roomId }
 *   2. Server validates JWT, generates a presigned PUT URL + object key
 *   3. Client PUTs the file directly to MinIO using that URL (no server proxying)
 *   4. Client gets back the public file URL and includes it in the message payload
 *
 * This keeps binary data off the app servers entirely.
 */

import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import jwt from "jsonwebtoken";
import { presignedPutUrl, presignedGetUrl, deleteObject, objectPublicUrl } from "../lib/minio.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

// Allowed MIME types (extend as needed)
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "audio/mpeg",
  "audio/ogg",
  "audio/webm",
  "application/pdf",
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
]);

const MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.typ === "refresh") return res.status(401).json({ error: "Invalid token type" });
    req.user = { id: decoded.sub, email: decoded.email, username: decoded.username };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function uploadsRouter() {
  const router = Router();

  /**
   * POST /api/v1/upload/presign
   *
   * Body: { filename: string, contentType: string, roomId: string, sizeBytes?: number }
   * Returns: { uploadUrl, objectName, fileUrl }
   */
  router.post("/presign", requireAuth, async (req, res) => {
    const { filename, contentType, roomId, sizeBytes } = req.body || {};

    if (!filename || !contentType || !roomId) {
      return res.status(400).json({ error: "filename, contentType, and roomId are required" });
    }

    if (!ALLOWED_TYPES.has(contentType)) {
      return res.status(415).json({ error: `Content type '${contentType}' is not allowed` });
    }

    if (sizeBytes && sizeBytes > MAX_SIZE_BYTES) {
      return res.status(413).json({ error: `File too large (max ${MAX_SIZE_BYTES / 1024 / 1024} MB)` });
    }

    // Build a unique, organised object key
    // Pattern: rooms/{roomId}/{YYYY-MM-DD}/{uuid}{ext}
    const ext  = path.extname(filename).toLowerCase();
    const date = new Date().toISOString().slice(0, 10);
    const objectName = `rooms/${roomId}/${date}/${uuidv4()}${ext}`;

    try {
      const uploadUrl = await presignedPutUrl(objectName);
      const fileUrl   = objectPublicUrl(objectName);

      return res.json({
        uploadUrl,          // PUT directly to this URL with the file body
        objectName,         // store this if you need to delete later
        fileUrl,            // permanent public URL — include in message.file_url
        expiresInSeconds: 300,
      });
    } catch (err) {
      console.error("[uploads] presign error:", err.message);
      return res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  /**
   * GET /api/v1/upload/signed-url?objectName=rooms/abc/...
   *
   * Returns a short-lived GET URL for a private object.
   */
  router.get("/signed-url", requireAuth, async (req, res) => {
    const { objectName } = req.query;
    if (!objectName) return res.status(400).json({ error: "objectName is required" });

    try {
      const url = await presignedGetUrl(objectName);
      return res.json({ url, expiresInSeconds: 3600 });
    } catch (err) {
      console.error("[uploads] signed-url error:", err.message);
      return res.status(500).json({ error: "Failed to generate download URL" });
    }
  });

  /**
   * DELETE /api/v1/upload
   *
   * Body: { objectName: string }
   * Used when a message with an attachment is deleted.
   */
  router.delete("/", requireAuth, async (req, res) => {
    const { objectName } = req.body || {};
    if (!objectName) return res.status(400).json({ error: "objectName is required" });

    try {
      await deleteObject(objectName);
      return res.json({ ok: true });
    } catch (err) {
      console.error("[uploads] delete error:", err.message);
      return res.status(500).json({ error: "Failed to delete object" });
    }
  });

  return router;
}
