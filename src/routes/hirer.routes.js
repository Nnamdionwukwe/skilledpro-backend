// src/routes/hirer.routes.js
import { Router } from "express";
import {
  protect,
  requireRole,
  optionalProtect,
} from "../middleware/auth.middleware.js";
import {
  getMyHirerProfile,
  updateHirerProfile,
  getHirerProfile,
  getHirerBookings,
  getHirerDashboard,
  getSavedWorkers,
  saveWorker,
  unsaveWorker,
  getHiredWorkers,
  getHirerReviews,
  getNotifications,
  markNotificationsRead,
} from "../controllers/hirer.controller.js";
import { getMyGivenReviews } from "../controllers/review.controller.js";
import { getHirerPublicProfile } from "../controllers/job.controller.js";
import { validateUUIDParam, validatePagination } from "../utils/validators.js";

const router = Router();

// ─── Protected /me/* routes (must come before /:userId) ──────────────────
router.get("/me/profile", protect, requireRole("HIRER"), getMyHirerProfile);
router.put("/me/profile", protect, requireRole("HIRER"), updateHirerProfile);
router.get("/me/dashboard", protect, requireRole("HIRER"), getHirerDashboard);
router.get(
  "/me/bookings",
  protect,
  requireRole("HIRER"),
  validatePagination,
  getHirerBookings,
);

// ─── Saved Workers ────────────────────────────────────────────────────────
router.get(
  "/me/saved-workers",
  protect,
  requireRole("HIRER"),
  validatePagination,
  getSavedWorkers,
);
router.post(
  "/me/saved-workers/:workerId",
  protect,
  requireRole("HIRER"),
  ...validateUUIDParam("workerId"),
  saveWorker,
);
router.delete(
  "/me/saved-workers/:workerId",
  protect,
  requireRole("HIRER"),
  ...validateUUIDParam("workerId"),
  unsaveWorker,
);
router.get("/me/hired-workers", protect, requireRole("HIRER"), getHiredWorkers);

// ─── Notifications ────────────────────────────────────────────────────────
router.get("/me/notifications", protect, getNotifications);
router.patch("/me/notifications/read", protect, markNotificationsRead);

// ─── Reviews ──────────────────────────────────────────────────────────────
router.get(
  "/me/reviews/received",
  protect,
  requireRole("HIRER"),
  validatePagination,
  getHirerReviews,
);
router.get(
  "/me/reviews/given",
  protect,
  requireRole("HIRER"),
  validatePagination,
  getMyGivenReviews,
);
router.get(
  "/me/reviews",
  protect,
  requireRole("HIRER"),
  validatePagination,
  getHirerReviews,
); // legacy alias

// ─── Public routes – SPECIFIC FIRST, then GENERIC ──────────────────────
// ✅ /profile route must come before /:userId to avoid being treated as a userId
router.get(
  "/:userId/profile",
  optionalProtect,
  ...validateUUIDParam("userId"),
  getHirerPublicProfile,
);

// ✅ Generic /:userId route – LAST
router.get("/:userId", ...validateUUIDParam("userId"), getHirerProfile);

export default router;
