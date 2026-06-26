// src/routes/payment.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// Full payment routes including the new invoice endpoint.
//
// IMPORTANT: /invoice/:bookingId MUST come before /:bookingId
// or Express will match "invoice" as the bookingId.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  initiateBookingPayment,
  verifyPaystack,
  verifyFlutterwave,
  paystackWebhook,
  flutterwaveWebhook,
  initiateBankTransfer,
  confirmBankTransfer,
  initiateCryptoPayment,
  confirmCryptoPayment,
  releasePayment,
  refundPayment,
  getHirerPayments,
  getWorkerEarnings,
  requestWithdrawal,
  getWithdrawals,
  approveWithdrawalPayout,
  getBanksByCountry,
  verifyBankAccount,
  getPayment,
  getAllPayments,
  setWithdrawalPin,
  changeWithdrawalPin,
  getWithdrawalPinStatus,
} from "../controllers/payment.controller.js";
import { getPaymentInvoice } from "../controllers/invoice.controller.js";
import {
  validateInitiatePayment,
  validateConfirmBankTransfer,
  validateConfirmCryptoPayment,
  validateRequestWithdrawal,
  validateVerifyBankAccount,
  validateUUIDParam,
  validatePagination,
} from "../utils/validators.js";

import {
  uploadSingle,
  normaliseFile,
} from "../middleware/upload.middleware.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOKS — public, no auth (Paystack/Flutterwave calls these directly)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/webhook/paystack", paystackWebhook);
router.post("/webhook/flutterwave", flutterwaveWebhook);

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC VERIFICATION ENDPOINTS — no auth required (called after redirect)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/verify/paystack", verifyPaystack);
router.get("/verify/flutterwave", verifyFlutterwave);

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATED from here down
// ─────────────────────────────────────────────────────────────────────────────
router.use(protect);

// ── Bank utilities ────────────────────────────────────────────────────────────
router.get("/banks", validatePagination, getBanksByCountry);
router.post("/verify-account", validateVerifyBankAccount, verifyBankAccount);

// ── Initiate payment (Paystack card checkout) ─────────────────────────────────
router.post(
  "/initiate/:bookingId",
  ...validateUUIDParam("bookingId"),
  validateInitiatePayment,
  initiateBookingPayment,
);

// ── Bank transfer flow ────────────────────────────────────────────────────────
router.post(
  "/bank-transfer/:bookingId",
  ...validateUUIDParam("bookingId"),
  initiateBankTransfer,
);

router.patch(
  "/bank-transfer/:bookingId/confirm",
  ...validateUUIDParam("bookingId"),
  uploadSingle,
  normaliseFile,
  validateConfirmBankTransfer,
  confirmBankTransfer,
);

// ── Crypto flow ───────────────────────────────────────────────────────────────
router.post(
  "/crypto/:bookingId",
  ...validateUUIDParam("bookingId"),
  initiateCryptoPayment,
);

router.patch(
  "/crypto/:bookingId/confirm",
  ...validateUUIDParam("bookingId"),
  uploadSingle,
  normaliseFile,
  validateConfirmCryptoPayment,
  confirmCryptoPayment,
);

// ── Escrow release ────────────────────────────────────────────────────────────
router.post(
  "/release/:bookingId",
  ...validateUUIDParam("bookingId"),
  releasePayment,
);

// ── Refund (admin or hirer within refund window) ──────────────────────────────
router.post(
  "/refund/:bookingId",
  ...validateUUIDParam("bookingId"),
  refundPayment,
);

// ── Invoice PDF — hirer or admin only ─────────────────────────────────────────
// NOTE: this MUST be defined before GET /:bookingId below
router.get(
  "/invoice/:bookingId",
  ...validateUUIDParam("bookingId"),
  getPaymentInvoice,
);

// ── Hirer payment history ─────────────────────────────────────────────────────
router.get("/hirer", validatePagination, getHirerPayments);

// ── Worker earnings ───────────────────────────────────────────────────────────
router.get("/earnings", validatePagination, getWorkerEarnings);

// ── Withdrawal PIN management (workers only) ──────────────────────────────────
router.get("/pin/status", requireRole("WORKER"), getWithdrawalPinStatus);
router.post("/pin/set", requireRole("WORKER"), setWithdrawalPin);
router.post("/pin/change", requireRole("WORKER"), changeWithdrawalPin);

// ── Worker withdrawal ─────────────────────────────────────────────────────────
router.post("/withdraw", validateRequestWithdrawal, requestWithdrawal);
router.get("/withdrawals", validatePagination, getWithdrawals);

// ── Admin: approve payout ─────────────────────────────────────────────────────
router.post(
  "/withdrawals/:withdrawalId/payout",
  requireRole("ADMIN"),
  ...validateUUIDParam("withdrawalId"),
  approveWithdrawalPayout,
);

// ── All payments (admin) ──────────────────────────────────────────────────────
router.get("/", requireRole("ADMIN"), validatePagination, getAllPayments);

// ── Single payment lookup — MUST come last (catches /:bookingId) ───────────────
router.get("/:bookingId", ...validateUUIDParam("bookingId"), getPayment);

export default router;
