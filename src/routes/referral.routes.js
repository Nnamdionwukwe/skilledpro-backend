// src/routes/referral.routes.js
import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  validateReferralCode, // public validator (same name as function — no clash)
  getMyReferralCode, // was: getReferralCode         ← FIXED
  getMyReferralDashboard, // was: getReferralDashboard    ← FIXED
  getMyWallet, // was: getReferralWallet        ← FIXED
  getReferralLeaderboard, // was: getLeaderboard           ← FIXED
  withdrawReferralEarnings, // was: withdrawReferral         ← FIXED
  adminGetAllReferrals, // was: adminGetReferrals        ← FIXED
  adminGetReferralStats, // was: adminGetReferralDetail   ← FIXED (no single-detail fn exists)
  adminFlagReferral, // was: adminApproveReferral     ← FIXED (approve doesn't exist; flag does)
  adminExpireReferral, // was: adminRejectReferral      ← FIXED
  adminManualReward, // was: adminProcessReferralPayout ← FIXED
  adminAdjustWallet, // bonus: also available for wallet adjustments
} from "../controllers/referral.controller.js";
import {
  validateReferralCode as validateReferralCodeInput, // the express-validator array
  validateReferralWithdraw,
  validateUUIDParam,
  validatePagination,
} from "../utils/validators.js";

const router = Router();

// ── Public: validate a referral code before registration ─────────────────────
router.get("/validate/:code", validateReferralCodeInput, validateReferralCode);

// ── Protected from here down ──────────────────────────────────────────────────
router.use(protect);

router.get("/code", getMyReferralCode);
router.get("/dashboard", getMyReferralDashboard);
router.get("/wallet", validatePagination, getMyWallet);
router.get("/leaderboard", getReferralLeaderboard);
router.post("/withdraw", validateReferralWithdraw, withdrawReferralEarnings);

// ── Admin routes ──────────────────────────────────────────────────────────────
router.get(
  "/admin",
  requireRole("ADMIN"),
  validatePagination,
  adminGetAllReferrals,
);
router.get("/admin/stats", requireRole("ADMIN"), adminGetReferralStats);
router.patch(
  "/admin/:id/flag",
  requireRole("ADMIN"),
  ...validateUUIDParam("id"),
  adminFlagReferral,
);
router.patch(
  "/admin/:id/expire",
  requireRole("ADMIN"),
  ...validateUUIDParam("id"),
  adminExpireReferral,
);
router.post(
  "/admin/:id/reward",
  requireRole("ADMIN"),
  ...validateUUIDParam("id"),
  adminManualReward,
);
router.patch(
  "/admin/:id/wallet",
  requireRole("ADMIN"),
  ...validateUUIDParam("id"),
  adminAdjustWallet,
);

export default router;
