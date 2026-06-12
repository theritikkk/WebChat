import "./tracing.js"; // must be first — patches Node http/net before other imports
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { sequelize } from "./db.js";
import { User, Room, RoomMember, RefreshToken } from "./models/index.js";
import { runMigrations } from "./lib/migrate.js";
import authRoutes from "./routes/auth.js";
import roomRoutes from "./routes/rooms.js";
import userRoutes from "./routes/users.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const app = express();
const PORT = Number(process.env.PORT_AUTH) || 3001;

const origins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({ origin: origins.length ? origins : true, credentials: true }));
app.use(express.json());
app.use(morgan("dev"));

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
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts" },
});

app.use("/api/v1/auth", authLimiter, authRoutes);
app.use("/api/v1/rooms", roomRoutes);
app.use("/api/v1/users", userRoutes);

async function main() {
  // Run SQL migrations (safe to re-run — already-applied ones are skipped)
  await runMigrations(sequelize);
  app.listen(PORT, () => {
    console.log(`Auth service listening on ${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
