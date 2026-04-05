import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  getInsurancePlans,
  purchaseInsurance,
  getMyInsurance,
} from "../controllers/insurance.controller.js";

const router = Router();

router.get("/plans", getInsurancePlans);
router.post("/purchase", protect, requireRole("HIRER"), purchaseInsurance);
router.get("/my", protect, requireRole("HIRER"), getMyInsurance);

export default router;
