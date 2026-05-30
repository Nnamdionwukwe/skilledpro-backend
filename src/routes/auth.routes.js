// src/routes/auth.routes.js  (final version — rate limiting + validators)
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
  logoutAll,
} from "../controllers/auth.controller.js";
import {
  loginLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  resendVerificationLimiter,
  refreshTokenLimiter,
} from "../middleware/rateLimit.middleware.js";
import {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
} from "../utils/validators.js";

const router = express.Router();

// ─── Public routes (rate limited + validated) ─────────────────────────────────
router.post("/register", registerLimiter, validateRegister, register);
router.post("/login", loginLimiter, validateLogin, login);
router.get("/verify-email", verifyEmail);
router.post(
  "/resend-verification",
  resendVerificationLimiter,
  resendVerification,
);
router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  validateForgotPassword,
  forgotPassword,
);
router.post(
  "/reset-password",
  resetPasswordLimiter,
  validateResetPassword,
  resetPassword,
);
router.post("/refresh", refreshTokenLimiter, refreshToken);

// ─── Protected ────────────────────────────────────────────────────────────────
router.post("/logout", protect, logout);
router.get("/me", protect, getMe);

router.post("/logout-all", protect, logoutAll);

export default router;
