/**
 * Uploads Service
 * ───────────────
 * Express app that handles file upload presigning for MinIO/S3.
 *
 * Clients never POST binary data through this server — they receive a
 * presigned PUT URL and upload directly to MinIO, keeping this service
 * lightweight and stateless.
 */

import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { initMinio } from "./lib/minio.js";
import { uploadsRouter } from "./routes/upload.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const PORT = Number(process.env.PORT_UPLOADS) || 3004;
const origins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",").map((s) => s.trim()).filter(Boolean);

const app = express();
app.use(helmet());
app.use(cors({ origin: origins.length ? origins : true, credentials: true }));
app.use(express.json());
app.use(morgan("dev"));

// ── Health check ───────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true, service: "uploads" }));

// ── Upload routes ──────────────────────────────────────────────────────────────
app.use("/api/v1/upload", uploadsRouter());

// ── 404 fallback ───────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// ── Global error handler ───────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("[uploads] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Bootstrap ──────────────────────────────────────────────────────────────────
async function main() {
  try {
    await initMinio();
  } catch (err) {
    console.warn("[uploads] MinIO unavailable at startup:", err.message);
    console.warn("[uploads] Uploads service will start anyway — MinIO must be up before presigning");
  }

  http.createServer(app).listen(PORT, () => {
    console.log(`[uploads] Uploads service listening on ${PORT}`);
  });
}

main().catch((err) => {
  console.error("[uploads] Fatal startup error:", err);
  process.exit(1);
});
