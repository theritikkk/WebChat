import "./tracing.js"; // must be first — patches Node http/net before other imports
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createProxyMiddleware } from "http-proxy-middleware";
import {
  register,
  httpRequestsTotal,
  httpRequestDuration,
  activeRequests,
  rateLimitHitsTotal
} from "./metrics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const PORT = Number(process.env.PORT_GATEWAY) || 4000;
const AUTH_URL = process.env.AUTH_SERVICE_URL || "http://127.0.0.1:3001";
const MESSAGES_URL = process.env.MESSAGES_SERVICE_URL || "http://127.0.0.1:3003";
const UPLOADS_URL = process.env.UPLOADS_SERVICE_URL || "http://127.0.0.1:3004";
const CHAT_URL = process.env.CHAT_SERVICE_PUBLIC_URL || "http://127.0.0.1:5000";

const origins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",").map((s) => s.trim()).filter(Boolean);

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: origins.length ? origins : true,
  credentials: true
}));
// app.use(express.json({ limit: "2mb" }));
app.use(morgan("combined"));

// ── Prometheus instrumentation middleware ─────────────────────────────────────
app.use((req, res, next) => {
  // Skip /metrics and /health from tracking
  if (req.path === "/metrics" || req.path === "/health") return next();
  activeRequests.inc();
  const end = httpRequestDuration.startTimer({ method: req.method, route: req.path });
  res.on("finish", () => {
    activeRequests.dec();
    end();
    httpRequestsTotal.inc({
      method: req.method,
      route: req.path,
      status_code: res.statusCode
    });
  });
  next();
});

// ── Internal-only guard for /metrics ──────────────────────────────────────────
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

// ── Prometheus metrics endpoint (internal only) ─────────────────────────────
app.get("/metrics", internalOnly, async (_req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// ── Rate limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) return auth.slice(7, 48);
    return req.ip || "unknown";
  },
  handler: (req, res, next, options) => {
    rateLimitHitsTotal.inc();
    res.status(options.statusCode).json({ error: "Too many requests — slow down" });
  }
});
app.use("/api/", limiter);

// ── Proxy targets ─────────────────────────────────────────────────────────────


const authProxy = createProxyMiddleware({
  target: AUTH_URL,
  changeOrigin: true,
  pathRewrite: (path) => `/api/v1/auth${path}`,
});

const usersProxy = createProxyMiddleware({
  target: AUTH_URL,
  changeOrigin: true,
  pathRewrite: (path, req) => {
    return `/api/v1/users${path}`;
  }
});

// Uploads proxy — only routes presign metadata; binary goes browser→MinIO directly
const uploadsProxy = createProxyMiddleware({
  target: UPLOADS_URL,
  changeOrigin: true,
  on: {
    error: (_err, _req, res) => {
      res.status(502).json({ error: "Uploads service unavailable" });
    }
  }
});

app.get("/health", (_req, res) => res.json({ ok: true, service: "gateway" }));

app.use("/api/v1/auth", authProxy);
app.use("/api/v1/users", usersProxy);


// ── File upload presigning → Uploads service ──────────────────────────────────
app.use("/api/v1/upload", uploadsProxy);

const roomsProxy = createProxyMiddleware({
  target: AUTH_URL,
  changeOrigin: true,
  pathRewrite: (path) => `/api/v1/rooms${path}`,
});

const roomMessagesProxy = createProxyMiddleware({
  target: MESSAGES_URL,
  changeOrigin: true,
  pathRewrite: (path, req) => {
    const match = req.originalUrl.match(/\/api\/v1\/rooms(\/.+)/);
    return `/api/v1/rooms${match ? match[1] : path}`;
  },
});

app.use("/api/v1/rooms", (req, res, next) => {
  const pathOnly = req.path.split("?")[0];
  if (/\/messages/.test(pathOnly)) {
    return roomMessagesProxy(req, res, next);
  }
  return roomsProxy(req, res, next);
});

// Presence queries → Chat service
const presenceProxy = createProxyMiddleware({
  target: CHAT_URL,
  changeOrigin: true,
  on: {
    error: (_err, _req, res) => {
      res.status(502).json({ error: "Chat service unavailable" });
    }
  }
});
app.use("/api/v1/presence", presenceProxy);

app.listen(PORT, () => {
  console.log(`[gateway] API gateway listening on ${PORT}`);
});
