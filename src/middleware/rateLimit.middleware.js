// src/middleware/rateLimit.middleware.js
// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting middleware for SkilledProz
// Requires: npm install express-rate-limit
// ─────────────────────────────────────────────────────────────────────────────

import rateLimit, { ipKeyGenerator } from "express-rate-limit";
// ↑ ipKeyGenerator is required by express-rate-limit v7+ whenever you use
//   req.ip inside a custom keyGenerator. It normalises IPv6 addresses so
//   users cannot bypass limits by switching between IPv4/IPv6 representations.

// ─── Standard error format (matches sendError in response.js) ────────────────
const handler = (message) => (_req, res) =>
  res.status(429).json({
    success: false,
    message,
    retryAfter: res.getHeader("Retry-After"),
  });

// ─────────────────────────────────────────────────────────────────────────────
// AUTH LIMITERS
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/auth/login
// 10 attempts per 15 minutes — keyed on IP+email so rotating IPs doesn't help
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler(
    "Too many login attempts. Please wait 15 minutes before trying again.",
  ),
  keyGenerator: (req) => {
    const email = req.body?.email?.toLowerCase?.() || "";
    return `${ipKeyGenerator(req)}-${email}`; // ← ipKeyGenerator, not req.ip
  },
  skip: () => process.env.NODE_ENV === "test",
});

// POST /api/auth/register
// 5 registrations per hour per IP
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler(
    "Too many accounts created from this IP. Please wait 1 hour.",
  ),
  skip: () => process.env.NODE_ENV === "test",
});

// POST /api/auth/forgot-password — prevents email bombing
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler("Too many password reset requests. Please wait 1 hour."),
  skip: () => process.env.NODE_ENV === "test",
});

// POST /api/auth/reset-password
export const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler("Too many password reset attempts. Please wait 1 hour."),
  skip: () => process.env.NODE_ENV === "test",
});

// POST /api/auth/resend-verification
export const resendVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler(
    "Too many verification emails requested. Please wait 1 hour.",
  ),
  skip: () => process.env.NODE_ENV === "test",
});

// POST /api/auth/refresh — mobile apps cycle tokens frequently
export const refreshTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler(
    "Too many token refresh requests. Please wait before retrying.",
  ),
});

// ─────────────────────────────────────────────────────────────────────────────
// AI LIMITER — protects Anthropic API credits
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/ai/assist — 10 per minute per authenticated user
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler(
    "AI request limit reached. You can send up to 10 messages per minute.",
  ),
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req), // ← per-user when logged in
  skip: () => process.env.NODE_ENV === "test",
});

// Daily cap: 100 AI requests per user per day
export const aiDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler(
    "Daily AI request limit reached (100/day). Resets at midnight.",
  ),
  keyGenerator: (req) => `daily-${req.user?.id ?? ipKeyGenerator(req)}`, // ← fixed
  skip: () => process.env.NODE_ENV === "test",
});

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH LIMITERS — protect against scraping
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/search — 60 per minute (fast enough for autocomplete)
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler("Too many search requests. Please slow down."),
});

// GET /api/search/nearby — 20 per minute (haversine + DB expansion is expensive)
export const nearbyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler("Too many location search requests. Please wait a moment."),
});

// GET /api/search/trending
export const trendingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler("Too many trending requests. Please slow down."),
});

// GET /api/search/filters
export const filterLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler("Too many filter requests. Please slow down."),
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL PURPOSE LIMITERS
// ─────────────────────────────────────────────────────────────────────────────

// Broad protection for the whole /api — apply in app.js:
//   import { apiLimiter } from "./middleware/rateLimit.middleware.js";
//   app.use("/api", apiLimiter);
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler("Too many requests from this IP. Please slow down."),
  skip: (req) => req.path === "/" || req.path.includes("/webhook/"),
});

// Payment webhooks — high limit for gateway callbacks
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler("Webhook rate limit exceeded"),
});

// File uploads — per user when authenticated, else per IP
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler(
    "Upload limit reached (50/hour). Please wait before uploading more files.",
  ),
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req), // ← fixed
});

// Notification permission requests
export const notificationRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler("Too many notification requests. Please wait 1 hour."),
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req), // ← fixed
});
