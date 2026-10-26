// src/routes/hirerWallet.routes.js
// Hirer Wallet Routes with Multi-Currency Support

import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import * as walletController from "../controllers/hirerWallet.controller.js";
import {
  validateWalletFund,
  validateWalletWithdraw,
  validateWalletTransaction,
} from "../utils/validators.js";

const router = express.Router();

// ─── Public Webhook (no auth) ─────────────────────────────────────────────
router.post("/webhook/flutterwave", walletController.flutterwaveWebhook);

// ─── Debug (no auth — for manual recovery) ────────────────────────────────
router.post("/debug/credit/:reference", walletController.debugCreditDeposit);

// ─── Per-user rate limiter for wallet reads ───────────────────────────────
// The frontend polls /wallet/balances and /wallet/balance during deposits.
// Keying by req.user.id gives each hirer their own budget, so NAT'd networks
// (offices, mobile carriers) don't share a bucket. 60 reads/min covers
// 5-second polling with plenty of headroom.
const walletReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many wallet requests. Please slow down and try again.",
  },
});

// ─── Admin Routes ──────────────────────────────────────────────────────────
router.get(
  "/admin/withdrawals",
  protect,
  requireRole("ADMIN"),
  walletController.getWithdrawals,
);
router.patch(
  "/admin/withdrawals/:id/approve",
  protect,
  requireRole("ADMIN"),
  walletController.approveWithdrawal,
);
router.patch(
  "/admin/withdrawals/:id/reject",
  protect,
  requireRole("ADMIN"),
  walletController.rejectWithdrawal,
);
router.get(
  "/admin/stats",
  protect,
  requireRole("ADMIN"),
  walletController.getWalletStats,
);

// ─── Protected Routes ──────────────────────────────────────────────────────
// These require authentication (both ADMIN and HIRER)
router.get(
  "/transactions",
  protect,
  requireRole("ADMIN", "HIRER"),
  validateWalletTransaction,
  walletController.getWalletTransactions,
);

// ─── Hirer Routes ──────────────────────────────────────────────────────────
// These require HIRER role
router.use(protect);
router.use(requireRole("HIRER"));

// Get balances (multi-currency)
router.get(
  "/balances",
  walletReadLimiter,
  walletController.getAllWalletBalances,
);

// Get balance for a specific currency
router.get("/balance", walletReadLimiter, walletController.getWalletBalance);

// Get supported currencies
router.get(
  "/currencies",
  walletReadLimiter,
  walletController.getSupportedCurrencies,
);

// Funding
router.post("/fund", validateWalletFund, walletController.fundWallet);
router.get("/verify/:reference", walletController.verifyTransaction);

// Withdrawals
router.post(
  "/withdraw",
  validateWalletWithdraw,
  walletController.requestWithdrawal,
);

export default router;
