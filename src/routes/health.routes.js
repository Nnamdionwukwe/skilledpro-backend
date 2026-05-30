// src/routes/health.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// GET /health — Railway health check + DB ping
//
// Mount BEFORE all other middleware in app.js:
//   import healthRouter from "./routes/health.routes.js";
//   app.get("/health", healthRouter);   ← before rateLimiter, before protect
//
// Railway uses this endpoint to decide if a deployment is healthy.
// Returns 200 on success, 503 if DB is unreachable.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import prisma from "../config/database.js";

const router = Router();

router.get("/", async (req, res) => {
  const start = Date.now();
  let dbStatus = "connected";
  let dbLatencyMs = null;

  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - t0;
  } catch (err) {
    dbStatus = "disconnected";
    console.error("[health] DB ping failed:", err.message);
  }

  const healthy = dbStatus === "connected";
  const mem = process.memoryUsage();

  return res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || "development",
    version: process.env.npm_package_version || "1.0.0",
    services: {
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
    },
    memory: {
      heapUsedMB: Math.round(mem.heapUsed / 1_048_576),
      heapTotalMB: Math.round(mem.heapTotal / 1_048_576),
      rssMB: Math.round(mem.rss / 1_048_576),
    },
    responseTimeMs: Date.now() - start,
  });
});
