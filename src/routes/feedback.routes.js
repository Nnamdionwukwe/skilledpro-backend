// src/routes/feedback.routes.js
// Complete Feedback Routes

import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import * as feedbackController from "../controllers/feedback.controller.js";
import { validateFeedbackStatus } from "../utils/validators.js";

const router = express.Router();

// ─── Public Routes ──────────────────────────────────────────────────────────
router.post("/", feedbackController.submitFeedback);

// ─── Admin Routes ──────────────────────────────────────────────────────────
router.use(protect);
router.use(requireRole("ADMIN"));

router.get("/admin", feedbackController.getAllFeedback);
router.patch(
  "/admin/:id/status",
  validateFeedbackStatus,
  feedbackController.updateFeedbackStatus,
);
router.get("/admin/:id", feedbackController.getFeedbackById);
router.patch("/admin/:id/status", feedbackController.updateFeedbackStatus);
router.delete("/admin/:id", feedbackController.deleteFeedback);
router.get("/admin/export/csv", feedbackController.exportFeedbackCSV);

export default router;
