import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  getPlans,
  getMySubscription,
  createCheckout,
  verifyCheckout,
  cancelSubscription,
  getInvoice,
} from "../controllers/subscription.controller.js";

const router = Router();

router.get("/plans", getPlans);
router.get("/my", protect, getMySubscription);
router.post("/checkout", protect, createCheckout);
router.post("/verify", protect, verifyCheckout);
router.post("/cancel", protect, cancelSubscription);
router.get("/invoice/:sessionId", protect, getInvoice);

export default router;
