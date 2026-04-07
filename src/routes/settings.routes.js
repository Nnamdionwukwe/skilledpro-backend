// src/routes/settings.routes.js
import { Router } from "express";
import multer from "multer";
import { protect } from "../middleware/auth.middleware.js";
import {
  getProfile,
  updateProfile,
  updateAvatar,
  updateWorkerProfile,
  updateHirerProfile,
  changePassword,
  getNotificationPrefs,
  updateNotificationPrefs,
  getPrivacySettings,
  updatePrivacySettings,
  getSecurityInfo,
  deleteAccount,
  getPaymentMethods,
  getActivitySummary,
} from "../controllers/settings.controller.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// All settings routes require authentication
router.use(protect);

// ── Profile ───────────────────────────────────────────────────────────────────
router.get("/profile", getProfile);
router.patch("/profile", updateProfile);
router.post("/avatar", upload.single("avatar"), updateAvatar);

// ── Role-specific profiles ────────────────────────────────────────────────────
router.patch("/worker-profile", updateWorkerProfile);
router.patch("/hirer-profile", updateHirerProfile);

// ── Password & Security ───────────────────────────────────────────────────────
router.patch("/password", changePassword);
router.get("/security", getSecurityInfo);

// ── Notifications ─────────────────────────────────────────────────────────────
router.get("/notifications", getNotificationPrefs);
router.patch("/notifications", updateNotificationPrefs);

// ── Privacy ───────────────────────────────────────────────────────────────────
router.get("/privacy", getPrivacySettings);
router.patch("/privacy", updatePrivacySettings);

// ── Payment methods ───────────────────────────────────────────────────────────
router.get("/payment-methods", getPaymentMethods);

// ── Activity ──────────────────────────────────────────────────────────────────
router.get("/activity", getActivitySummary);

// ── Account deletion ──────────────────────────────────────────────────────────
router.delete("/account", deleteAccount);

export default router;
