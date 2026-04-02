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
  requestWithdrawal,
  getWithdrawals,
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

// Worker: request a payout withdrawal — BEFORE /:bookingId wildcard
router.post("/withdraw", requireRole("WORKER"), requestWithdrawal);

// Worker: get withdrawal history + live balance — BEFORE /:bookingId wildcard
router.get("/withdrawals", requireRole("WORKER"), getWithdrawals);

// Hirer: full payment history — BEFORE /:bookingId wildcard
router.get("/hirer", requireRole("HIRER"), getHirerPayments);

// Admin: all payments
router.get("/", requireRole("ADMIN"), getAllPayments);

// Hirer or Worker: single booking payment detail — wildcard, always last
router.get("/:bookingId", getPayment);

export default router;
