import { Router } from "express";
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
  // ── new hirer exports ──
  submitHirerVerification,
  getHirerVerificationStatus,
  getPendingHirerVerifications,
  reviewHirerVerification,
} from "../controllers/verification.controller.js";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  uploadSingle,
  normaliseFile,
} from "../middleware/upload.middleware.js";

const router = Router();

// ── Worker routes ─────────────────────────────────────────────────────────────
router.get("/status", protect, requireRole("WORKER"), getVerificationStatus);

router.post(
  "/submit-id",
  protect,
  requireRole("WORKER"),
  uploadSingle,
  normaliseFile,
  submitIdVerification,
);

router.post(
  "/submit-certification",
  protect,
  requireRole("WORKER"),
  uploadSingle,
  normaliseFile,
  submitCertification,
);

router.delete(
  "/certifications/:certId",
  protect,
  requireRole("WORKER"),
  deleteCertification,
);

// ── Admin routes ──────────────────────────────────────────────────────────────
router.get("/admin/stats", protect, requireRole("ADMIN"), getVerificationStats);

router.get(
  "/admin/pending",
  protect,
  requireRole("ADMIN"),
  getPendingVerifications,
);

router.get(
  "/admin/verified",
  protect,
  requireRole("ADMIN"),
  getVerifiedWorkers,
);

router.patch(
  "/admin/:userId/review",
  protect,
  requireRole("ADMIN"),
  reviewVerification,
);

router.patch(
  "/admin/:userId/background-check",
  protect,
  requireRole("ADMIN"),
  updateBackgroundCheck,
);

router.patch(
  "/admin/certifications/:certId/verify",
  protect,
  requireRole("ADMIN"),
  verifyCertification,
);

// ── Hirer verification routes ─────────────────────────────────────────────────
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
  submitHirerVerification,
);

// ── Admin: Hirer verification management ──────────────────────────────────────
router.get(
  "/admin/hirers/pending",
  protect,
  requireRole("ADMIN"),
  getPendingHirerVerifications,
);

router.patch(
  "/admin/hirers/:userId/review",
  protect,
  requireRole("ADMIN"),
  reviewHirerVerification,
);

export default router;
