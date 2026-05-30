// src/routes/worker.routes.js
import { Router } from "express";
import {
  protect,
  requireRole,
  optionalProtect,
} from "../middleware/auth.middleware.js";
import {
  searchWorkers,
  getWorkerDashboard,
  getMyReviews,
  updateWorkerProfile,
  addCategory,
  removeCategory,
  addPortfolio,
  deletePortfolio,
  addVideoIntro,
  deleteVideoIntro,
  updateAvailability,
  addCertification,
  getWorkerProfile,
  getWorkerNotifications,
  markAllNotificationsRead,
} from "../controllers/worker.controller.js";
import {
  uploadSingle, // was: upload.single(...)  ← FIXED — middleware exports uploadSingle not upload
  normaliseFile, // normalises req.files → req.file for controllers that use req.file
} from "../middleware/upload.middleware.js";
import {
  validateUpdateWorkerProfile,
  validateUUIDParam,
  validatePagination,
} from "../utils/validators.js";

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.get("/search", optionalProtect, validatePagination, searchWorkers);
router.get(
  "/:userId",
  optionalProtect,
  ...validateUUIDParam("userId"),
  getWorkerProfile,
);

// ── Protected: WORKER role only ───────────────────────────────────────────────
router.use(protect, requireRole("WORKER"));

// Dashboard
router.get("/dashboard", getWorkerDashboard);
router.get("/dashboard/reviews", validatePagination, getMyReviews);

// Profile
router.put("/profile", validateUpdateWorkerProfile, updateWorkerProfile);

// Categories
router.post("/categories", addCategory);
router.delete("/categories/:id", ...validateUUIDParam("id"), removeCategory);

// Portfolio  (uploadSingle = upload.any() — accepts any field name)
router.post("/portfolio", uploadSingle, normaliseFile, addPortfolio);
router.delete("/portfolio/:id", ...validateUUIDParam("id"), deletePortfolio);

// Certifications
router.post("/certifications", uploadSingle, normaliseFile, addCertification);

// Availability
router.put("/availability", updateAvailability);
router.post("/availability", updateAvailability);

// Video intro
router.post("/video-intro", uploadSingle, normaliseFile, addVideoIntro);
router.delete("/video-intro", deleteVideoIntro);

// Notifications
router.get("/notifications", validatePagination, getWorkerNotifications);
router.patch("/notifications/read-all", markAllNotificationsRead);

export default router;
