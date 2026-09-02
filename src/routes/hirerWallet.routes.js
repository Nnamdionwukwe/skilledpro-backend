// src/routes/hirerWallet.routes.js
// Hirer Wallet Routes with Multi-Currency Support

import express from "express";
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
router.get("/balances", walletController.getAllWalletBalances);

// Get balance for a specific currency
router.get("/balance", walletController.getWalletBalance);

// Get supported currencies
router.get("/currencies", walletController.getSupportedCurrencies);

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
