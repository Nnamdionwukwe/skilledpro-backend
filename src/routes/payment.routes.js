// src/routes/payment.routes.js  (updated with validators)
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
import {
  validateWithdrawal,
  validateConfirmBankTransfer,
  validateConfirmCrypto,
  validateVerifyAccount,
  validateUUIDParam,
  validatePagination,
} from "../utils/validators.js";

const router = Router();

// ── Webhooks (raw body, no auth, no validation — signature verified inside handler)
router.post("/webhook/flutterwave", express.json(), flutterwaveWebhook);
router.post("/webhook/paystack", express.json(), paystackWebhook);

// ── Public redirect callbacks
router.get("/verify/flutterwave", verifyFlutterwave);
router.get("/verify/paystack", verifyPaystack);

// ── Public utility
router.get("/banks", getBanksByCountry);

// ── Auth required
router.use(protect);

// ── Any authenticated user
router.post("/verify-account", validateVerifyAccount, verifyBankAccount);

// ── Hirer routes
router.post(
  "/initiate/:bookingId",
  requireRole("HIRER"),
  ...validateUUIDParam("bookingId"),
  initiateBookingPayment,
);
router.post(
  "/bank-transfer/:bookingId",
  requireRole("HIRER"),
  ...validateUUIDParam("bookingId"),
  initiateBankTransfer,
);
router.patch(
  "/bank-transfer/:bookingId/confirm",
  requireRole("HIRER"),
  validateConfirmBankTransfer,
  confirmBankTransfer,
);
router.post(
  "/crypto/:bookingId",
  requireRole("HIRER"),
  ...validateUUIDParam("bookingId"),
  initiateCryptoPayment,
);
router.patch(
  "/crypto/:bookingId/confirm",
  requireRole("HIRER"),
  validateConfirmCrypto,
  confirmCryptoPayment,
);
router.post(
  "/release/:bookingId",
  requireRole("HIRER"),
  ...validateUUIDParam("bookingId"),
  releasePayment,
);
router.get(
  "/hirer",
  requireRole("HIRER"),
  validatePagination,
  getHirerPayments,
);

// ── Worker routes
router.get(
  "/earnings",
  requireRole("WORKER"),
  validatePagination,
  getWorkerEarnings,
);
router.post(
  "/withdraw",
  requireRole("WORKER"),
  validateWithdrawal,
  requestWithdrawal,
);
router.get(
  "/withdrawals",
  requireRole("WORKER"),
  validatePagination,
  getWithdrawals,
);

// ── Admin
router.get("/", requireRole("ADMIN"), validatePagination, getAllPayments);

// ── Shared
router.post(
  "/refund/:bookingId",
  ...validateUUIDParam("bookingId"),
  refundPayment,
);

// ── Wildcard — must be last
router.get("/:bookingId", ...validateUUIDParam("bookingId"), getPayment);

export default router;
