import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { messagesRouter } from "./routes/messages.js";
import { register } from "./metrics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../.env") });

export const app = express();

const origins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: origins.length ? origins : true, credentials: true }));
app.use(express.json());
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

app.get("/health", async (_req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  res.status(mongoOk ? 200 : 503).json({ ok: mongoOk, service: "messages", mongo: mongoOk });
});

function internalOnly(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || "";
  const addr = ip.replace(/^::ffff:/, "");
  const isLoopback = addr === "127.0.0.1" || addr === "::1" || addr === "localhost";
  const isPrivate =
    /^10\./.test(addr) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(addr) ||
    /^192\.168\./.test(addr);
  if (isLoopback || isPrivate) return next();
  return res.status(403).json({ error: "Forbidden" });
}

app.get("/metrics", internalOnly, async (_req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

app.use("/api/v1/rooms/:roomId/messages", messagesRouter());

export default app;
