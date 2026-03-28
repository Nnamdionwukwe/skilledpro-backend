import { Router } from "express";
import {
  getMyHirerProfile,
  updateHirerProfile,
  getHirerProfile,
  getHirerBookings,
  getHirerDashboard,
  getSavedWorkers,
  postJob,
  getHirerReviews,
  getNotifications,
  markNotificationsRead,
} from "../controllers/hirer.controller.js";
import { getMyGivenReviews } from "../controllers/review.controller.js";
import { protect, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

// ── All /me/* routes MUST come before /:userId ────────────────────────────────
router.get("/me/profile", protect, requireRole("HIRER"), getMyHirerProfile);
router.put("/me/profile", protect, requireRole("HIRER"), updateHirerProfile);
router.get("/me/dashboard", protect, requireRole("HIRER"), getHirerDashboard);
router.get("/me/bookings", protect, requireRole("HIRER"), getHirerBookings);
router.get("/me/saved-workers", protect, requireRole("HIRER"), getSavedWorkers);
router.post("/me/post-job", protect, requireRole("HIRER"), postJob);
router.get("/me/notifications", protect, getNotifications);
router.patch("/me/notifications/read", protect, markNotificationsRead);

// ── Reviews — two separate endpoints ─────────────────────────────────────────
router.get(
  "/me/reviews/received",
  protect,
  requireRole("HIRER"),
  getHirerReviews,
);
router.get(
  "/me/reviews/given",
  protect,
  requireRole("HIRER"),
  getMyGivenReviews,
);

// ── Fallback — keep old /me/reviews pointing to received ─────────────────────
router.get("/me/reviews", protect, requireRole("HIRER"), getHirerReviews);

// ── Public — MUST come last ───────────────────────────────────────────────────
router.get("/:userId", getHirerProfile);

export default router;
