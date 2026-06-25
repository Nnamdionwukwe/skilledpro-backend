// src/routes/dispute.routes.js
import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  raiseDispute, // was: createDispute     ← FIXED
  getMyDisputes,
  getDisputeDetail, // was: getDispute        ← FIXED
  cancelDispute,
  getAllDisputes,
  resolveDispute,
} from "../controllers/dispute.controller.js";
import {
  validateCreateDispute,
  validateResolveDispute,
  validateUUIDParam,
  validatePagination,
} from "../utils/validators.js";
import { uploadMultiple } from "../middleware/upload.middleware.js";

const router = Router();
router.use(protect);

router.post("/", uploadMultiple, validateCreateDispute, raiseDispute);
router.get("/my", validatePagination, getMyDisputes);
router.get("/:bookingId", ...validateUUIDParam("bookingId"), getDisputeDetail);
router.patch(
  "/:bookingId/cancel",
  ...validateUUIDParam("bookingId"),
  cancelDispute,
);
router.get("/", requireRole("ADMIN"), validatePagination, getAllDisputes);
router.patch(
  "/:bookingId/resolve",
  requireRole("ADMIN"),
  validateResolveDispute,
  resolveDispute,
);

export default router;
