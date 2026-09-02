// src/routes/dispute.routes.js
import express from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";
import * as disputeController from "../controllers/refund.dispute.controller.js";

const router = express.Router();

// ── User Dispute Routes ─────────────────────────────────────────────
router.post("/raise", authenticate, disputeController.raiseDispute);
router.get("/my", authenticate, disputeController.getMyDisputes);
router.get("/:id", authenticate, disputeController.getDisputeDetails);

// ── Admin Dispute Routes ─────────────────────────────────────────────
router.get(
  "/admin/all",
  authenticate,
  authorize("ADMIN"),
  disputeController.adminGetAllDisputes,
);
router.put(
  "/admin/:id/resolve",
  authenticate,
  authorize("ADMIN"),
  disputeController.resolveDispute,
);

export default router;
