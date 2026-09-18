// ── ONLY THESE FUNCTIONS CHANGE — paste them over the matching functions
// in your subscription.controller.js
// Everything else (getPlans, getMySubscription, cancelSubscription, getInvoice)
// stays exactly as is.
//
// Required env vars to add to Railway:
//   PAYSTACK_SECRET_KEY=sk_live_xxxx
//   PAYSTACK_WORKER_PRO_PLAN_CODE=PLN_xxxx     (create in Paystack dashboard)
//   PAYSTACK_WORKER_ENT_PLAN_CODE=PLN_xxxx
//   PAYSTACK_HIRER_PRO_PLAN_CODE=PLN_xxxx
//   PAYSTACK_HIRER_ENT_PLAN_CODE=PLN_xxxx
//
// How to create Paystack plans:
//   Dashboard → Subscriptions → Plans → Create Plan
//   Set amount in kobo (₦2500 = 250000 kobo), interval = monthly
//   Copy the plan code (PLN_xxx) into your env vars

// ── ENV VARS to add (new yearly ones) ────────────────────────────────────────
// Create yearly plans in Paystack Dashboard → Subscriptions → Plans
// Set interval = "annually" and amount in kobo
//
// PAYSTACK_WORKER_PRO_YEARLY_PLAN_CODE=PLN_xxxx     (₦25,000 = 2500000 kobo, annually)
// PAYSTACK_WORKER_ENT_YEARLY_PLAN_CODE=PLN_xxxx     (₦80,000 = 8000000 kobo, annually)
// PAYSTACK_HIRER_PRO_YEARLY_PLAN_CODE=PLN_xxxx      (₦35,000 = 3500000 kobo, annually)
// PAYSTACK_HIRER_ENT_YEARLY_PLAN_CODE=PLN_xxxx      (₦200,000 = 20000000 kobo, annually)

import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import Stripe from "stripe";
import {
  paginate,
  paginationMeta,
  fullName,
  formatCurrency,
  truncate,
  slugify,
  uniqueRef,
  parseJSON,
  extractIP,
  timeAgo,
  safeUser,
} from "../utils/helpers.js";

import {
  applyPromoToCheckout,
  recordPromoUsage,
} from "./promoCode.controller.js";

import { WORKER_PLANS, HIRER_PLANS, getPlanCode } from "../config/plans.js";

// ── Paystack helper ───────────────────────────────────────────────────────────
async function paystackRequest(path, method = "GET", body = null) {
  const res = await fetch(`https://api.paystack.co${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!data.status) {
    throw new Error(data.message || "Paystack request failed");
  }
  return data.data;
}

export {
  WORKER_PLANS,
  HIRER_PLANS,
  FEATURED_PACKAGES,
  getPlanCode,
} from "../config/plans.js";

// GET /api/subscriptions/plans
export const getPlans = async (req, res) => {
  const role = req.query.role?.toUpperCase();
  if (role === "WORKER")
    return sendResponse(res, { data: { plans: WORKER_PLANS } });
  if (role === "HIRER")
    return sendResponse(res, { data: { plans: HIRER_PLANS } });
  return sendResponse(res, {
    data: { workerPlans: WORKER_PLANS, hirerPlans: HIRER_PLANS },
  });
};

// GET /api/subscriptions/my
export const getMySubscription = async (req, res) => {
  try {
    const subs = await prisma.subscription.findMany({
      where: { userId: req.user.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });

    // Defensive: if multiple ACTIVE rows exist (from earlier bugs),
    // keep only the newest active and cancel the rest locally.
    const sub = subs[0] || null;
    if (subs.length > 1) {
      await prisma.subscription.updateMany({
        where: {
          id: { in: subs.slice(1).map((s) => s.id) },
          status: "ACTIVE",
        },
        data: { status: "CANCELLED" },
      });
    }

    const plans = req.user.role === "WORKER" ? WORKER_PLANS : HIRER_PLANS;

    // Resolve the exact plan the user is on by matching Paystack plan code.
    // Falls back to tier match for legacy rows that have no paystackPlanCode.
    const currentPlan =
      (sub?.paystackPlanCode &&
        plans.find((p) => getPlanCode(p.id) === sub.paystackPlanCode)) ||
      plans.find((p) => p.tier === (sub?.tier || "FREE")) ||
      plans[0];

    return sendResponse(res, {
      data: {
        subscription: sub || { tier: "FREE", status: "ACTIVE", price: 0 },
        plan: currentPlan,
        planId: currentPlan?.id || null, // ← drives the UI "Current Plan" badge
        isActive: !sub || sub.status === "ACTIVE",
        expiresAt: sub?.expiresAt || null,
      },
    });
  } catch (err) {
    console.error("getMySubscription error:", err.message);
    return sendError(res, "Failed to fetch subscription");
  }
};

// ── POST /api/subscriptions/checkout ─────────────────────────────────────────
// Returns a Paystack authorization URL — open in WebBrowser on mobile
export const createCheckout = async (req, res) => {
  try {
    const { planId, promoCode } = req.body;
    if (!planId) return sendError(res, "Plan ID required", 400);

    const role = req.user.role;
    const plans = role === "WORKER" ? WORKER_PLANS : HIRER_PLANS;
    const plan = plans.find((p) => p.id === planId);

    if (!plan) return sendError(res, "Invalid plan", 404);
    if (plan.price === 0)
      return sendError(res, "Free plan requires no payment", 400);

    const planCode = getPlanCode(planId);
    if (!planCode) {
      return sendError(
        res,
        `Paystack plan code not configured for ${planId}. Add PAYSTACK_${planId.toUpperCase()}_PLAN_CODE to env.`,
        500,
      );
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    // ── Apply promo code (optional) ───────────────────────────────────────────
    let finalPrice = plan.price;
    let promoDiscount = 0;
    let promoCodeId = null;

    if (promoCode?.trim()) {
      try {
        const result = await applyPromoToCheckout(
          promoCode,
          planId,
          req.user.id,
          plan.price,
        );
        finalPrice = result.finalPrice;
        promoDiscount = result.discount;
        promoCodeId = result.record.id;
      } catch (err) {
        return sendError(res, err.message, 400);
      }
    }

    // ── Initialize Paystack transaction ───────────────────────────────────────
    const txData = await paystackRequest("/transaction/initialize", "POST", {
      email: user.email,
      amount: finalPrice * 100, // kobo — uses discounted price
      plan: planCode,
      currency: "NGN",
      metadata: {
        userId: req.user.id,
        planId,
        tier: plan.tier,
        role,
        promoCodeId, // ← NEW: stored for verifyCheckout
        promoDiscount, // ← NEW: for audit/invoice
        originalPrice: plan.price, // ← NEW: for audit/invoice
        cancel_action: `${process.env.CLIENT_URL}/dashboard/${role.toLowerCase()}/subscription`,
      },
      callback_url: `${process.env.CLIENT_URL}/subscription/verify`,
    });

    return sendResponse(res, {
      data: {
        url: txData.authorization_url,
        reference: txData.reference,
        accessCode: txData.access_code,
        // ← Tell the frontend what was applied so it can show a summary
        pricing: {
          originalPrice: plan.price,
          discount: promoDiscount,
          finalPrice,
          currency: "NGN",
          promoApplied: promoCodeId !== null,
        },
      },
    });
  } catch (err) {
    console.error("Paystack checkout error:", err.message);
    return sendError(res, err.message || "Failed to create checkout session");
  }
};

// ── POST /api/subscriptions/verify ───────────────────────────────────────────
// Called after Paystack redirect with ?reference=xxx
export const verifyCheckout = async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) return sendError(res, "Reference required", 400);

    const tx = await paystackRequest(`/transaction/verify/${reference}`);
    if (tx.status !== "success")
      return sendError(res, "Payment not successful", 400);

    // Paystack sometimes returns metadata as a JSON string; parse defensively.
    let meta = tx.metadata;
    if (typeof meta === "string") {
      try {
        meta = JSON.parse(meta);
      } catch {
        meta = {};
      }
    }
    const {
      userId,
      planId,
      tier,
      role,
      promoCodeId = null,
      promoDiscount = 0,
      originalPrice,
    } = meta || {};

    if (!userId || !planId || !tier || !role) {
      console.error("verifyCheckout: incomplete metadata", {
        reference,
        meta,
      });
      return sendError(
        res,
        "Transaction metadata incomplete. Please start a fresh checkout.",
        400,
      );
    }

    // Confirm the user still exists
    const userExists = await prisma.user.findUnique({ where: { id: userId } });
    if (!userExists) {
      return sendError(res, "User no longer exists for this transaction", 400);
    }

    // ── Look up Paystack subscription record (best-effort) ────────────────────
    let paystackSub = null;
    const customerCode = tx.customer?.customer_code || null;
    try {
      const planCode = getPlanCode(planId);
      const subs = await paystackRequest(
        `/subscription?customer=${customerCode}&plan=${planCode}`,
      );
      paystackSub = Array.isArray(subs)
        ? subs.find((s) => s.status === "active") || subs[0]
        : null;
    } catch (err) {
      // Non-fatal: we can create the local row without this metadata.
      // Rate-limited here just means the extra metadata is missing — the
      // subscription itself is still created below.
      console.warn("Paystack sub lookup skipped:", err.message);
    }

    // ── Determine the plan + expiry ───────────────────────────────────────────
    const plans = role === "WORKER" ? WORKER_PLANS : HIRER_PLANS;
    const plan = plans.find((p) => p.id === planId);
    if (!plan) {
      return sendError(res, "Plan not found for this transaction", 400);
    }

    const isYearly = planId.endsWith("_yearly");
    const expiresAt = new Date();
    if (isYearly) expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    else expiresAt.setMonth(expiresAt.getMonth() + 1);

    // ── Cancel any existing ACTIVE subscriptions ──────────────────────────────
    // If the user is switching plans, the OLD subscription must be disabled on
    // Paystack too — otherwise they get double-billed. If that disable fails
    // (e.g. rate limit), surface a 429 and don't create the new row.
    const existingSub = await prisma.subscription.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });

    if (
      existingSub?.paystackSubscriptionCode &&
      existingSub?.paystackEmailToken
    ) {
      try {
        await paystackRequest("/subscription/disable", "POST", {
          code: existingSub.paystackSubscriptionCode,
          token: existingSub.paystackEmailToken,
        });
        console.log(
          `✅ Disabled old Paystack sub ${existingSub.paystackSubscriptionCode}`,
        );
      } catch (err) {
        console.error(
          "Failed to disable old Paystack sub:",
          err.code || "",
          err.message,
        );
        if (err.code === "RATE_LIMIT") {
          return sendError(
            res,
            "Paystack is busy. Please wait a few seconds and try again.",
            429,
          );
        }
        // Non-rate-limit failures: log and continue. The local cleanup
        // below still flips the old row to CANCELLED so the UI is correct.
      }
    }

    // Mark all previous ACTIVE rows as CANCELLED before inserting the new one.
    await prisma.subscription.updateMany({
      where: { userId, status: "ACTIVE" },
      data: { status: "CANCELLED" },
    });

    // ── Create the new subscription ───────────────────────────────────────────
    const sub = await prisma.subscription.create({
      data: {
        userId,
        tier,
        role,
        status: "ACTIVE",
        price: plan.price,
        currency: "NGN",
        startedAt: new Date(),
        expiresAt,
        autoRenew: true,
        reference,
        paystackSubscriptionCode: paystackSub?.subscription_code || null,
        paystackCustomerCode: customerCode,
        paystackPlanCode: getPlanCode(planId),
        paystackEmailToken: paystackSub?.email_token || null,
        paystackStatus: paystackSub?.status || "active",
        nextPaymentDate: paystackSub?.next_payment_date
          ? new Date(paystackSub.next_payment_date)
          : expiresAt,
      },
    });

    // ── Record promo usage after subscription created ─────────────────────────
    if (promoCodeId) {
      const finalAmt = (tx.amount ?? 0) / 100;
      await recordPromoUsage(
        promoCodeId,
        userId,
        planId,
        {
          discountAmt: promoDiscount || 0,
          originalAmt: originalPrice || plan.price,
          finalAmt,
        },
        reference,
      ).catch((err) => console.error("recordPromoUsage error:", err.message));
    }

    await prisma.notification.create({
      data: {
        userId,
        title: `${plan.name} Activated ✅`,
        body:
          promoDiscount > 0
            ? `Your ${plan.name} is active! You saved ₦${promoDiscount.toLocaleString()} with your promo code.`
            : `Your ${plan.name} subscription is now active at ₦${plan.price.toLocaleString()}/month.`,
        type: "SUBSCRIPTION_ACTIVATED",
        data: { planId, tier, reference, expiresAt, promoDiscount },
      },
    });

    return sendResponse(res, {
      message: `${plan.name} activated`,
      data: {
        subscription: sub,
        plan,
        planId: plan.id, // ← expose so the frontend can mark the right card
        promoApplied: promoCodeId !== null,
        promoDiscount: promoDiscount || 0,
      },
    });
  } catch (err) {
    console.error("Paystack verify error:", err.code || "", err.message);
    if (err.code === "RATE_LIMIT") {
      return sendError(
        res,
        "Paystack is busy. Please wait a few seconds and try again.",
        429,
      );
    }
    return sendError(res, err.message || "Failed to verify payment");
  }
};

// ── POST /api/subscriptions/cancel ───────────────────────────────────────────
// REPLACES the existing cancelSubscription — adds Paystack cancellation
export const cancelSubscription = async (req, res) => {
  try {
    const sub = await prisma.subscription.findFirst({
      where: { userId: req.user.id, status: "ACTIVE" },
    });

    if (!sub) return sendError(res, "No active subscription", 404);

    // ── Cancel recurring billing on Paystack ──────────────────────────────────
    if (sub.paystackSubscriptionCode && sub.paystackEmailToken) {
      try {
        await paystackRequest("/subscription/disable", "POST", {
          code: sub.paystackSubscriptionCode,
          token: sub.paystackEmailToken,
        });
        console.log(
          `✅ Paystack subscription ${sub.paystackSubscriptionCode} disabled`,
        );
      } catch (err) {
        // Log but don't block — still cancel locally
        console.error("Paystack disable failed:", err.message);
      }
    }

    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: "CANCELLED",
        autoRenew: false,
        paystackStatus: "cancelled",
      },
    });

    return sendResponse(res, {
      message: "Subscription cancelled. Access remains until period end.",
    });
  } catch (err) {
    return sendError(res, "Failed to cancel subscription");
  }
};

// GET /api/subscriptions/invoice/:sessionId — download invoice
export const getInvoice = async (req, res) => {
  try {
    const { reference } = req.params;
    const tx = await paystackRequest(`/transaction/verify/${reference}`);

    return sendResponse(res, {
      data: {
        reference: tx.reference,
        amount: tx.amount / 100, // convert from kobo
        currency: tx.currency,
        status: tx.status,
        paidAt: tx.paid_at,
        channel: tx.channel,
        receiptUrl: null, // Paystack doesn't have hosted receipts
        // You can build a receipt page on your frontend using this data
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch invoice");
  }
};

export const paystackWebhook = async (req, res) => {
  try {
    // ── Verify webhook signature ──────────────────────────────────────────────
    const crypto = await import("crypto");
    const hash = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      return res.status(401).json({ message: "Invalid signature" });
    }

    const { event, data } = req.body;
    console.log(`[Paystack Webhook] ${event}`);

    switch (event) {
      // ── Subscription renewed successfully ─────────────────────────────────
      case "invoice.payment_failed": {
        // Paystack failed to charge — subscription is past due
        const sub = await prisma.subscription.findFirst({
          where: {
            paystackSubscriptionCode: data.subscription?.subscription_code,
          },
        });
        if (sub) {
          await prisma.subscription.update({
            where: { id: sub.id },
            data: { paystackStatus: "attention", autoRenew: false },
          });
          await prisma.notification.create({
            data: {
              userId: sub.userId,
              title: "Subscription Payment Failed ⚠️",
              body: "We couldn't charge your card for your subscription renewal. Please update your payment method.",
              type: "SUBSCRIPTION_PAYMENT_FAILED",
              data: { subscriptionId: sub.id },
            },
          });
        }
        break;
      }

      // ── Subscription renewed ──────────────────────────────────────────────
      case "subscription.create":
      case "invoice.update": {
        if (data.paid) {
          const sub = await prisma.subscription.findFirst({
            where: {
              paystackSubscriptionCode: data.subscription?.subscription_code,
            },
          });
          if (sub) {
            const newExpiry = new Date(sub.expiresAt || new Date());
            newExpiry.setMonth(newExpiry.getMonth() + 1);
            await prisma.subscription.update({
              where: { id: sub.id },
              data: {
                status: "ACTIVE",
                expiresAt: newExpiry,
                paystackStatus: "active",
                nextPaymentDate: data.subscription?.next_payment_date
                  ? new Date(data.subscription.next_payment_date)
                  : newExpiry,
              },
            });
          }
        }
        break;
      }

      // ── Subscription disabled/cancelled on Paystack side ─────────────────
      case "subscription.disable":
      case "subscription.not_renew": {
        const sub = await prisma.subscription.findFirst({
          where: { paystackSubscriptionCode: data.subscription_code },
        });
        if (sub) {
          await prisma.subscription.update({
            where: { id: sub.id },
            data: { autoRenew: false, paystackStatus: "cancelled" },
          });
        }
        break;
      }

      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("[Paystack Webhook Error]", err.message);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
};
