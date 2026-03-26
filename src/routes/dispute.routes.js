import { Router } from "express";
import {
  raiseDispute,
  getMyDisputes,
  getDisputeDetail,
  resolveDispute,
  cancelDispute,
  getAllDisputes,
} from "../controllers/dispute.controller.js";
import { protect, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

// Authenticated users
router.post("/", protect, raiseDispute);
router.get("/my", protect, getMyDisputes);
router.get("/:bookingId", protect, getDisputeDetail);
router.patch("/:bookingId/cancel", protect, cancelDispute);

// Admin only
router.get("/", protect, requireRole("ADMIN"), getAllDisputes);
router.patch(
  "/:bookingId/resolve",
  protect,
  requireRole("ADMIN"),
  resolveDispute,
);

export default router;
