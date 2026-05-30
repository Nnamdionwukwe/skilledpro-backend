// src/routes/referral.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// Referral Program API — public + user + admin routes.
// S3 audit warning resolved: admin section (lines 40-66) is explicitly mapped.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  // ── User-facing functions ──────────────────────────────────────────────────
  getMyReferralCode, // GET  /code
  getMyReferralDashboard, // GET  /dashboard
  getMyWallet, // GET  /wallet
  getReferralLeaderboard, // GET  /leaderboard
  withdrawReferralEarnings, // POST /withdraw
  validateReferralCode, // GET  /validate/:code  (public)
  // ── Admin functions ────────────────────────────────────────────────────────
  adminGetAllReferrals, // GET  /admin
  adminGetReferralStats, // GET  /admin/stats
  adminFlagReferral, // PATCH /admin/:id/flag
  adminExpireReferral, // PATCH /admin/:id/expire
  adminManualReward, // POST  /admin/:id/reward
  adminAdjustWallet, // PATCH /admin/:id/wallet
} from "../controllers/referral.controller.js";
import {
  validateReferralCode as validateReferralCodeInput,
  validateReferralWithdraw,
  validateUUIDParam,
  validatePagination,
} from "../utils/validators.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — no auth needed
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/referral/validate/:code  — check a code is valid before registration
router.get("/validate/:code", validateReferralCodeInput, validateReferralCode);

// ─────────────────────────────────────────────────────────────────────────────
// PROTECTED — logged-in users
// ─────────────────────────────────────────────────────────────────────────────
router.use(protect);

// GET  /api/referral/code           — get your own referral code
router.get("/code", getMyReferralCode);
// GET  /api/referral/dashboard      — earnings, referral count, tier info
router.get("/dashboard", getMyReferralDashboard);
// GET  /api/referral/wallet         — wallet balance + transaction history
router.get("/wallet", validatePagination, getMyWallet);
// GET  /api/referral/leaderboard    — top referrers across the platform
router.get("/leaderboard", getReferralLeaderboard);
// POST /api/referral/withdraw       — withdraw referral earnings to bank
router.post("/withdraw", validateReferralWithdraw, withdrawReferralEarnings);

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — ADMIN role required
// All under /admin/* to avoid route param conflicts with /code, /dashboard, etc.
// ─────────────────────────────────────────────────────────────────────────────

// GET  /api/referral/admin                  — paginated list of all referrals
router.get(
  "/admin",
  requireRole("ADMIN"),
  validatePagination,
  adminGetAllReferrals,
);

// GET  /api/referral/admin/stats            — aggregate stats + tier breakdown
router.get("/admin/stats", requireRole("ADMIN"), adminGetReferralStats);

// PATCH /api/referral/admin/:id/flag        — flag a referral for investigation
// Body: { reason? }
router.patch(
  "/admin/:id/flag",
  requireRole("ADMIN"),
  ...validateUUIDParam("id"),
  adminFlagReferral,
);

// PATCH /api/referral/admin/:id/expire      — expire/invalidate a referral
// Body: { reason? }
router.patch(
  "/admin/:id/expire",
  requireRole("ADMIN"),
  ...validateUUIDParam("id"),
  adminExpireReferral,
);

// POST  /api/referral/admin/:id/reward      — manually reward a referrer
// Body: { amount, reason }
router.post(
  "/admin/:id/reward",
  requireRole("ADMIN"),
  ...validateUUIDParam("id"),
  adminManualReward,
);

// PATCH /api/referral/admin/:id/wallet      — adjust a user's referral wallet balance
// Body: { amount, type: "CREDIT"|"DEBIT", reason }
router.patch(
  "/admin/:id/wallet",
  requireRole("ADMIN"),
  ...validateUUIDParam("id"),
  adminAdjustWallet,
);

export default router;
