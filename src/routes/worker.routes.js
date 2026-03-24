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
  getWorkerEarnings,
  getWorkerReviews,
} from "../controllers/worker.controller.js";

import { protect, requireRole } from "../middleware/auth.middleware.js";
import { uploadSingle } from "../middleware/upload.middleware.js";

const router = Router();

// ─────────────────────────────────────────────
// PUBLIC ROUTES
// ─────────────────────────────────────────────
router.get("/search", searchWorkers);
router.get("/:userId", getWorkerProfile);

// ─────────────────────────────────────────────
// WORKER DASHBOARD  (protected — WORKER only)
// ─────────────────────────────────────────────
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
  getWorkerEarnings,
);

router.get(
  "/dashboard/reviews",
  protect,
  requireRole("WORKER"),
  getWorkerReviews,
);

// ─────────────────────────────────────────────
// WORKER PROFILE MANAGEMENT (protected — WORKER only)
// ─────────────────────────────────────────────
router.put("/profile", protect, requireRole("WORKER"), updateWorkerProfile);

router.post(
  "/portfolio",
  protect,
  requireRole("WORKER"),
  uploadSingle,
  addPortfolio,
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
);

router.put("/availability", protect, requireRole("WORKER"), updateAvailability);

router.post("/categories", protect, requireRole("WORKER"), addCategory);

export default router;
