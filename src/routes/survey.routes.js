// src/routes/survey.routes.js

import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import * as surveyController from "../controllers/survey.controller.js";
import * as validators from "../utils/validators.js";

const router = express.Router();

// ─── Public Routes ──────────────────────────────────────────────────────────
// POST /api/survey - Submit survey
router.post(
  "/",
  validators.validateSubmitSurvey,
  surveyController.submitSurvey,
);

// ─── Admin Routes ──────────────────────────────────────────────────────────
router.use(protect);
router.use(requireRole("ADMIN"));

// GET /api/survey/admin/stats - Survey statistics
router.get(
  "/admin/stats",
  validators.validateGetSurveyStats,
  surveyController.getSurveyStats,
);

// GET /api/survey/admin/responses - List all responses
router.get(
  "/admin/responses",
  validators.validateGetAllSurveyResponses,
  surveyController.getAllSurveyResponses,
);

// GET /api/survey/admin/responses/:id - Get single response
router.get(
  "/admin/responses/:id",
  validators.validateGetSurveyResponseById,
  surveyController.getSurveyResponseById,
);

// PATCH /api/survey/admin/responses/:id/status - Update status
router.patch(
  "/admin/responses/:id/status",
  validators.validateUpdateSurveyStatus,
  surveyController.updateSurveyStatus,
);

// DELETE /api/survey/admin/responses/bulk - Bulk delete
router.delete(
  "/admin/responses/bulk",
  validators.validateBulkDeleteSurveyResponses,
  surveyController.bulkDeleteSurveyResponses,
);

// GET /api/survey/admin/export/csv - Export CSV
router.get(
  "/admin/export/csv",
  validators.validateExportSurveyCSV,
  surveyController.exportSurveyCSV,
);

export default router;
