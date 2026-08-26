// src/routes/hirerWallet.routes.js
// Hirer Wallet Routes

import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import * as walletController from "../controllers/hirerWallet.controller.js";

const router = express.Router();

// ─── Protected Routes (Hirer only) ──────────────────────────────────────────
router.use(protect);
router.use(requireRole("HIRER"));

// Wallet balance & transactions
router.get("/balance", walletController.getWalletBalance);
router.get("/transactions", walletController.getWalletTransactions);

// Funding
router.post("/fund", walletController.fundWallet);
router.get("/verify/:reference", walletController.verifyTransaction);

// Withdrawals
router.post("/withdraw", walletController.requestWithdrawal);

// ─── Admin Routes ──────────────────────────────────────────────────────────
// These require ADMIN role (will be handled in admin routes)
// router.get("/admin/withdrawals", walletController.getWithdrawals);
// router.patch("/admin/withdrawals/:id", walletController.processWithdrawal);
// router.get("/admin/stats", walletController.getWalletStats);

export default router;
