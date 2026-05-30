// src/routes/subscription.routes.js
import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
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
  validatePromoCode,
  createPromoCode,
  listPromoCodes,
  getPromoCodeDetail,
  updatePromoCode,
  togglePromoCode,
  deletePromoCode,
} from "../controllers/promoCode.controller.js";
import {
  validateSubscriptionCheckout,
  validateSubscriptionVerify,
  validateUUIDParam,
  validatePagination,
} from "../utils/validators.js";

const router = Router();

// ── Public webhook (no auth — Paystack sends these) ───────────────────────────
router.post("/webhook", paystackWebhook);

// ── Protected from here down ──────────────────────────────────────────────────
router.use(protect);

// ── Existing subscription routes (unchanged) ──────────────────────────────────
router.get("/plans", getPlans);
router.get("/my", getMySubscription);
router.post("/checkout", validateSubscriptionCheckout, createCheckout);
router.post("/verify", validateSubscriptionVerify, verifyCheckout);
router.post("/cancel", cancelSubscription);
router.get("/invoice/:reference", getInvoice);

// ─────────────────────────────────────────────────────────────────────────────
// PROMO CODE — user-facing
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/subscriptions/promo/validate/:code?planId=worker_pro
// Returns: { valid, discountType, discountValue, preview: { originalPrice, discount, finalPrice } }
router.get("/promo/validate/:code", validatePromoCode);

// ─────────────────────────────────────────────────────────────────────────────
// PROMO CODE — admin management (ADMIN role required)
// ─────────────────────────────────────────────────────────────────────────────
const ADMIN = [requireRole("ADMIN")];

// GET    /api/subscriptions/admin/promo-codes          — list all codes + stats
router.get("/admin/promo-codes", ...ADMIN, validatePagination, listPromoCodes);

// POST   /api/subscriptions/admin/promo-codes          — create a new code
// Body: { code, discountType, discountValue, maxUses?, expiresAt?,
//         applicableTo?: ["worker_pro","hirer_pro"], minPlanAmount?, description? }
router.post("/admin/promo-codes", ...ADMIN, createPromoCode);

// GET    /api/subscriptions/admin/promo-codes/:id      — detail + who used it
router.get(
  "/admin/promo-codes/:id",
  ...ADMIN,
  ...validateUUIDParam("id"),
  getPromoCodeDetail,
);

// PATCH  /api/subscriptions/admin/promo-codes/:id      — update (desc, maxUses, expiry, etc.)
// Note: code, discountType and discountValue are immutable — create a new code instead
router.patch(
  "/admin/promo-codes/:id",
  ...ADMIN,
  ...validateUUIDParam("id"),
  updatePromoCode,
);

// PATCH  /api/subscriptions/admin/promo-codes/:id/toggle — flip active/inactive
router.patch(
  "/admin/promo-codes/:id/toggle",
  ...ADMIN,
  ...validateUUIDParam("id"),
  togglePromoCode,
);

// DELETE /api/subscriptions/admin/promo-codes/:id
// If the code was used → deactivates instead of deletes (audit trail)
router.delete(
  "/admin/promo-codes/:id",
  ...ADMIN,
  ...validateUUIDParam("id"),
  deletePromoCode,
);

export default router;
