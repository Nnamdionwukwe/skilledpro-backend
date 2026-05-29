// src/routes/report.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// Mount in app.js:  app.use("/api/reports", reportRoutes);
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  // User-facing
  createReport,
  getMyReports,
  cancelReport,
  // Admin-facing
  adminGetAllReports,
  adminGetReportStats,
  adminGetReportsByTarget,
  adminGetReportDetail,
  adminStartReview,
  adminResolveReport,
  adminDismissReport,
  adminBulkDismiss,
} from "../controllers/report.controller.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// ALL routes require authentication
// ─────────────────────────────────────────────────────────────────────────────
router.use(protect);

// ─────────────────────────────────────────────────────────────────────────────
// USER ROUTES (any authenticated user)
// ─────────────────────────────────────────────────────────────────────────────

// Submit a report
// POST /api/reports
// Body: { targetType, targetId, reason, description?, evidence?: string[] }
router.post("/", createReport);

// View my submitted reports
// GET /api/reports/my?page=&limit=&status=
router.get("/my", getMyReports);

// Cancel a pending report I submitted
// DELETE /api/reports/:id
router.delete("/:id", cancelReport);

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ROUTES (ADMIN role only)
// ─────────────────────────────────────────────────────────────────────────────

// Stats dashboard overview
// GET /api/reports/admin/stats
router.get("/admin/stats", requireRole("ADMIN"), adminGetReportStats);

// All reports in the queue — with filters
// GET /api/reports/admin?status=&type=&reason=&page=&limit=&search=&from=&to=
router.get("/admin", requireRole("ADMIN"), adminGetAllReports);

// All reports about a specific target (user, post, job etc.)
// GET /api/reports/admin/target/:targetType/:targetId
router.get(
  "/admin/target/:targetType/:targetId",
  requireRole("ADMIN"),
  adminGetReportsByTarget,
);

// Bulk dismiss false reports
// PATCH /api/reports/admin/bulk-dismiss
// Body: { reportIds: string[], adminNote? }
router.patch("/admin/bulk-dismiss", requireRole("ADMIN"), adminBulkDismiss);

// Single report detail (with target data + context)
// GET /api/reports/admin/:id
router.get("/admin/:id", requireRole("ADMIN"), adminGetReportDetail);

// Move PENDING → REVIEWING (claim the report for review)
// PATCH /api/reports/admin/:id/review
router.patch("/admin/:id/review", requireRole("ADMIN"), adminStartReview);

// Resolve with action (WARNING / CONTENT_REMOVED / SUSPEND / BAN / NO_ACTION)
// PATCH /api/reports/admin/:id/resolve
// Body: { action, adminNote? }
router.patch("/admin/:id/resolve", requireRole("ADMIN"), adminResolveReport);

// Dismiss a false / invalid report
// PATCH /api/reports/admin/:id/dismiss
// Body: { adminNote? }
router.patch("/admin/:id/dismiss", requireRole("ADMIN"), adminDismissReport);

export default router;
