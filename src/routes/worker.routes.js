import { Router } from "express";

import {
  searchWorkers,
  getWorkerProfile,
  updateWorkerProfile,
  addPortfolio,
  deletePortfolio,
  addCertification,
  updateAvailability,
  addCategory,
  getWorkerDashboard,
  getWorkerNotifications,
  markAllNotificationsRead,
  removeCategory,
  addVideoIntro,
  deleteVideoIntro,
  getMyReviews, // renamed from getWorkerReviews — was colliding with review.controller.js
} from "../controllers/worker.controller.js";
import { getWorkerEarnings } from "../controllers/payment.controller.js";

import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  uploadSingle,
  normaliseFile,
} from "../middleware/upload.middleware.js";
import { getMyApplications } from "../controllers/job.controller.js";

const router = Router();

// PUBLIC ROUTES (static — must come first)
router.get("/search", searchWorkers);

// WORKER DASHBOARD (protected — WORKER only)
// All /dashboard/* routes defined before /:userId
router.get("/dashboard", protect, requireRole("WORKER"), getWorkerDashboard);
router.get(
  "/dashboard/notifications",
  protect,
  requireRole("WORKER"),
  getWorkerNotifications,
);
router.patch(
  "/dashboard/notifications/read-all",
  protect,
  requireRole("WORKER"),
  markAllNotificationsRead,
);
router.get(
  "/dashboard/earnings",
  protect,
  requireRole("WORKER"),
  getWorkerEarnings, // ← payment controller version
);
router.get("/dashboard/reviews", protect, requireRole("WORKER"), getMyReviews);

// WORKER PROFILE MANAGEMENT (protected — WORKER only)
router.put("/profile", protect, requireRole("WORKER"), updateWorkerProfile);
router.post(
  "/portfolio",
  protect,
  requireRole("WORKER"),
  uploadSingle,
  addPortfolio,
  normaliseFile,
);
router.delete(
  "/portfolio/:id",
  protect,
  requireRole("WORKER"),
  deletePortfolio,
);
router.post(
  "/certifications",
  protect,
  requireRole("WORKER"),
  uploadSingle,
  addCertification,
  normaliseFile,
);
router.put("/availability", protect, requireRole("WORKER"), updateAvailability);
router.post("/categories", protect, requireRole("WORKER"), addCategory);
// Add to worker.routes.js:
router.delete(
  "/categories/:categoryId",
  protect,
  requireRole("WORKER"),
  removeCategory,
);
router.get(
  "/my-applications",
  protect,
  requireRole("WORKER"),
  getMyApplications,
);
router.post(
  "/video-intro",
  protect,
  requireRole("WORKER"),
  uploadSingle,
  normaliseFile,
  addVideoIntro,
);
router.delete("/video-intro", protect, requireRole("WORKER"), deleteVideoIntro);

// PUBLIC DYNAMIC ROUTE (wildcard — always last)
router.get("/:userId", getWorkerProfile);

export default router;
