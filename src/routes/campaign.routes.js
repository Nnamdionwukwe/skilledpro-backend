// src/routes/campaign.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// All 14 campaign endpoints — user + admin — clearly mapped.
// S2 audit warning is now resolved: every admin route is explicitly wired.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  getCampaignStatus,
  getMyCampaignReferrals,
  reportSocialFollow,
  getMyTaskStatus,
  submitDailyCampaign,
  getCampaignSubmissions,
  getCampaignWallet,
  withdrawCampaignEarnings,
  adminGetSubmissions,
  adminReviewSubmission,
  adminApproveCampaignWithdrawal,
  adminRejectCampaignWithdrawal,
  adminGetCampaignStats,
  adminGetCampaignWithdrawals,
} from "../controllers/campaign.controller.js";
import {
  validateSocialFollow,
  validateCampaignWithdraw,
  validateUUIDParam,
  validatePagination,
} from "../utils/validators.js";

const router = Router();
router.use(protect);

// ─────────────────────────────────────────────────────────────────────────────
// REFERRED-USER routes (the person who was referred does these)
// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/campaign/my-tasks              — see your task checklist
router.get("/my-tasks", getMyTaskStatus);
// POST /api/campaign/my-tasks/social      — report a social follow (FB/IG/TT)
router.post("/my-tasks/social", validateSocialFollow, reportSocialFollow);

// ─────────────────────────────────────────────────────────────────────────────
// REFERRER routes (the person who shared their code does these)
// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/campaign/status               — wallet + stats overview
router.get("/status", getCampaignStatus);
// GET  /api/campaign/referrals            — list all your referred users
router.get("/referrals", validatePagination, getMyCampaignReferrals);
// POST /api/campaign/submit               — submit today's TASKS_DONE batch
router.post("/submit", submitDailyCampaign);
// GET  /api/campaign/submissions          — your submission history
router.get("/submissions", validatePagination, getCampaignSubmissions);
// GET  /api/campaign/wallet               — wallet balance + transactions
router.get("/wallet", validatePagination, getCampaignWallet);
// POST /api/campaign/withdraw             — withdraw campaign earnings
router.post("/withdraw", validateCampaignWithdraw, withdrawCampaignEarnings);

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN routes (ADMIN role required)
// Placed AFTER user routes — all under /admin/* prefix, no ambiguity
// ─────────────────────────────────────────────────────────────────────────────

// GET  /api/campaign/admin/stats                       — campaign KPIs
router.get("/admin/stats", requireRole("ADMIN"), adminGetCampaignStats);

// GET  /api/campaign/admin/submissions                 — review queue
router.get(
  "/admin/submissions",
  requireRole("ADMIN"),
  validatePagination,
  adminGetSubmissions,
);

// PATCH /api/campaign/admin/submissions/:id/review     — approve/reject referrals
// Body: { decisions: [{ referralId, approved, note? }], adminNote? }
router.patch(
  "/admin/submissions/:id/review",
  requireRole("ADMIN"),
  ...validateUUIDParam("id"),
  adminReviewSubmission,
);

// GET  /api/campaign/admin/withdrawals                 — withdrawal queue
router.get(
  "/admin/withdrawals",
  requireRole("ADMIN"),
  validatePagination,
  adminGetCampaignWithdrawals,
);

// PATCH /api/campaign/admin/withdrawals/:id/approve    — pay out withdrawal
router.patch(
  "/admin/withdrawals/:id/approve",
  requireRole("ADMIN"),
  ...validateUUIDParam("id"),
  adminApproveCampaignWithdrawal,
);

// PATCH /api/campaign/admin/withdrawals/:id/reject     — reject + refund
router.patch(
  "/admin/withdrawals/:id/reject",
  requireRole("ADMIN"),
  ...validateUUIDParam("id"),
  adminRejectCampaignWithdrawal,
);

export default router;
