// src/routes/booking.routes.js
import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  createBooking,
  getMyBookings, // was: getBookings       ← FIXED
  getBooking, // was: getBookingById     ← FIXED
  updateBookingStatus,
  checkIn,
  checkOut,
  activateSOS, // was: triggerSOS         ← FIXED
  resolveSOS,
  updateEmergencyContact,
} from "../controllers/booking.controller.js";
import {
  validateCreateBooking,
  validateBookingStatus,
  validateUUIDParam,
} from "../utils/validators.js";

const router = Router();
router.use(protect);

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

export default router;
