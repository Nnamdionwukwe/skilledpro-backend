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
  getHirerPayments,
} from "../controllers/payment.controller.js";

const router = express.Router();

// ── Public — Stripe webhook (no auth, Stripe signs it) ────────────────────────
router.post(
  "/webhook/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhook,
);

// ── Public — Paystack redirect callback ───────────────────────────────────────
router.get("/verify/paystack", verifyPaystack);

// ── All routes below require authentication ───────────────────────────────────
router.use(protect);

// Hirer: initiate payment for an accepted booking
router.post(
  "/initiate/:bookingId",
  requireRole("HIRER"),
  initiateBookingPayment,
);

// Hirer: release escrow after job completion
router.post("/release/:bookingId", requireRole("HIRER"), releasePayment);

// Hirer or Admin: issue a refund
router.post("/refund/:bookingId", refundPayment);

// Worker: earnings summary
router.get("/earnings", requireRole("WORKER"), getWorkerEarnings);

// Hirer: full payment history with receipts and summary totals
// ⚠️  Must be defined BEFORE /:bookingId — otherwise Express matches
//     the literal string "hirer" as a bookingId param and returns 404
router.get("/hirer", requireRole("HIRER"), getHirerPayments);

// Admin: all payments
router.get("/", requireRole("ADMIN"), getAllPayments);

// Hirer or Worker: single booking payment detail
// ⚠️  Wildcard — always last
router.get("/:bookingId", getPayment);

export default router;
