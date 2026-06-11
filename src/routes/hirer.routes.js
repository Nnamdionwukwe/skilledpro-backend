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
  getSavedWorkers, // ← now uses SavedWorker model (explicit bookmarks)
  saveWorker, // ← NEW
  unsaveWorker, // ← NEW
  getHiredWorkers, // ← NEW: previous booking-based "saved" renamed here
  getHirerReviews,
  getNotifications,
  markNotificationsRead,
} from "../controllers/hirer.controller.js";
import { getMyGivenReviews } from "../controllers/review.controller.js";
import { getHirerPublicProfile } from "../controllers/job.controller.js";
import { validateUUIDParam, validatePagination } from "../utils/validators.js";

const router = Router();

// ─── All /me/* MUST come before /:userId ──────────────────────────────────────
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

// ─── Saved Workers (bookmark / shortlist) ─────────────────────────────────────
// GET    /me/saved-workers         → explicit bookmarks (NEW model)
// POST   /me/saved-workers/:id     → save a worker
// DELETE /me/saved-workers/:id     → unsave a worker
// GET    /me/hired-workers         → previously booked workers (booking history)
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

// ─── Notifications ────────────────────────────────────────────────────────────
router.get("/me/notifications", protect, getNotifications);
router.patch("/me/notifications/read", protect, markNotificationsRead);

// ─── Reviews ─────────────────────────────────────────────────────────────────
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
); // ← legacy alias

// ─── Public — must be last ───────────────────────────────────────────────────
router.get("/:userId", ...validateUUIDParam("userId"), getHirerProfile);
router.get(
  "/:userId/profile",
  optionalProtect,
  ...validateUUIDParam("userId"),
  getHirerPublicProfile,
);

export default router;
