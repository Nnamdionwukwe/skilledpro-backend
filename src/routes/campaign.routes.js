// src/routes/campaign.routes.js
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

const router = Router();

// ── Referred-user task routes (any authenticated user who was referred) ────────
router.get("/my-tasks", protect, getMyTaskStatus);
router.post("/my-tasks/social", protect, reportSocialFollow);

// ── Referrer dashboard routes ─────────────────────────────────────────────────
router.get("/status", protect, getCampaignStatus);
router.get("/referrals", protect, getMyCampaignReferrals);
router.post("/submit", protect, submitDailyCampaign);
router.get("/submissions", protect, getCampaignSubmissions);
router.get("/wallet", protect, getCampaignWallet);
router.post("/withdraw", protect, withdrawCampaignEarnings);

// ── Admin routes ──────────────────────────────────────────────────────────────
router.get(
  "/admin/stats",
  protect,
  requireRole("ADMIN"),
  adminGetCampaignStats,
);
router.get(
  "/admin/submissions",
  protect,
  requireRole("ADMIN"),
  adminGetSubmissions,
);
router.patch(
  "/admin/submissions/:id/review",
  protect,
  requireRole("ADMIN"),
  adminReviewSubmission,
);
router.get(
  "/admin/withdrawals",
  protect,
  requireRole("ADMIN"),
  adminGetCampaignWithdrawals,
);
router.patch(
  "/admin/withdrawals/:id/approve",
  protect,
  requireRole("ADMIN"),
  adminApproveCampaignWithdrawal,
);
router.patch(
  "/admin/withdrawals/:id/reject",
  protect,
  requireRole("ADMIN"),
  adminRejectCampaignWithdrawal,
);

export default router;
