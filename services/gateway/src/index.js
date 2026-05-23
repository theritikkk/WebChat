import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createProxyMiddleware } from "http-proxy-middleware";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const PORT = Number(process.env.PORT_GATEWAY) || 4000;
const AUTH_URL = process.env.AUTH_SERVICE_URL || "http://127.0.0.1:3001";
const MESSAGES_URL = process.env.MESSAGES_SERVICE_URL || "http://127.0.0.1:3003";

const origins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: origins.length ? origins : true, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("combined"));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      return auth.slice(7, 48);
    }
    return req.ip || "unknown";
  }
});
app.use("/api/", limiter);

const messagesProxy = createProxyMiddleware({
  target: MESSAGES_URL,
  changeOrigin: true
});

const authRoomsProxy = createProxyMiddleware({
  target: AUTH_URL,
  changeOrigin: true
});

app.get("/health", (_req, res) => res.json({ ok: true, service: "gateway" }));

app.use("/api/v1/auth", authRoomsProxy);
app.use("/api/v1/users", authRoomsProxy);

app.use("/api/v1/rooms", (req, res, next) => {
  const pathOnly = req.path.split("?")[0];
  if (/\/messages\/?$/.test(pathOnly)) {
    return messagesProxy(req, res, next);
  }
  return authRoomsProxy(req, res, next);
});

app.listen(PORT, () => {
  console.log(`API gateway listening on ${PORT}`);
});
