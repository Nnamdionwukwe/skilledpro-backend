// src/routes/insurance.routes.js
import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  getInsurancePlans,
  getMyInsurance,
  createInsuranceCheckout,
  verifyInsuranceCheckout,
} from "../controllers/insurance.controller.js";
import {
  validatePurchaseInsurance,
  validateInsuranceVerify,
} from "../utils/validators.js";

const router = Router();
router.use(protect);

// GET  /api/insurance/plans           — browse available insurance plans
router.get("/plans", getInsurancePlans);

// GET  /api/insurance/my              — caller's active insurance policies
router.get("/my", getMyInsurance);

// POST /api/insurance/checkout        — purchase a plan
// Body: { planId, bookingId?, callbackUrl? }
router.post("/checkout", validatePurchaseInsurance, createInsuranceCheckout);

// POST /api/insurance/verify          — verify payment + activate policy
// Body: { reference }
router.post("/verify", validateInsuranceVerify, verifyInsuranceCheckout);

export default router;
