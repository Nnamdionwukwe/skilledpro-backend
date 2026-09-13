// src/routes/refund.routes.js
import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/role.middleware.js";

import {
  requestRefund,
  getMyRefunds,
  getRefundDetails,
} from "../controllers/refund.controller.js";

import {
  getAllRefunds,
  getRefundDetails as adminGetRefundDetails,
  approveRefund,
  rejectRefund,
  reverseRefund,
  bulkApproveRefunds,
  bulkRejectRefunds,
  getRefundStats,
  toggleAutoApproval,
  getAutoApprovalStatus,
} from "../controllers/admin.refund.controller.js";

const router = express.Router();

// ── User Refund Routes ─────────────────────────────────────────────
router.post("/request", protect, requestRefund);
router.get("/my", protect, getMyRefunds);

// ── Admin Refund Routes ─────────────────────────────────────────────
// NOTE: these MUST come before the "/:id" catch-all below, otherwise
// "/admin/..." would be swallowed by the user-route "/:id".
router.get("/admin/all", protect, requireAdmin, getAllRefunds);
router.get("/admin/stats/summary", protect, requireAdmin, getRefundStats);
router.put("/admin/bulk-approve", protect, requireAdmin, bulkApproveRefunds);
router.post("/admin/bulk-approve", protect, requireAdmin, bulkApproveRefunds);
router.put("/admin/bulk-reject", protect, requireAdmin, bulkRejectRefunds);
router.post("/admin/bulk-reject", protect, requireAdmin, bulkRejectRefunds);
router.put(
  "/admin/settings/auto-approve",
  protect,
  requireAdmin,
  toggleAutoApproval,
);
router.get(
  "/admin/settings/auto-approve",
  protect,
  requireAdmin,
  getAutoApprovalStatus,
);
router.put("/admin/:id/approve", protect, requireAdmin, approveRefund);
router.put("/admin/:id/reject", protect, requireAdmin, rejectRefund);
router.put("/admin/:id/reverse", protect, requireAdmin, reverseRefund);
router.get("/admin/:id", protect, requireAdmin, adminGetRefundDetails);

// ── User catch-all ─────────────────────────────────────────────────
// Keep this LAST so it doesn't shadow /admin/* routes
router.get("/:id", protect, getRefundDetails);

export default router;
