import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  getInsurancePlans,
  createInsuranceCheckout,
  verifyInsuranceCheckout,
  getMyInsurance,
} from "../controllers/insurance.controller.js";

const router = Router();

router.get("/plans", getInsurancePlans);
router.post(
  "/checkout",
  protect,
  requireRole("HIRER"),
  createInsuranceCheckout,
);
router.post("/verify", protect, requireRole("HIRER"), verifyInsuranceCheckout);
router.get("/my", protect, requireRole("HIRER"), getMyInsurance);

export default router;
