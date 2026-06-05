import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { createClient } from "redis";
import { messagesRouter } from "./routes/messages.js";
import { setRedisClient } from "./lib/cache.js";
import { initElastic } from "./lib/elastic.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const app = express();
const PORT = Number(process.env.PORT_MESSAGES) || 3003;

const origins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({ origin: origins.length ? origins : true, credentials: true }));
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (_req, res) => res.json({ ok: true, service: "messages" }));

app.use("/api/v1/rooms/:roomId/messages", messagesRouter());

async function main() {
  // ── MongoDB ──────────────────────────────────────────────────────────────
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/webchat";
  await mongoose.connect(uri);
  console.log("[messages] MongoDB connected");

  // ── Redis (optional, for membership cache) ───────────────────────────────
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const redis = createClient({ url: redisUrl });
      redis.on("error", (err) => console.warn("[messages] Redis error:", err.message));
      await redis.connect();
      setRedisClient(redis);
      console.log("[messages] Redis cache connected");
    } catch (err) {
      console.warn("[messages] Redis unavailable — running without cache:", err.message);
    }
  }

  // ── Elasticsearch (optional, for full-text search) ───────────────────────
  await initElastic();

  app.listen(PORT, () => {
    console.log(`Messages service listening on ${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
