// src/routes/waitlist.routes.js

import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import * as waitlistController from "../controllers/waitlist.controller.js";

const router = express.Router();

// ─── Public Routes ──────────────────────────────────────────────────────────
router.post("/", waitlistController.joinWaitlist);
router.get("/confirm/:token", waitlistController.confirmWaitlist);

// ─── Admin Routes ──────────────────────────────────────────────────────────
router.use(protect);
router.use(requireRole("ADMIN"));

router.get("/admin/stats", waitlistController.getWaitlistStats);
router.get("/admin/entries", waitlistController.getAllWaitlistEntries);
router.get("/admin/entries/:id", waitlistController.getWaitlistEntry);
router.patch(
  "/admin/entries/:id/status",
  waitlistController.updateWaitlistStatus,
);
router.get("/admin/export/csv", waitlistController.exportWaitlistCSV);
router.post("/admin/broadcast", waitlistController.broadcastEmail);
router.get("/admin/campaigns", waitlistController.getCampaigns);
router.post("/admin/launch", waitlistController.sendLaunchAnnouncement);

export default router;
