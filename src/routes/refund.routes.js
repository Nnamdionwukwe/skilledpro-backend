// src/routes/refund.routes.js
import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/role.middleware.js";
import * as refundController from "../controllers/refund.controller.js";
import * as adminRefundController from "../controllers/admin.refund.controller.js";

const router = express.Router();

// ── User Refund Routes ─────────────────────────────────────────────
router.post("/request", protect, refundController.requestRefund);
router.get("/my", protect, refundController.getMyRefunds);
router.get("/:id", protect, refundController.getRefundDetails);

// ── Admin Refund Routes ─────────────────────────────────────────────
router.get(
  "/admin/all",
  protect,
  requireAdmin,
  adminRefundController.getAllRefunds,
);
router.put(
  "/admin/:id/approve",
  protect,
  requireAdmin,
  adminRefundController.approveRefund,
);
router.put(
  "/admin/:id/reject",
  protect,
  requireAdmin,
  adminRefundController.rejectRefund,
);
router.put(
  "/admin/:id/reverse",
  protect,
  requireAdmin,
  adminRefundController.reverseRefund,
);
router.post(
  "/admin/bulk-approve",
  protect,
  requireAdmin,
  adminRefundController.bulkApproveRefunds,
);
router.post(
  "/admin/bulk-reject",
  protect,
  requireAdmin,
  adminRefundController.bulkRejectRefunds,
);
router.get(
  "/admin/stats/summary",
  protect,
  requireAdmin,
  adminRefundController.getRefundStats,
);
router.put(
  "/admin/settings/auto-approve",
  protect,
  requireAdmin,
  adminRefundController.toggleAutoApproval,
);
router.get(
  "/admin/settings/auto-approve",
  protect,
  requireAdmin,
  adminRefundController.getAutoApprovalStatus,
);

export default router;
