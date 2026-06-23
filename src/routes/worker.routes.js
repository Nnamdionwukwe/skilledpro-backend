// src/routes/worker.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// S6 FIX: `GET /:userId` MUST be the LAST route.
//
// Bug: it was defined at line 39, before all the protected named routes.
// Express evaluates routes in order — so GET /dashboard, GET /notifications,
// etc. all matched /:userId (userId = "dashboard"), failed UUID validation,
// and returned 400. The actual handler was never reached.
//
// Fix: put /:userId last. Because we now need protect middleware on specific
// routes while keeping /:userId public, we apply protect inline on each
// protected route instead of using router.use() which applied too broadly.
// ─────────────────────────────────────────────────────────────────────────────
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
  getCompletedJobs,
} from "../controllers/worker.controller.js";
import {
  uploadSingle,
  normaliseFile,
} from "../middleware/upload.middleware.js";
import {
  validateUpdateWorkerProfile,
  validateUUIDParam,
  validateUpdateAvailability,
  validatePagination,
} from "../utils/validators.js";

const router = Router();

// Shorthand so we don't repeat on every route below
const W = [protect, requireRole("WORKER")];

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC static route — must come before /:userId
// ─────────────────────────────────────────────────────────────────────────────
router.get("/search", optionalProtect, validatePagination, searchWorkers);

// ─────────────────────────────────────────────────────────────────────────────
// WORKER-ONLY routes — all named paths must be defined BEFORE /:userId
// to prevent Express matching "/dashboard" etc. as a userId UUID
// ─────────────────────────────────────────────────────────────────────────────

// Dashboard
router.get("/dashboard", ...W, getWorkerDashboard);
router.get("/dashboard/reviews", ...W, validatePagination, getMyReviews);

// Profile
router.put("/profile", ...W, validateUpdateWorkerProfile, updateWorkerProfile);

// Categories
router.post("/categories", ...W, addCategory);
router.delete(
  "/categories/:id",
  ...W,
  ...validateUUIDParam("id"),
  removeCategory,
);

// Portfolio
router.post("/portfolio", ...W, uploadSingle, normaliseFile, addPortfolio);
router.delete(
  "/portfolio/:id",
  ...W,
  ...validateUUIDParam("id"),
  deletePortfolio,
);

// Certifications
router.post(
  "/certifications",
  ...W,
  uploadSingle,
  normaliseFile,
  addCertification,
);

// Availability
router.put(
  "/availability",
  ...W,
  validateUpdateAvailability,
  updateAvailability,
);
router.post(
  "/availability",
  ...W,
  validateUpdateAvailability,
  updateAvailability,
);

// Video intro
router.post("/video-intro", ...W, uploadSingle, normaliseFile, addVideoIntro);
router.delete("/video-intro", ...W, deleteVideoIntro);

// Notifications
router.get("/notifications", ...W, validatePagination, getWorkerNotifications);
router.patch("/notifications/read-all", ...W, markAllNotificationsRead);

//view completed jobs
router.get("/completed-jobs", ...W, validatePagination, getCompletedJobs);

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC dynamic route — MUST BE LAST
// Any GET /:userId that isn't matched above lands here.
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/:userId",
  optionalProtect,
  ...validateUUIDParam("userId"),
  getWorkerProfile,
);

export default router;
