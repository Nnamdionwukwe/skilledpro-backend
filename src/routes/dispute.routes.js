import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/role.middleware.js";
import * as disputeController from "../controllers/dispute.controller.js";
import {
  validateCreateDispute,
  validateResolveDispute,
  validateUUIDParam,
  validatePagination,
} from "../utils/validators.js";

const router = Router();

// ── User Dispute Routes ─────────────────────────────────────────────
router.post(
  "/raise",
  protect,
  ...validateCreateDispute,
  disputeController.raiseDispute,
);
router.get("/my", protect, validatePagination, disputeController.getMyDisputes);
router.get(
  "/:id",
  protect,
  ...validateUUIDParam("id"),
  disputeController.getDisputeDetail,
);

// ── Admin Dispute Routes ─────────────────────────────────────────────
router.get(
  "/admin/all",
  protect,
  requireAdmin,
  validatePagination,
  disputeController.getAllDisputes,
);
router.put(
  "/admin/:id/resolve",
  protect,
  requireAdmin,
  ...validateResolveDispute,
  disputeController.resolveDispute,
);

export default router;
