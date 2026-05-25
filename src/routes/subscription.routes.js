import { Router } from "express";
import { json, raw } from "express"; // ← import raw directly
import { protect } from "../middleware/auth.middleware.js";
import {
  getPlans,
  getMySubscription,
  createCheckout,
  verifyCheckout,
  cancelSubscription,
  getInvoice,
  paystackWebhook,
} from "../controllers/subscription.controller.js";

const router = Router();

// ── Webhook — raw body BEFORE json parsing, no auth ──────────────────────────
router.post("/webhook", raw({ type: "application/json" }), paystackWebhook);

// ── Public ────────────────────────────────────────────────────────────────────
router.get("/plans", getPlans);

// ── Authenticated ─────────────────────────────────────────────────────────────
router.get("/my", protect, getMySubscription);
router.post("/checkout", protect, createCheckout);
router.post("/verify", protect, verifyCheckout);
router.post("/cancel", protect, cancelSubscription);
router.get("/invoice/:reference", protect, getInvoice); // ← :reference not :sessionId

export default router;
