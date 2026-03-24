// src/routes/payment.routes.js
import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  initiateBookingPayment,
  verifyPaystack,
  stripeWebhook,
  releasePayment,
  refundPayment,
  getPayment,
  getAllPayments,
  getWorkerEarnings,
} from "../controllers/payment.controller.js";

const router = express.Router();

// ── Public (webhook — no auth, Stripe signs it) ───────────────────────────────
router.post(
  "/webhook/stripe",
  express.raw({ type: "application/json" }), // raw body needed for Stripe sig verification
  stripeWebhook,
);

// ── Public (Paystack redirect) ────────────────────────────────────────────────
router.get("/verify/paystack", verifyPaystack);

// ── Protected ────────────────────────────────────────────────────────────────
router.use(protect);

// Hirer initiates payment for an accepted booking
router.post(
  "/initiate/:bookingId",
  requireRole("HIRER"),
  initiateBookingPayment,
);

// Hirer releases escrow after job completion
router.post("/release/:bookingId", requireRole("HIRER"), releasePayment);

// Hirer or Admin issues a refund
router.post("/refund/:bookingId", refundPayment);

// Worker views their earnings
router.get("/earnings", requireRole("WORKER"), getWorkerEarnings);

// Hirer or worker views payment for a specific booking
router.get("/:bookingId", getPayment);

// Admin views all payments
router.get("/", requireRole("ADMIN"), getAllPayments);

export default router;
