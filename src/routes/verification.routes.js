// src/routes/verification.routes.js
import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  // USER — worker
  submitIdVerification,
  submitCertification,
  getVerificationStatus,
  deleteCertification,
  // USER — hirer
  submitHirerVerification,
  getHirerVerificationStatus,
  // ADMIN — worker
  getPendingWorkers,
  getVerifiedWorkers,
  getRejectedWorkers,
  getUnverifiedWorkers,
  getWorkerVerificationDetail,
  reviewWorkerVerification,
  revokeWorkerVerification,
  updateBackgroundCheck,
  // ADMIN — hirer
  getPendingHirers,
  getVerifiedHirers,
  getRejectedHirers,
  getHirerVerificationDetail,
  reviewHirerVerification,
  revokeHirerVerification,
  // ADMIN — certifications
  getPendingCertifications,
  verifyCertification,
  rejectCertification,
  // ADMIN — summary
  getVerificationStats,
  getVerificationActivityLog,
} from "../controllers/verification.controller.js";
import {
  uploadSingle,
  normaliseFile,
} from "../middleware/upload.middleware.js";
import {
  validateUUIDParam,
  validatePagination,
  validateSubmitIdVerification,
  validateSubmitCertification,
  validateSubmitHirerVerification,
  validateReviewVerification,
  validateRevokeVerification,
  validateBackgroundCheck,
  validateRejectCertification,
} from "../utils/validators.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// USER — WORKER
// ─────────────────────────────────────────────────────────────────────────────
router.get("/status", protect, requireRole("WORKER"), getVerificationStatus);
router.post(
  "/submit-id",
  protect,
  requireRole("WORKER"),
  uploadSingle,
  normaliseFile,
  validateSubmitIdVerification,
  submitIdVerification,
);
router.post(
  "/submit-certification",
  protect,
  requireRole("WORKER"),
  uploadSingle,
  normaliseFile,
  validateSubmitCertification,
  submitCertification,
);
router.delete(
  "/certifications/:certId",
  protect,
  requireRole("WORKER"),
  ...validateUUIDParam("certId"),
  deleteCertification,
);

// ─────────────────────────────────────────────────────────────────────────────
// USER — HIRER
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/hirer/status",
  protect,
  requireRole("HIRER"),
  getHirerVerificationStatus,
);
router.post(
  "/hirer/submit",
  protect,
  requireRole("HIRER"),
  uploadSingle,
  normaliseFile,
  validateSubmitHirerVerification,
  submitHirerVerification,
);

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — all under /admin/* and require ADMIN
// Static paths come BEFORE parameterised paths.
// ─────────────────────────────────────────────────────────────────────────────

// Summary
router.get("/admin/stats", protect, requireRole("ADMIN"), getVerificationStats);
router.get(
  "/admin/activity",
  protect,
  requireRole("ADMIN"),
  getVerificationActivityLog,
);

// Worker lists
router.get(
  "/admin/workers/pending",
  protect,
  requireRole("ADMIN"),
  validatePagination,
  getPendingWorkers,
);
router.get(
  "/admin/workers/verified",
  protect,
  requireRole("ADMIN"),
  validatePagination,
  getVerifiedWorkers,
);
router.get(
  "/admin/workers/rejected",
  protect,
  requireRole("ADMIN"),
  validatePagination,
  getRejectedWorkers,
);
router.get(
  "/admin/workers/unverified",
  protect,
  requireRole("ADMIN"),
  validatePagination,
  getUnverifiedWorkers,
);

// Worker actions
router.patch(
  "/admin/workers/:userId/review",
  protect,
  requireRole("ADMIN"),
  ...validateUUIDParam("userId"),
  validateReviewVerification,
  reviewWorkerVerification,
);
router.patch(
  "/admin/workers/:userId/revoke",
  protect,
  requireRole("ADMIN"),
  ...validateUUIDParam("userId"),
  validateRevokeVerification,
  revokeWorkerVerification,
);
router.patch(
  "/admin/workers/:userId/background-check",
  protect,
  requireRole("ADMIN"),
  ...validateUUIDParam("userId"),
  validateBackgroundCheck,
  updateBackgroundCheck,
);

// Worker detail — after all static /admin/workers/* actions
router.get(
  "/admin/workers/:userId",
  protect,
  requireRole("ADMIN"),
  ...validateUUIDParam("userId"),
  getWorkerVerificationDetail,
);

// Hirer lists
router.get(
  "/admin/hirers/pending",
  protect,
  requireRole("ADMIN"),
  validatePagination,
  getPendingHirers,
);
router.get(
  "/admin/hirers/verified",
  protect,
  requireRole("ADMIN"),
  validatePagination,
  getVerifiedHirers,
);
router.get(
  "/admin/hirers/rejected",
  protect,
  requireRole("ADMIN"),
  validatePagination,
  getRejectedHirers,
);

// Hirer actions
router.patch(
  "/admin/hirers/:userId/review",
  protect,
  requireRole("ADMIN"),
  ...validateUUIDParam("userId"),
  validateReviewVerification,
  reviewHirerVerification,
);
router.patch(
  "/admin/hirers/:userId/revoke",
  protect,
  requireRole("ADMIN"),
  ...validateUUIDParam("userId"),
  validateRevokeVerification,
  revokeHirerVerification,
);

// Hirer detail — after all static /admin/hirers/* actions
router.get(
  "/admin/hirers/:userId",
  protect,
  requireRole("ADMIN"),
  ...validateUUIDParam("userId"),
  getHirerVerificationDetail,
);

// Certifications
router.get(
  "/admin/certifications/pending",
  protect,
  requireRole("ADMIN"),
  validatePagination,
  getPendingCertifications,
);
router.patch(
  "/admin/certifications/:certId/verify",
  protect,
  requireRole("ADMIN"),
  ...validateUUIDParam("certId"),
  verifyCertification,
);
router.patch(
  "/admin/certifications/:certId/reject",
  protect,
  requireRole("ADMIN"),
  ...validateUUIDParam("certId"),
  validateRejectCertification,
  rejectCertification,
);

export default router;
