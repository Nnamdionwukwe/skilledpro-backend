// src/routes/settings.routes.js
import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  getProfile,
  updateProfile,
  updateAvatar,
  updateWorkerProfile,
  updateHirerProfile,
  changePassword,
  getSecurityInfo,
  getNotificationPrefs,
  updateNotificationPrefs,
  getPrivacySettings,
  updatePrivacySettings,
  getPaymentMethods,
  getActivitySummary,
  deleteAccount,
} from "../controllers/settings.controller.js";
import {
  uploadSingle, // was: upload.single("avatar")  ← FIXED
  normaliseFile,
} from "../middleware/upload.middleware.js";
import {
  validateUpdateProfile,
  validateUpdateWorkerProfile,
  validateChangePassword,
} from "../utils/validators.js";

const router = Router();
router.use(protect);

router.get("/profile", getProfile);
router.patch("/profile", validateUpdateProfile, updateProfile);
router.post("/avatar", uploadSingle, normaliseFile, updateAvatar);
router.patch(
  "/worker-profile",
  validateUpdateWorkerProfile,
  updateWorkerProfile,
);
router.patch("/hirer-profile", updateHirerProfile);
router.patch("/password", validateChangePassword, changePassword);
router.get("/security", getSecurityInfo);
router.get("/notifications", getNotificationPrefs);
router.patch("/notifications", updateNotificationPrefs);
router.get("/privacy", getPrivacySettings);
router.patch("/privacy", updatePrivacySettings);
router.get("/payment-methods", getPaymentMethods);
router.get("/activity", getActivitySummary);
router.delete("/account", deleteAccount);

export default router;
