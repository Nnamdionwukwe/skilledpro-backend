import { Router } from "express";
import {
  createBooking,
  getMyBookings,
  getBooking,
  updateBookingStatus,
  checkIn,
  checkOut,
  activateSOS,
  resolveSOS,
  updateEmergencyContact,
} from "../controllers/booking.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/", protect, createBooking);
router.get("/", protect, getMyBookings);
router.get("/:id", protect, getBooking);
router.patch("/:id/status", protect, updateBookingStatus);
router.patch("/:id/checkin", protect, checkIn);
router.patch("/:id/checkout", protect, checkOut);

// ── Emergency / SOS ───────────────────────────────────────────────────────────
router.post("/:id/sos", protect, activateSOS);
router.patch("/:id/sos/resolve", protect, resolveSOS);
router.patch("/:id/emergency-contact", protect, updateEmergencyContact);

export default router;
