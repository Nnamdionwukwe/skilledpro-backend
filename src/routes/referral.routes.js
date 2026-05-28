// src/routes/referral.routes.js

import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  getMyReferralCode,
  validateReferralCode,
  getMyReferralDashboard,
  getMyWallet,
  withdrawReferralEarnings,
  getReferralLeaderboard,
  adminGetAllReferrals,
  adminGetReferralStats,
  adminFlagReferral,
  adminAdjustWallet,
  adminManualReward,
  adminExpireReferral,
} from "../controllers/referral.controller.js";

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────
// Validate a referral code on the signup page before the user creates an account
router.get("/validate/:code", validateReferralCode);

// ── Authenticated user ────────────────────────────────────────────────────────
router.get("/code", protect, getMyReferralCode);
router.get("/dashboard", protect, getMyReferralDashboard);
router.get("/wallet", protect, getMyWallet);
router.get("/leaderboard", protect, getReferralLeaderboard);
router.post("/withdraw", protect, withdrawReferralEarnings);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.get("/admin", protect, requireRole("ADMIN"), adminGetAllReferrals);
router.get(
  "/admin/stats",
  protect,
  requireRole("ADMIN"),
  adminGetReferralStats,
);
router.patch(
  "/admin/:id/flag",
  protect,
  requireRole("ADMIN"),
  adminFlagReferral,
);
router.patch(
  "/admin/:id/manual-reward",
  protect,
  requireRole("ADMIN"),
  adminManualReward,
);
router.patch(
  "/admin/:id/expire",
  protect,
  requireRole("ADMIN"),
  adminExpireReferral,
);
router.post(
  "/admin/adjust-wallet",
  protect,
  requireRole("ADMIN"),
  adminAdjustWallet,
);

export default router;
