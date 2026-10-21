// src/middleware/security.middleware.js
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// ─── Rate Limiters ──────────────────────────────────────────────────────────

// Global API rate limiter - 100 requests per 15 minutes
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// Auth rate limiter - 10 login attempts per 15 minutes
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: "Too many login attempts. Please try again in 15 minutes.",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Registration rate limiter - 5 registrations per hour
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Too many registration attempts. Please try again in an hour.",
    retryAfter: "1 hour",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Sensitive operations limiter - 5 attempts per hour
export const sensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Too many attempts. Please try again in an hour.",
    retryAfter: "1 hour",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Wallet rate limiter - 20 wallet operations per 5 minutes
export const walletLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: "Too many wallet operations. Please slow down.",
    retryAfter: "5 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin API rate limiter - 50 requests per 5 minutes
export const adminLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 50,
  message: {
    success: false,
    message: "Too many admin requests. Please slow down.",
    retryAfter: "5 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Feedback rate limiter - 3 submissions per hour
export const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    message: "Too many feedback submissions. Please try again in an hour.",
    retryAfter: "1 hour",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Survey rate limiter - 3 submissions per hour
export const surveyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    message: "Too many survey submissions. Please try again in an hour.",
    retryAfter: "1 hour",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Email sending rate limiter - 10 emails per hour
export const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: "Too many email requests. Please try again later.",
    retryAfter: "1 hour",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Payment rate limiter - 10 payment attempts per 15 minutes
export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: "Too many payment attempts. Please try again later.",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Support rate limiter ─────────────────────────────────────────────────────
// Limits ticket creation and file uploads.
// Read operations (GET) are skipped so users can browse their tickets freely.
export const supportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "GET" || req.method === "OPTIONS",
  message: {
    success: false,
    message: "Too many support requests. Please wait an hour and try again.",
  },
  // Fix: use the helper for IP fallback to support IPv6
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req),
});
