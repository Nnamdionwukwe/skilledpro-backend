// src/routes/dispute.routes.js
import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/role.middleware.js";
import * as disputeController from "../controllers/refund.dispute.controller.js";

const router = express.Router();

// ── User Dispute Routes ─────────────────────────────────────────────
router.post("/raise", protect, disputeController.raiseDispute);
router.get("/my", protect, disputeController.getMyDisputes);
router.get("/:id", protect, disputeController.getDisputeDetails);

// ── Admin Dispute Routes ─────────────────────────────────────────────
router.get(
  "/admin/all",
  protect,
  requireAdmin,
  disputeController.adminGetAllDisputes,
);
router.put(
  "/admin/:id/resolve",
  protect,
  requireAdmin,
  disputeController.resolveDispute,
);

export default router;
