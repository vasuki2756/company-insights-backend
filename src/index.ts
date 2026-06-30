// ─────────────────────────────────────────────────────────────
// KITS Placement Intelligence Hub — API Server Entry Point
// Express + Prisma + Redis + JWT Auth
// ─────────────────────────────────────────────────────────────

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth";
import aiAssistantRoutes from "./routes/ai-assistant";
import companyRoutes from "./routes/companies";
import skillRoutes from "./routes/skills";
import studentRoutes from "./routes/student";
import adminRoutes from "./routes/admin";
import healthRoutes from "./routes/health";
import { db } from "./lib/db";
import { getRedisClient } from "./lib/redis";

// ─── Configuration ────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim());

// ─── Application ──────────────────────────────────────────────

const app = express();

// ─── Global Middleware ────────────────────────────────────────

// Trust proxy for correct IP detection behind reverse proxies
app.set("trust proxy", 1);

// CORS — allow frontend origin with credentials (cookies)
app.use(
  cors({
    origin: CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["X-Request-Id"],
  }),
);

// Body parsing
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Cookie parsing (for httpOnly JWT cookies)
app.use(cookieParser());

// Request ID for tracing
app.use((_req, res, next) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  res.setHeader("X-Request-Id", requestId);
  next();
});

// Global rate limiter (applied to all /api/v1/* routes)
const globalRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "60000", 10),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? "100", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests. Please try again later.",
  },
});

app.use("/api/v1", globalRateLimiter);

// ─── Auth-specific rate limiter (stricter) ────────────────────

const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many authentication attempts. Please wait before trying again.",
  },
});

// Apply auth rate limiter to login and register
app.use("/api/v1/auth/login", authRateLimiter);
app.use("/api/v1/auth/register", authRateLimiter);
app.use("/api/v1/auth/change-password", authRateLimiter);

// ─── Routes ───────────────────────────────────────────────────

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/ai", aiAssistantRoutes);
app.use("/api/v1/companies", companyRoutes);
app.use("/api/v1/skills", skillRoutes);
app.use("/api/v1/student", studentRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/health", healthRoutes);

// ─── 404 Handler ──────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: "The requested resource was not found.",
  });
});

// ─── Global Error Handler ─────────────────────────────────────

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("[server] Unhandled error:", err);
    res.status(500).json({
      success: false,
      error: "An internal server error occurred.",
    });
  },
);

// ─── Start Server ─────────────────────────────────────────────

async function start() {
  try {
    // Connect Redis
    console.log("[server] Connecting to Redis...");
    await getRedisClient();

    // Verify database connection
    await db.$connect();
    console.log("[server] Database connected");

    // Start listening
    app.listen(PORT, () => {
      console.log(`\n  🚀 KITS Placement API Server`);
      console.log(`  📡 http://localhost:${PORT}`);
      console.log(`  ❤️  Health: http://localhost:${PORT}/api/v1/health`);
      console.log(`  🌍 CORS origins: ${CORS_ORIGINS.join(", ")}`);
      console.log(`  ⚙️  Environment: ${process.env.NODE_ENV ?? "development"}\n`);
    });
  } catch (error) {
    console.error("[server] Failed to start:", error);
    process.exit(1);
  }
}

start();
