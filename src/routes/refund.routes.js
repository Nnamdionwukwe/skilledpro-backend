// src/routes/refund.routes.js
import express from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";
import * as refundController from "../controllers/refund.controller.js";
import * as adminRefundController from "../controllers/admin/admin.refund.controller.js";

const router = express.Router();

// ── User Refund Routes ─────────────────────────────────────────────
router.post("/request", authenticate, refundController.requestRefund);
router.get("/my", authenticate, refundController.getMyRefunds);
router.get("/:id", authenticate, refundController.getRefundDetails);

// ── Admin Refund Routes ─────────────────────────────────────────────
router.get(
  "/admin/all",
  authenticate,
  authorize("ADMIN"),
  adminRefundController.getAllRefunds,
);
router.put(
  "/admin/:id/approve",
  authenticate,
  authorize("ADMIN"),
  adminRefundController.approveRefund,
);
router.put(
  "/admin/:id/reject",
  authenticate,
  authorize("ADMIN"),
  adminRefundController.rejectRefund,
);
router.put(
  "/admin/settings/auto-approve",
  authenticate,
  authorize("ADMIN"),
  adminRefundController.toggleAutoApproval,
);

export default router;
