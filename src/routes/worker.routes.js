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
  getMyReviews, // renamed from getWorkerReviews — was colliding with review.controller.js
} from "../controllers/worker.controller.js";

import { protect, requireRole } from "../middleware/auth.middleware.js";
import { uploadSingle } from "../middleware/upload.middleware.js";

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
  getWorkerEarnings,
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

// PUBLIC DYNAMIC ROUTE (wildcard — always last)
router.get("/:userId", getWorkerProfile);

export default router;
