import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { sequelize } from "./db.js";
import authRoutes from "./routes/auth.js";
import roomRoutes from "./routes/rooms.js";
import userRoutes from "./routes/users.js";

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
  try {
    await sequelize.authenticate();
    res.json({ ok: true, service: "auth", postgres: true });
  } catch {
    res.status(503).json({ ok: false, service: "auth", postgres: false });
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "test" ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts" },
});

app.use("/api/v1/auth", authLimiter, authRoutes);
app.use("/api/v1/rooms", roomRoutes);
app.use("/api/v1/users", userRoutes);

export default app;
