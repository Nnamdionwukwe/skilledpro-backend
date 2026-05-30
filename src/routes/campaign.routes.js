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
import {
  validateSocialFollow,
  validateCampaignWithdraw,
  validateUUIDParam,
  validatePagination,
} from "../utils/validators.js";

const router = Router();
router.use(protect);

// ── Referred-user task routes
router.get("/my-tasks", getMyTaskStatus);
router.post("/my-tasks/social", validateSocialFollow, reportSocialFollow);

// ── Referrer dashboard routes
router.get("/status", getCampaignStatus);
router.get("/referrals", validatePagination, getMyCampaignReferrals);
router.post("/submit", submitDailyCampaign);
router.get("/submissions", validatePagination, getCampaignSubmissions);
router.get("/wallet", validatePagination, getCampaignWallet);
router.post("/withdraw", validateCampaignWithdraw, withdrawCampaignEarnings);

// ── Admin routes
router.get("/admin/stats", requireRole("ADMIN"), adminGetCampaignStats);
router.get(
  "/admin/submissions",
  requireRole("ADMIN"),
  validatePagination,
  adminGetSubmissions,
);
router.patch(
  "/admin/submissions/:id/review",
  requireRole("ADMIN"),
  ...validateUUIDParam("id"),
  adminReviewSubmission,
);
router.get(
  "/admin/withdrawals",
  requireRole("ADMIN"),
  validatePagination,
  adminGetCampaignWithdrawals,
);
router.patch(
  "/admin/withdrawals/:id/approve",
  requireRole("ADMIN"),
  ...validateUUIDParam("id"),
  adminApproveCampaignWithdrawal,
);
router.patch(
  "/admin/withdrawals/:id/reject",
  requireRole("ADMIN"),
  ...validateUUIDParam("id"),
  adminRejectCampaignWithdrawal,
);

export default router;
