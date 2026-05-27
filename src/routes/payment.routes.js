// src/routes/payment.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// Payment routes for SkilledProz
//   Providers: Flutterwave (international) | Paystack (NGN/Africa) | Crypto | Bank Transfer
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  initiateBookingPayment,
  verifyFlutterwave,
  verifyPaystack,
  flutterwaveWebhook,
  paystackWebhook,
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
  getBanksByCountry,
  verifyBankAccount,
} from "../controllers/payment.controller.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOKS — raw body, NO auth middleware
// ─────────────────────────────────────────────────────────────────────────────
router.post("/webhook/flutterwave", express.json(), flutterwaveWebhook);

router.post("/webhook/paystack", express.json(), paystackWebhook);

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC REDIRECT CALLBACKS (after payment gateway redirect)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/payments/verify/flutterwave?tx_ref=...&transaction_id=...&status=...
router.get("/verify/flutterwave", verifyFlutterwave);

// GET /api/payments/verify/paystack?reference=...
router.get("/verify/paystack", verifyPaystack);

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — UTILITY
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/payments/banks?country=NG
// Returns list of banks for a given country code (NG → Paystack, others → FLW)
router.get("/banks", getBanksByCountry);

// ─────────────────────────────────────────────────────────────────────────────
// AUTH REQUIRED — all routes below need a valid JWT
// ─────────────────────────────────────────────────────────────────────────────
router.use(protect);

// ── UTILITY (any auth'd user) ─────────────────────────────────────────────────
// POST /api/payments/verify-account — resolve bank account name before withdrawing
router.post("/verify-account", verifyBankAccount);

// ─────────────────────────────────────────────────────────────────────────────
// HIRER routes
// ─────────────────────────────────────────────────────────────────────────────

// Initiate payment for a booking (smart routing: Paystack for NGN, FLW for everything else)
// POST /api/payments/initiate/:bookingId
router.post(
  "/initiate/:bookingId",
  requireRole("HIRER"),
  initiateBookingPayment,
);

// Bank transfer — get details
// POST /api/payments/bank-transfer/:bookingId
router.post(
  "/bank-transfer/:bookingId",
  requireRole("HIRER"),
  initiateBankTransfer,
);

// Bank transfer — hirer confirms they sent
// PATCH /api/payments/bank-transfer/:bookingId/confirm
router.patch(
  "/bank-transfer/:bookingId/confirm",
  requireRole("HIRER"),
  confirmBankTransfer,
);

// Crypto — get wallet details
// POST /api/payments/crypto/:bookingId
router.post("/crypto/:bookingId", requireRole("HIRER"), initiateCryptoPayment);

// Crypto — hirer confirms tx hash
// PATCH /api/payments/crypto/:bookingId/confirm
router.patch(
  "/crypto/:bookingId/confirm",
  requireRole("HIRER"),
  confirmCryptoPayment,
);

// Release escrow to worker (hirer marks job complete)
// POST /api/payments/release/:bookingId
router.post("/release/:bookingId", requireRole("HIRER"), releasePayment);

// Hirer payment history
// GET /api/payments/hirer?status=&currency=&page=&limit=
router.get("/hirer", requireRole("HIRER"), getHirerPayments);

// ─────────────────────────────────────────────────────────────────────────────
// WORKER routes
// ─────────────────────────────────────────────────────────────────────────────

// Earnings breakdown
// GET /api/payments/earnings?from=&to=&currency=&page=&limit=
router.get("/earnings", requireRole("WORKER"), getWorkerEarnings);

// Request withdrawal (bank_transfer | mobile_money | crypto)
// POST /api/payments/withdraw
// Body: see § 11 in payment.controller.js
router.post("/withdraw", requireRole("WORKER"), requestWithdrawal);

// Withdrawal history + live wallet balance
// GET /api/payments/withdrawals?page=&limit=
router.get("/withdrawals", requireRole("WORKER"), getWithdrawals);

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN routes
// ─────────────────────────────────────────────────────────────────────────────

// All platform payments
// GET /api/payments?status=&provider=&currency=&page=&limit=
router.get("/", requireRole("ADMIN"), getAllPayments);

// ─────────────────────────────────────────────────────────────────────────────
// SHARED — Hirer or Admin: refund
// POST /api/payments/refund/:bookingId
// ─────────────────────────────────────────────────────────────────────────────
router.post("/refund/:bookingId", refundPayment);

// ─────────────────────────────────────────────────────────────────────────────
// WILDCARD — single booking payment (must be last to avoid swallowing named routes)
// GET /api/payments/:bookingId
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:bookingId", getPayment);

export default router;
