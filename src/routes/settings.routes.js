// src/routes/settings.routes.js
import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  uploadSingle,
  normaliseFile,
} from "../middleware/upload.middleware.js";
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
  // ── Account lifecycle ─────────────────────────────────────────────────
  checkDeactivationEligibility,
  pauseAccount,
  resumeAccount,
  cancelDeletion,
} from "../controllers/settings.controller.js";

const router = Router();

// ── Profile ──────────────────────────────────────────────────────────────
router.get("/profile", protect, getProfile);
router.patch("/profile", protect, updateProfile);

// ── Avatar ───────────────────────────────────────────────────────────────
router.post("/avatar", protect, uploadSingle, normaliseFile, updateAvatar);

// ── Worker profile ───────────────────────────────────────────────────────
router.patch("/worker-profile", protect, updateWorkerProfile);

// ── Hirer profile ────────────────────────────────────────────────────────
router.patch("/hirer-profile", protect, updateHirerProfile);

// ── Password ─────────────────────────────────────────────────────────────
router.patch("/password", protect, changePassword);

// ── Notification prefs ───────────────────────────────────────────────────
router.get("/notifications", protect, getNotificationPrefs);
router.patch("/notifications", protect, updateNotificationPrefs);

// ── Privacy ──────────────────────────────────────────────────────────────
router.get("/privacy", protect, getPrivacySettings);
router.patch("/privacy", protect, updatePrivacySettings);

// ── Security ─────────────────────────────────────────────────────────────
router.get("/security", protect, getSecurityInfo);

// ── Account lifecycle ────────────────────────────────────────────────────
router.get("/deactivation-check", protect, checkDeactivationEligibility);
router.post("/pause", protect, pauseAccount);
router.post("/resume", protect, resumeAccount);
router.post("/cancel-deletion", protect, cancelDeletion);
router.delete("/account", protect, deleteAccount);

// ── Payment methods ──────────────────────────────────────────────────────
router.get("/payment-methods", protect, getPaymentMethods);

// ── Activity ─────────────────────────────────────────────────────────────
router.get("/activity", protect, getActivitySummary);

export default router;
