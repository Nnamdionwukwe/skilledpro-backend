// src/routes/audit.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// Mount in app.js:  app.use("/api/audit", auditRoutes);
// All routes require ADMIN role.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  getAuditLogs,
  getAuditStats,
  getMyAuditTrail,
  getAuditAdmins,
  getAuditByTarget,
  getAuditLogDetail,
  exportAuditLogs,
  purgeAuditLogs,
} from "../controllers/audit.controller.js";

const router = Router();

// ─── All audit routes require authentication + ADMIN role ────────────────────
router.use(protect, requireRole("ADMIN"));

// ─── Dashboard & aggregate views ─────────────────────────────────────────────

// Stats overview — totals, daily chart, top admins, severity breakdown
// GET /api/audit/stats?days=30
router.get("/stats", getAuditStats);

// Current admin's own action trail
// GET /api/audit/me?page=&limit=&action=
router.get("/me", getMyAuditTrail);

// All admins who have audit entries (with their totals + last action)
// GET /api/audit/admins
router.get("/admins", getAuditAdmins);

// CSV export (max 5000 rows)
// GET /api/audit/export?adminId=&action=&from=&to=&limit=
router.get("/export", exportAuditLogs);

// ─── Target-scoped view ───────────────────────────────────────────────────────

// All audit entries that touched a specific record
// GET /api/audit/target/:targetType/:targetId
// e.g. GET /api/audit/target/USER/abc-123
//      GET /api/audit/target/PAYMENT/xyz-456
router.get("/target/:targetType/:targetId", getAuditByTarget);

// ─── Collection — all logs with full filtering ────────────────────────────────

// Full paginated log — every admin action
// GET /api/audit
// Query params:
//   adminId    — filter by specific admin
//   action     — e.g. USER_BANNED
//   targetType — e.g. USER, PAYMENT
//   targetId   — specific record ID
//   result     — SUCCESS | FAILED | PARTIAL
//   severity   — critical | warning | success | info
//   from       — ISO date string
//   to         — ISO date string
//   search     — searches description, admin name, admin email
//   page       — default 1
//   limit      — default 25, max 100
router.get("/", getAuditLogs);

// ─── Single entry ─────────────────────────────────────────────────────────────

// Single audit log detail (includes before/after diff + current target state)
// GET /api/audit/:id
router.get("/:id", getAuditLogDetail);

// ─── Maintenance ──────────────────────────────────────────────────────────────

// Purge old SUCCESS entries (keeps FAILED entries indefinitely)
// DELETE /api/audit/purge
// Body: { olderThanDays: 90 }  — minimum 30 days
router.delete("/purge", purgeAuditLogs);

export default router;
