// src/routes/retainedStaff.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// Retained Staff routes — mounted at /api/retained-staff
// Roles are gated per route so a single router serves both hirer and worker.
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  // Hirer — staff
  listStaff,
  addStaff,
  getStaff,
  updateStaff,
  pauseStaff,
  resumeStaff,
  endStaff,
  deleteStaff,
  listRevisions,
  getStaffSummary,

  // Hirer — documents
  uploadStaffDocument,
  listStaffDocuments,
  updateStaffDocument,
  deleteStaffDocument,

  // Hirer — notes
  addStaffNote,
  listStaffNotes,
  deleteStaffNote,

  // Hirer — cycles
  listCycles,
  createCycle,
  getCycle,
  payCycleHandler,
  releaseCycle,
  cancelCycleHandler,
  listAllCycles,
  getHirerDashboard,

  // Worker — employment view
  listMyEmployers,
  getMyEmployment,
  listMyCycles,
  getMyRetainedEarnings,
} from "../controllers/retainedStaff.controller.js";
import {
  validateAddRetainedStaff,
  validateUpdateRetainedStaff,
  validateEndRetainedStaff,
  validateCreateRetainedCycle,
  validatePayRetainedCycle,
  validateReleaseRetainedCycle,
  validateUploadRetainedDocument,
  validateUpdateRetainedDocument,
  validateAddRetainedNote,
  validateUUIDParam,
} from "../utils/validators.js"; // ← append the block from §4.3 below

const router = express.Router();

// All routes require authentication
router.use(protect);

// ─────────────────────────────────────────────────────────────────────────────
// ═══ WORKER ROUTES — /me/... ════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────
router.get("/me/employers", requireRole("WORKER"), listMyEmployers);
router.get(
  "/me/employers/:memberId",
  requireRole("WORKER"),
  validateUUIDParam("memberId"),
  getMyEmployment,
);
router.get("/me/cycles", requireRole("WORKER"), listMyCycles);
router.get("/me/earnings", requireRole("WORKER"), getMyRetainedEarnings);

// ─────────────────────────────────────────────────────────────────────────────
// ═══ HIRER DASHBOARD ════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────
router.get("/dashboard", requireRole("HIRER"), getHirerDashboard);

// ─────────────────────────────────────────────────────────────────────────────
// ═══ HIRER — CROSS-STAFF CYCLE LEDGER ═══════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────
router.get("/cycles", requireRole("HIRER"), listAllCycles);
router.post(
  "/cycles/:cycleId/release",
  requireRole("HIRER"),
  validateUUIDParam("cycleId"),
  validateReleaseRetainedCycle,
  releaseCycle,
);
router.post(
  "/cycles/:cycleId/cancel",
  requireRole("HIRER"),
  validateUUIDParam("cycleId"),
  cancelCycleHandler,
);

// ─────────────────────────────────────────────────────────────────────────────
// ═══ HIRER — STAFF CRUD ═════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", requireRole("HIRER"), listStaff);
router.post("/", requireRole("HIRER"), validateAddRetainedStaff, addStaff);

router.get(
  "/:memberId",
  requireRole("HIRER"),
  validateUUIDParam("memberId"),
  getStaff,
);
router.patch(
  "/:memberId",
  requireRole("HIRER"),
  validateUUIDParam("memberId"),
  validateUpdateRetainedStaff,
  updateStaff,
);
router.patch(
  "/:memberId/pause",
  requireRole("HIRER"),
  validateUUIDParam("memberId"),
  pauseStaff,
);
router.patch(
  "/:memberId/resume",
  requireRole("HIRER"),
  validateUUIDParam("memberId"),
  resumeStaff,
);
router.patch(
  "/:memberId/end",
  requireRole("HIRER"),
  validateUUIDParam("memberId"),
  validateEndRetainedStaff,
  endStaff,
);
router.delete(
  "/:memberId",
  requireRole("HIRER"),
  validateUUIDParam("memberId"),
  deleteStaff,
);

router.get(
  "/:memberId/revisions",
  requireRole("HIRER"),
  validateUUIDParam("memberId"),
  listRevisions,
);
router.get(
  "/:memberId/summary",
  requireRole("HIRER"),
  validateUUIDParam("memberId"),
  getStaffSummary,
);

// ─────────────────────────────────────────────────────────────────────────────
// ═══ HIRER — DOCUMENTS ══════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/:memberId/documents",
  requireRole("HIRER"),
  validateUUIDParam("memberId"),
  validateUploadRetainedDocument,
  uploadStaffDocument,
);
router.get(
  "/:memberId/documents",
  requireRole("HIRER"),
  validateUUIDParam("memberId"),
  listStaffDocuments,
);
router.patch(
  "/:memberId/documents/:docId",
  requireRole("HIRER"),
  validateUUIDParam("memberId"),
  validateUUIDParam("docId"),
  validateUpdateRetainedDocument,
  updateStaffDocument,
);
router.delete(
  "/:memberId/documents/:docId",
  requireRole("HIRER"),
  validateUUIDParam("memberId"),
  validateUUIDParam("docId"),
  deleteStaffDocument,
);

// ─────────────────────────────────────────────────────────────────────────────
// ═══ HIRER — NOTES ══════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/:memberId/notes",
  requireRole("HIRER"),
  validateUUIDParam("memberId"),
  validateAddRetainedNote,
  addStaffNote,
);
router.get(
  "/:memberId/notes",
  requireRole("HIRER"),
  validateUUIDParam("memberId"),
  listStaffNotes,
);
router.delete(
  "/:memberId/notes/:noteId",
  requireRole("HIRER"),
  validateUUIDParam("memberId"),
  validateUUIDParam("noteId"),
  deleteStaffNote,
);

// ─────────────────────────────────────────────────────────────────────────────
// ═══ HIRER — PAYROLL CYCLES ═════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/:memberId/cycles",
  requireRole("HIRER"),
  validateUUIDParam("memberId"),
  listCycles,
);
router.post(
  "/:memberId/cycles",
  requireRole("HIRER"),
  validateUUIDParam("memberId"),
  validateCreateRetainedCycle,
  createCycle,
);
router.get(
  "/:memberId/cycles/:cycleId",
  requireRole("HIRER"),
  validateUUIDParam("memberId"),
  validateUUIDParam("cycleId"),
  getCycle,
);
router.post(
  "/:memberId/cycles/:cycleId/pay",
  requireRole("HIRER"),
  validateUUIDParam("memberId"),
  validateUUIDParam("cycleId"),
  validatePayRetainedCycle,
  payCycleHandler,
);

export default router;
