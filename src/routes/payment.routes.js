import { Router } from "express";
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
  initiateBankTransfer,
  confirmBankTransfer,
  initiateCryptoPayment,
  confirmCryptoPayment,
} from "../controllers/payment.controller.js";

const router = Router();

// ── Stripe webhook — raw body, no auth ────────────────────────────────────────
router.post(
  "/webhook/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhook,
);

// ── Public — Paystack redirect ────────────────────────────────────────────────
router.get("/verify/paystack", verifyPaystack);

// ── All below require auth ────────────────────────────────────────────────────
router.use(protect);

// Hirer: initiate payment
router.post(
  "/initiate/:bookingId",
  requireRole("HIRER"),
  initiateBookingPayment,
);

// ── Bank transfer ─────────────────────────────────────────────────────────────
router.post(
  "/bank-transfer/:bookingId",
  requireRole("HIRER"),
  initiateBankTransfer,
);
router.patch("/bank-transfer/:bookingId/confirm", confirmBankTransfer);

// ── Crypto ────────────────────────────────────────────────────────────────────
router.post("/crypto/:bookingId", requireRole("HIRER"), initiateCryptoPayment);
router.patch("/crypto/:bookingId/confirm", confirmCryptoPayment);

// Hirer: release escrow
router.post("/release/:bookingId", requireRole("HIRER"), releasePayment);

// Hirer or Admin: refund
router.post("/refund/:bookingId", refundPayment);

// Worker: earnings + withdrawals — before /:bookingId wildcard
router.get("/earnings", requireRole("WORKER"), getWorkerEarnings);
router.post("/withdraw", requireRole("WORKER"), requestWithdrawal);
router.get("/withdrawals", requireRole("WORKER"), getWithdrawals);

// Hirer: payment history
router.get("/hirer", requireRole("HIRER"), getHirerPayments);

// Admin: all payments
router.get("/", requireRole("ADMIN"), getAllPayments);

// Single booking payment — wildcard last
router.get("/:bookingId", getPayment);

export default router;
