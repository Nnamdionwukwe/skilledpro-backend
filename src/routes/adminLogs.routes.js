// src/routes/adminLogs.routes.js
import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  getAuditLogs,
  getAuditLogById,
  getAuditLogStats,
  getAuditLogsByAdmin,
  getAuditLogsByTarget,
  exportAuditLogs,
} from "../controllers/adminLog.controller.js";
import { validatePagination, validateUUIDParam } from "../utils/validators.js";

const router = Router();

// All admin-log routes require an authenticated admin
router.use(protect, requireRole("ADMIN"));

// ── Stats ──────────────────────────────────────────────────────────────────
// NOTE: static paths BEFORE parameterized ones
router.get("/logs/stats/summary", getAuditLogStats);

// ── Export (must be before /logs/:id) ─────────────────────────────────────
router.get("/logs/export", exportAuditLogs);

// ── List with filters ─────────────────────────────────────────────────────
router.get("/logs", validatePagination, getAuditLogs);

// ── By admin ───────────────────────────────────────────────────────────────
router.get(
  "/logs/admin/:adminId",
  ...validateUUIDParam("adminId"),
  validatePagination,
  getAuditLogsByAdmin,
);

// ── By target ──────────────────────────────────────────────────────────────
router.get(
  "/logs/target/:targetType/:targetId",
  validatePagination,
  getAuditLogsByTarget,
);

// ── Single log (must be last — matches /logs/:id) ─────────────────────────
router.get("/logs/:id", ...validateUUIDParam("id"), getAuditLogById);

export default router;
