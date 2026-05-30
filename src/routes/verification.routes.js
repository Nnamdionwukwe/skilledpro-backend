// src/routes/verification.routes.js
import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  submitIdVerification,
  submitCertification,
  getVerificationStatus,
  deleteCertification,
  getPendingVerifications,
  getVerifiedWorkers,
  reviewVerification,
  verifyCertification,
  updateBackgroundCheck,
  getVerificationStats,
  submitHirerVerification,
  getHirerVerificationStatus,
  getPendingHirerVerifications,
  reviewHirerVerification,
} from "../controllers/verification.controller.js";
import {
  uploadSingle,
  normaliseFile,
} from "../middleware/upload.middleware.js";
import { validateUUIDParam, validatePagination } from "../utils/validators.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// WORKER routes
// ─────────────────────────────────────────────────────────────────────────────

// GET  /api/verification/status       — worker's own verification status
router.get("/status", protect, requireRole("WORKER"), getVerificationStatus);

// POST /api/verification/submit-id    — upload government ID for verification
router.post(
  "/submit-id",
  protect,
  requireRole("WORKER"),
  uploadSingle,
  normaliseFile,
  submitIdVerification,
);

// POST /api/verification/submit-certification — add a professional certificate
router.post(
  "/submit-certification",
  protect,
  requireRole("WORKER"),
  uploadSingle,
  normaliseFile,
  submitCertification,
);

// DELETE /api/verification/certifications/:certId
router.delete(
  "/certifications/:certId",
  protect,
  requireRole("WORKER"),
  ...validateUUIDParam("certId"),
  deleteCertification,
);

// ─────────────────────────────────────────────────────────────────────────────
// HIRER routes
// ─────────────────────────────────────────────────────────────────────────────

// GET  /api/verification/hirer/status — hirer's own verification status
router.get(
  "/hirer/status",
  protect,
  requireRole("HIRER"),
  getHirerVerificationStatus,
);

// POST /api/verification/hirer/submit — upload business / ID docs
router.post(
  "/hirer/submit",
  protect,
  requireRole("HIRER"),
  uploadSingle,
  normaliseFile,
  submitHirerVerification,
);

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN routes — all require ADMIN role
// Static paths come before parameterised ones to avoid route conflicts
// ─────────────────────────────────────────────────────────────────────────────

// GET  /api/verification/admin/stats
router.get("/admin/stats", protect, requireRole("ADMIN"), getVerificationStats);

// GET  /api/verification/admin/pending         — workers awaiting review
router.get(
  "/admin/pending",
  protect,
  requireRole("ADMIN"),
  validatePagination,
  getPendingVerifications,
);

// GET  /api/verification/admin/verified        — all verified workers
router.get(
  "/admin/verified",
  protect,
  requireRole("ADMIN"),
  validatePagination,
  getVerifiedWorkers,
);

// GET  /api/verification/admin/hirers/pending  — hirers awaiting review
router.get(
  "/admin/hirers/pending",
  protect,
  requireRole("ADMIN"),
  validatePagination,
  getPendingHirerVerifications,
);

// PATCH /api/verification/admin/certifications/:certId/verify
// (static sub-path — must come before /:userId routes)
router.patch(
  "/admin/certifications/:certId/verify",
  protect,
  requireRole("ADMIN"),
  ...validateUUIDParam("certId"),
  verifyCertification,
);

// PATCH /api/verification/admin/:userId/review          — approve or reject ID
router.patch(
  "/admin/:userId/review",
  protect,
  requireRole("ADMIN"),
  ...validateUUIDParam("userId"),
  reviewVerification,
);

// PATCH /api/verification/admin/:userId/background-check
router.patch(
  "/admin/:userId/background-check",
  protect,
  requireRole("ADMIN"),
  ...validateUUIDParam("userId"),
  updateBackgroundCheck,
);

// PATCH /api/verification/admin/hirers/:userId/review
router.patch(
  "/admin/hirers/:userId/review",
  protect,
  requireRole("ADMIN"),
  ...validateUUIDParam("userId"),
  reviewHirerVerification,
);

export default router;
