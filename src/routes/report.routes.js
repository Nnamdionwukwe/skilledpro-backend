// src/routes/report.routes.js
import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  createReport,
  getMyReports,
  cancelReport,
  adminGetAllReports,
  adminGetReportStats,
  adminGetReportsByTarget,
  adminGetReportDetail,
  adminStartReview,
  adminResolveReport,
  adminDismissReport,
  adminBulkDismiss,
} from "../controllers/report.controller.js";
import {
  validateCreateReport,
  validateResolveReport,
  validateBulkDismiss,
  validateUUIDParam,
  validatePagination,
} from "../utils/validators.js";

const router = Router();
router.use(protect);

// ── User routes ────────────────────────────────────────────────────────────────
router.post("/", validateCreateReport, createReport);
router.get("/my", validatePagination, getMyReports);
router.delete("/:id", ...validateUUIDParam("id"), cancelReport);

// ── Admin routes ───────────────────────────────────────────────────────────────
router.get("/admin/stats", requireRole("ADMIN"), adminGetReportStats);
router.get(
  "/admin",
  requireRole("ADMIN"),
  validatePagination,
  adminGetAllReports,
);
router.get(
  "/admin/target/:targetType/:targetId",
  requireRole("ADMIN"),
  adminGetReportsByTarget,
);
router.patch(
  "/admin/bulk-dismiss",
  requireRole("ADMIN"),
  validateBulkDismiss,
  adminBulkDismiss,
);
router.get(
  "/admin/:id",
  requireRole("ADMIN"),
  ...validateUUIDParam("id"),
  adminGetReportDetail,
);
router.patch(
  "/admin/:id/review",
  requireRole("ADMIN"),
  ...validateUUIDParam("id"),
  adminStartReview,
);
router.patch(
  "/admin/:id/resolve",
  requireRole("ADMIN"),
  validateResolveReport,
  adminResolveReport,
);
router.patch(
  "/admin/:id/dismiss",
  requireRole("ADMIN"),
  ...validateUUIDParam("id"),
  adminDismissReport,
);

export default router;
