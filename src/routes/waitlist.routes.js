import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import * as waitlistController from "../controllers/waitlist.controller.js";

const router = express.Router();

// ─── Public Routes ──────────────────────────────────────────────────────────
// POST /api/waitlist - Join waitlist (PUBLIC) - Email only
router.post("/", waitlistController.joinWaitlist);

// GET /api/waitlist/confirm/:token - Confirm email (PUBLIC)
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

export default router;
