// src/routes/subscription.routes.js
import { Router } from "express";
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
import {
  validateSubscriptionCheckout,
  validateSubscriptionVerify,
  validateUUIDParam,
} from "../utils/validators.js";

const router = Router();

// ── Public webhook (no auth — Paystack sends these) ───────────────────────────
router.post("/webhook", paystackWebhook);

// ── Protected from here down ──────────────────────────────────────────────────
router.use(protect);

// GET  /api/subscriptions/plans    — available plans (WORKER or HIRER)
router.get("/plans", getPlans);

// GET  /api/subscriptions/my       — active subscription for logged-in user
router.get("/my", getMySubscription);

// POST /api/subscriptions/checkout — initiate Paystack subscription checkout
// Body: { tier, billingPeriod?, callbackUrl? }
router.post("/checkout", validateSubscriptionCheckout, createCheckout);

// POST /api/subscriptions/verify   — verify after Paystack redirect
// Body: { reference }
router.post("/verify", validateSubscriptionVerify, verifyCheckout);

// POST /api/subscriptions/cancel   — cancel active subscription
router.post("/cancel", cancelSubscription);

// GET  /api/subscriptions/invoice/:reference — download invoice
router.get("/invoice/:reference", getInvoice);

export default router;
