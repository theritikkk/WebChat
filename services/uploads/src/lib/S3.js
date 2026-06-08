/**
 * AWS S3 client helper for the Uploads service.
 *
 * Drop-in replacement for lib/minio.js — identical exported API:
 *   initS3()            — validate config and ensure bucket exists
 *   presignedPutUrl()   — time-limited upload URL for the browser
 *   presignedGetUrl()   — time-limited download URL (private buckets)
 *   deleteObject()      — remove an object (e.g. on message delete)
 *   objectPublicUrl()   — permanent public URL (public buckets only)
 *
 * Required env vars:
 *   AWS_REGION          e.g. "ap-south-1"
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   S3_BUCKET           e.g. "webchat-videos"
 *
 * Optional:
 *   S3_PUBLIC_BUCKET    "true" — adds a public-read bucket policy on first run
 *                                (leave unset for private + presigned GET URLs)
 *   S3_PUT_TTL_SECONDS  default 300   (5 min)
 *   S3_GET_TTL_SECONDS  default 3600  (1 hr)
 */

import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketCorsCommand,
  PutBucketPolicyCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

// ── Config ─────────────────────────────────────────────────────────────────────
const REGION      = process.env.AWS_REGION            || "ap-south-1";
const BUCKET      = process.env.S3_BUCKET             || "webchat-uploads";
const PUBLIC      = process.env.S3_PUBLIC_BUCKET      === "true";
const PUT_TTL     = Number(process.env.S3_PUT_TTL_SECONDS) || 300;
const GET_TTL     = Number(process.env.S3_GET_TTL_SECONDS) || 3600;

let _client = null;

// ── Init ───────────────────────────────────────────────────────────────────────

export async function initS3() {
  _client = new S3Client({ region: REGION });

  // Check bucket exists (throws if credentials are wrong)
  try {
    await _client.send(new HeadBucketCommand({ Bucket: BUCKET }));
    console.log(`[s3] Bucket exists: s3://${BUCKET} (${REGION})`);
  } catch (err) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      await _client.send(
        new CreateBucketCommand({
          Bucket: BUCKET,
          // us-east-1 must NOT include CreateBucketConfiguration; all others must
          ...(REGION !== "us-east-1" && {
            CreateBucketConfiguration: { LocationConstraint: REGION },
          }),
        })
      );
      console.log(`[s3] Created bucket: s3://${BUCKET}`);
    } else {
      throw err; // bad credentials, network error, etc.
    }
  }

  // CORS — allow browser PUT from your frontend origins
  const corsOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await _client.send(
    new PutBucketCorsCommand({
      Bucket: BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["*"],
            AllowedMethods: ["PUT", "GET", "HEAD"],
            AllowedOrigins: corsOrigins,
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3000,
          },
        ],
      },
    })
  );

  // Optional: make bucket publicly readable (for public video URLs)
  if (PUBLIC) {
    await _client.send(
      new PutBucketPolicyCommand({
        Bucket: BUCKET,
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect:    "Allow",
              Principal: "*",
              Action:    "s3:GetObject",
              Resource:  `arn:aws:s3:::${BUCKET}/*`,
            },
          ],
        }),
      })
    );
    console.log(`[s3] Public GET policy applied to s3://${BUCKET}`);
  }

  console.log(`[s3] Ready — bucket: ${BUCKET}, region: ${REGION}, public: ${PUBLIC}`);
  return _client;
}

// ── Presigned PUT (browser uploads directly to S3) ─────────────────────────────

/**
 * @param {string} objectName  e.g. "rooms/abc123/2024-01-15_uuid.mp4"
 * @returns {Promise<string>}  presigned URL valid for PUT_TTL seconds
 */
export async function presignedPutUrl(objectName) {
  if (!_client) throw new Error("S3 client not initialised");
  const cmd = new PutObjectCommand({ Bucket: BUCKET, Key: objectName });
  return getSignedUrl(_client, cmd, { expiresIn: PUT_TTL });
}

// ── Presigned GET (private bucket downloads) ───────────────────────────────────

/**
 * @param {string} objectName
 * @returns {Promise<string>}  presigned URL valid for GET_TTL seconds
 */
export async function presignedGetUrl(objectName) {
  if (!_client) throw new Error("S3 client not initialised");
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: objectName });
  return getSignedUrl(_client, cmd, { expiresIn: GET_TTL });
}

// ── Delete ─────────────────────────────────────────────────────────────────────

export async function deleteObject(objectName) {
  if (!_client) return;
  try {
    await _client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: objectName }));
  } catch (err) {
    console.warn("[s3] deleteObject error:", err.message);
  }
}

// ── Public URL (only works when S3_PUBLIC_BUCKET=true) ─────────────────────────

export function objectPublicUrl(objectName) {
  // Virtual-hosted-style URL — works for all regions except us-east-1 which
  // also supports it; path-style (s3.amazonaws.com/bucket/key) is deprecated.
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${objectName}`;
}

export function getBucket() { return BUCKET; }