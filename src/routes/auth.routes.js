// src/routes/auth.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// Added: POST /logout-all
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  register,
  login,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  refreshToken,
  logout,
  getMe,
  logoutAll,
} from "../controllers/auth.controller.js";
import {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateResendVerification,
} from "../utils/validators.js";

// ─── Rate Limiters ──────────────────────────────────────────────────────────
import {
  authLimiter,
  registerLimiter,
  sensitiveLimiter,
} from "../middleware/security.middleware.js";

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.post("/register", registerLimiter, validateRegister, register);
router.post("/login", authLimiter, validateLogin, login);
router.get("/verify-email", sensitiveLimiter, verifyEmail);
router.post(
  "/resend-verification",
  sensitiveLimiter,
  validateResendVerification,
  resendVerification,
);
router.post(
  "/forgot-password",
  sensitiveLimiter,
  validateForgotPassword,
  forgotPassword,
);
router.post(
  "/reset-password",
  sensitiveLimiter,
  validateResetPassword,
  resetPassword,
);

// ── Protected ─────────────────────────────────────────────────────────────────
router.post("/refresh", protect, refreshToken);
router.post("/logout", protect, logout);
router.get("/me", protect, getMe);

// POST /api/auth/logout-all — sign out from every device simultaneously
router.post("/logout-all", protect, logoutAll);

export default router;
