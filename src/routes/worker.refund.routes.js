// src/routes/worker.refund.routes.js
import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import * as ctrl from "../controllers/worker.refund.controller.js";

const router = Router();

// All routes require an authenticated user (worker or admin acting as worker)
router.use(protect);

// Specific paths BEFORE /:refundId (order matters in Express)
router.get("/", ctrl.getMyRefunds);
router.get("/summary", ctrl.getMyRefundSummary);

// Single refund
router.get("/:refundId", ctrl.getMyRefundDetail);
router.get("/:refundId/receipt", ctrl.getMyRefundReceipt);
router.get("/:refundId/receipt.html", ctrl.getMyRefundReceiptHtml);

export default router;
