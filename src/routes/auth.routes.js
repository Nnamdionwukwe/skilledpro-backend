import { Router } from "express";
import {
  register, login, verifyEmail,
  forgotPassword, resetPassword,
  refreshToken, logout, getMe,
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/verify-email", verifyEmail);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/refresh", refreshToken);
router.post("/logout", protect, logout);
router.get("/me", protect, getMe);

export default router;
