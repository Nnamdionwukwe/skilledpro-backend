// src/routes/dispute.routes.js
import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/role.middleware.js";
import * as disputeController from "../controllers/dispute.controller.js";
import {
  validateCreateDispute,
  validateResolveDispute,
  validateCancelDispute,
  validateUUIDParam,
  validatePagination,
} from "../utils/validators.js";
import { uploadMultiple } from "../middleware/upload.middleware.js";

const router = Router();

// ── User Dispute Routes ─────────────────────────────────────────────
router.post(
  "/raise",
  protect,
  uploadMultiple, // ← pre-built middleware — pass by reference
  ...validateCreateDispute,
  disputeController.raiseDispute,
);

router.get("/my", protect, validatePagination, disputeController.getMyDisputes);

// Cancel a dispute the caller raised (by bookingId for legacy compat)
router.patch(
  "/:bookingId/cancel",
  protect,
  ...validateCancelDispute,
  disputeController.cancelDispute,
);

// Get dispute detail for a booking
router.get(
  "/:bookingId",
  protect,
  ...validateUUIDParam("bookingId"),
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

router.patch(
  "/admin/:id/resolve",
  protect,
  requireAdmin,
  ...validateResolveDispute,
  disputeController.resolveDispute,
);

export default router;
