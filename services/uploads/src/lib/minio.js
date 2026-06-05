/**
 * MinIO client helper for the Uploads service.
 *
 * Provides:
 *   - initMinio()       — connect and ensure bucket exists
 *   - presignedPutUrl() — generate a time-limited upload URL for the client
 *   - presignedGetUrl() — generate a time-limited download URL
 *   - deleteObject()    — remove an object (e.g. on message delete)
 *   - objectUrl()       — permanent public URL (only if bucket is public)
 */

import { Client } from "minio";

const BUCKET       = process.env.MINIO_BUCKET      || "webchat-uploads";
const ENDPOINT     = process.env.MINIO_ENDPOINT    || "localhost";
const PORT         = Number(process.env.MINIO_PORT) || 9000;
const USE_SSL      = process.env.MINIO_USE_SSL     === "true";
const ACCESS_KEY   = process.env.MINIO_ACCESS_KEY  || "minioadmin";
const SECRET_KEY   = process.env.MINIO_SECRET_KEY  || "minioadmin";
const PUT_TTL      = 300;  // presigned PUT URL valid for 5 minutes
const GET_TTL      = 3600; // presigned GET URL valid for 1 hour

let _client = null;

export async function initMinio() {
  _client = new Client({
    endPoint:        ENDPOINT,
    port:            PORT,
    useSSL:          USE_SSL,
    accessKey:       ACCESS_KEY,
    secretKey:       SECRET_KEY,
  });

  // Ensure our bucket exists
  const exists = await _client.bucketExists(BUCKET);
  if (!exists) {
    await _client.makeBucket(BUCKET, "us-east-1");
    console.log(`[minio] Created bucket: ${BUCKET}`);

    // Allow public GET access (optional; comment out for private buckets)
    const publicPolicy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect:    "Allow",
          Principal: { AWS: ["*"] },
          Action:    ["s3:GetObject"],
          Resource:  [`arn:aws:s3:::${BUCKET}/*`],
        },
      ],
    });
    await _client.setBucketPolicy(BUCKET, publicPolicy);
    console.log(`[minio] Public GET policy applied to: ${BUCKET}`);
  }

  console.log(`[minio] Connected — bucket: ${BUCKET} @ ${ENDPOINT}:${PORT}`);
  return _client;
}

/**
 * Generate a presigned PUT URL so the browser can upload directly to MinIO.
 *
 * @param {string} objectName  - e.g. "rooms/abc123/2024-01-15_uuid.jpg"
 * @returns {string}           - presigned URL valid for PUT_TTL seconds
 */
export async function presignedPutUrl(objectName) {
  if (!_client) throw new Error("MinIO client not initialised");
  return _client.presignedPutObject(BUCKET, objectName, PUT_TTL);
}

/**
 * Generate a presigned GET URL for private-bucket objects.
 *
 * @param {string} objectName
 * @returns {string}
 */
export async function presignedGetUrl(objectName) {
  if (!_client) throw new Error("MinIO client not initialised");
  return _client.presignedGetObject(BUCKET, objectName, GET_TTL);
}

/**
 * Delete an object (e.g. when a message with a file is deleted).
 */
export async function deleteObject(objectName) {
  if (!_client) return;
  try {
    await _client.removeObject(BUCKET, objectName);
  } catch (err) {
    console.warn("[minio] deleteObject error:", err.message);
  }
}

/**
 * Build the permanent public URL for an object.
 * Only works when the bucket has a public GET policy.
 */
export function objectPublicUrl(objectName) {
  const proto = USE_SSL ? "https" : "http";
  return `${proto}://${ENDPOINT}:${PORT}/${BUCKET}/${objectName}`;
}

export function getBucket() { return BUCKET; }
