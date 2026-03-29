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
  getHirerPayments, // ← NEW
} from "../controllers/payment.controller.js";

const router = express.Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.post(
  "/webhook/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhook,
);

router.get("/verify/paystack", verifyPaystack);

// ── Protected ─────────────────────────────────────────────────────────────────
router.use(protect);

// Hirer: initiate payment
router.post(
  "/initiate/:bookingId",
  requireRole("HIRER"),
  initiateBookingPayment,
);

// Hirer: release escrow after job completion
router.post("/release/:bookingId", requireRole("HIRER"), releasePayment);

// Hirer or Admin: refund
router.post("/refund/:bookingId", refundPayment);

// Worker: earnings summary
router.get("/earnings", requireRole("WORKER"), getWorkerEarnings);

// Hirer: full payment history with receipts + summary totals
// ⚠️  MUST be defined before /:bookingId to prevent "hirer" being matched as a bookingId
router.get("/hirer", requireRole("HIRER"), getHirerPayments);

// Admin: all payments
router.get("/", requireRole("ADMIN"), getAllPayments);

// Hirer or Worker: single booking payment
// ⚠️  Wildcard — always last
router.get("/:bookingId", getPayment);

export default router;
