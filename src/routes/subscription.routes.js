import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  getPlans,
  getMySubscription,
  subscribe,
  cancelSubscription,
} from "../controllers/subscription.controller.js";

const router = Router();

router.get("/plans", getPlans);
router.get("/my", protect, getMySubscription);
router.post("/subscribe", protect, subscribe);
router.post("/cancel", protect, cancelSubscription);

export default router;
