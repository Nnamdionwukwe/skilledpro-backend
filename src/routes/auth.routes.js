// src/routes/auth.routes.js
import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  register,
  verifyEmail,
  resendVerification,
  login,
  refreshToken,
  logout,
  getMe,
  forgotPassword,
  resetPassword,
} from "../controllers/auth.controller.js";
import {
  loginLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  resendVerificationLimiter,
  refreshTokenLimiter,
} from "../middleware/rateLimit.middleware.js";

const router = express.Router();

// ─── Public — with rate limiting ─────────────────────────────────────────────

// 5 registrations / hour / IP
router.post("/register", registerLimiter, register);

// 10 attempts / 15 min / IP+email combo
router.post("/login", loginLimiter, login);

// No rate limit needed — one-time token link
router.get("/verify-email", verifyEmail);

// 3 emails / hour / IP
router.post(
  "/resend-verification",
  resendVerificationLimiter,
  resendVerification,
);

// 3 requests / hour / IP
router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);

// 5 attempts / hour / IP
router.post("/reset-password", resetPasswordLimiter, resetPassword);

// 30 refreshes / 15 min / IP
router.post("/refresh", refreshTokenLimiter, refreshToken);

// ─── Protected ───────────────────────────────────────────────────────────────
router.post("/logout", protect, logout);
router.get("/me", protect, getMe);

export default router;
