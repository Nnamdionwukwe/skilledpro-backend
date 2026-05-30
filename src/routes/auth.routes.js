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
  logoutAll, // ← NEW
} from "../controllers/auth.controller.js";
import {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateResendVerification,
} from "../utils/validators.js";

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.post("/register", validateRegister, register);
router.post("/login", validateLogin, login);
router.get("/verify-email", verifyEmail);
router.post(
  "/resend-verification",
  validateResendVerification,
  resendVerification,
);
router.post("/forgot-password", validateForgotPassword, forgotPassword);
router.post("/reset-password", validateResetPassword, resetPassword);

// ── Protected ─────────────────────────────────────────────────────────────────
router.post("/refresh", protect, refreshToken);
router.post("/logout", protect, logout);
router.get("/me", protect, getMe);

// POST /api/auth/logout-all — sign out from every device simultaneously
// Clears refresh token hash + deactivates all push device tokens
router.post("/logout-all", protect, logoutAll);

export default router;
