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
} from "../controllers/payment.controller.js";
import { getPaymentInvoice } from "../controllers/invoice.controller.js"; // ← NEW
import {
  validateInitiatePayment,
  validateBankTransfer,
  validateConfirmBankTransfer,
  validateInitiateCryptoPayment,
  validateConfirmCryptoPayment,
  validateRequestWithdrawal,
  validateVerifyBankAccount,
  validateUUIDParam,
  validatePagination,
} from "../utils/validators.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOKS — public, no auth (Paystack/Flutterwave calls these directly)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/webhook/paystack", paystackWebhook);
router.post("/webhook/flutterwave", flutterwaveWebhook);

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATED from here down
// ─────────────────────────────────────────────────────────────────────────────
router.use(protect);

// ── Paystack / Flutterwave verification ───────────────────────────────────────
router.get("/verify/paystack", verifyPaystack);
router.get("/verify/flutterwave", verifyFlutterwave);

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
  validateBankTransfer,
  initiateBankTransfer,
);

router.patch(
  "/bank-transfer/:bookingId/confirm",
  ...validateUUIDParam("bookingId"),
  validateConfirmBankTransfer,
  confirmBankTransfer,
);

// ── Crypto flow ───────────────────────────────────────────────────────────────
router.post(
  "/crypto/:bookingId",
  ...validateUUIDParam("bookingId"),
  validateInitiateCryptoPayment,
  initiateCryptoPayment,
);

router.patch(
  "/crypto/:bookingId/confirm",
  ...validateUUIDParam("bookingId"),
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
// GET /api/payments/invoice/:bookingId → streams a PDF invoice
router.get(
  "/invoice/:bookingId",
  ...validateUUIDParam("bookingId"),
  getPaymentInvoice,
);

// ── Hirer payment history ─────────────────────────────────────────────────────
router.get("/hirer", validatePagination, getHirerPayments);

// ── Worker earnings ───────────────────────────────────────────────────────────
router.get("/earnings", validatePagination, getWorkerEarnings);

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
