// src/routes/booking.routes.js
import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  createBooking,
  createBookingFromJobPost,
  getJobPostBookingDraft,
  getMyBookings,
  getBooking,
  updateBookingStatus,
  checkIn,
  checkOut,
  activateSOS,
  resolveSOS,
  updateEmergencyContact,
  startBookingCall, // ✅ Added
} from "../controllers/booking.controller.js";
import {
  validateCreateBooking,
  validateBookingStatus,
  validateUUIDParam,
  validateCreateBookingFromJobPost,
} from "../utils/validators.js";

const router = Router();
router.use(protect);

// ── Job-post-driven booking (must precede the /:id routes) ─────────────────
router.get(
  "/from-job/:jobPostId/draft",
  requireRole("HIRER"),
  ...validateUUIDParam("jobPostId"),
  getJobPostBookingDraft,
);

router.post(
  "/from-job/:jobPostId",
  requireRole("HIRER"),
  ...validateUUIDParam("jobPostId"),
  validateCreateBookingFromJobPost,
  createBookingFromJobPost,
);

router.post("/", requireRole("HIRER"), validateCreateBooking, createBooking);
router.get("/", getMyBookings);
router.get("/:id", ...validateUUIDParam("id"), getBooking);
router.patch(
  "/:id/status",
  ...validateUUIDParam("id"),
  validateBookingStatus,
  updateBookingStatus,
);
router.patch(
  "/:id/checkin",
  requireRole("WORKER"),
  ...validateUUIDParam("id"),
  checkIn,
);
router.patch(
  "/:id/checkout",
  requireRole("WORKER"),
  ...validateUUIDParam("id"),
  checkOut,
);
router.post("/:id/sos", ...validateUUIDParam("id"), activateSOS);
router.patch(
  "/:id/sos/resolve",
  requireRole("HIRER", "ADMIN"),
  ...validateUUIDParam("id"),
  resolveSOS,
);
router.patch(
  "/:id/emergency-contact",
  ...validateUUIDParam("id"),
  updateEmergencyContact,
);

// ── Video Call (booking-specific) ──────────────────────────────────────────
// Start (or reuse) a video call for a booking
router.post(
  "/:bookingId/call",
  ...validateUUIDParam("bookingId"),
  startBookingCall,
);

export default router;
