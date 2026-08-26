// src/routes/waitlist.routes.js

import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import * as waitlistController from "../controllers/waitlist.controller.js";

const router = express.Router();

// ─── Public Routes ──────────────────────────────────────────────────────────

// POST /api/waitlist - Join waitlist
router.post("/", waitlistController.joinWaitlist);

// GET /api/waitlist/confirm/:token - Confirm email
router.get("/confirm/:token", waitlistController.confirmWaitlist);

// GET /api/waitlist/validate/:code - Validate referral code
router.get("/validate/:code", waitlistController.validateReferralCode);

// ─── Protected Routes (User) ──────────────────────────────────────────────

// GET /api/waitlist/referral/:code - Get referral stats (requires auth)
router.get("/referral/:code", protect, waitlistController.getReferralStats);

// POST /api/waitlist/claim-bonus - Claim bonuses (requires auth)
router.post("/claim-bonus", protect, waitlistController.claimBonus);

// ─── Admin Routes ──────────────────────────────────────────────────────────

router.use(protect);
router.use(requireRole("ADMIN"));

// GET /api/waitlist/admin/stats - Get stats
router.get("/admin/stats", waitlistController.getWaitlistStats);

// GET /api/waitlist/admin/entries - Get all entries
router.get("/admin/entries", waitlistController.getAllWaitlistEntries);

// GET /api/waitlist/admin/entries/:id - Get single entry
router.get("/admin/entries/:id", waitlistController.getWaitlistEntry);

// PATCH /api/waitlist/admin/entries/:id/status - Update status
router.patch(
  "/admin/entries/:id/status",
  waitlistController.updateWaitlistStatus,
);

// GET /api/waitlist/admin/export/csv - Export CSV
router.get("/admin/export/csv", waitlistController.exportWaitlistCSV);

export default router;
