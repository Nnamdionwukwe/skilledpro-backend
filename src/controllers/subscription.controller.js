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

let _stripe;
function getStripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

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

// ── Map plan ID → Paystack plan code ─────────────────────────────────────────
export function getPlanCode(planId) {
  const map = {
    // Monthly
    worker_pro: process.env.PAYSTACK_WORKER_PRO_PLAN_CODE,
    worker_enterprise: process.env.PAYSTACK_WORKER_ENT_PLAN_CODE,
    hirer_pro: process.env.PAYSTACK_HIRER_PRO_PLAN_CODE,
    hirer_enterprise: process.env.PAYSTACK_HIRER_ENT_PLAN_CODE,
    // Yearly
    worker_pro_yearly: process.env.PAYSTACK_WORKER_PRO_YEARLY_PLAN_CODE,
    worker_enterprise_yearly: process.env.PAYSTACK_WORKER_ENT_YEARLY_PLAN_CODE,
    hirer_pro_yearly: process.env.PAYSTACK_HIRER_PRO_YEARLY_PLAN_CODE,
    hirer_enterprise_yearly: process.env.PAYSTACK_HIRER_ENT_YEARLY_PLAN_CODE,
  };
  return map[planId] || null;
}

export const WORKER_PLANS = [
  // ── FREE ────────────────────────────────────────────────────────────────────
  {
    id: "worker_free",
    tier: "FREE",
    name: "Free",
    price: 0,
    yearlyPrice: 0,
    currency: "NGN",
    billingCycle: "forever",
    stripePriceId: null,
    features: [
      "Apply to up to 15 jobs/month",
      "Basic profile listing",
      "3 portfolio images",
      "Standard search placement",
      "Basic messaging",
      "Community support",
    ],
    limits: {
      bidsPerMonth: 15,
      portfolioImages: 3,
      boosted: false,
      analytics: false,
      prioritySupport: false,
      teamAccounts: 0,
      apiAccess: false,
    },
  },

  // ── PRO MONTHLY ─────────────────────────────────────────────────────────────
  {
    id: "worker_pro",
    tier: "PRO",
    name: "Pro Worker",
    price: 2500, // ₦2,500/month
    yearlyPrice: 25000, // ₦25,000/year (save ₦5,000 — 2 months free)
    currency: "NGN",
    billingCycle: "monthly",
    popular: true,
    stripePriceId: null,
    paystackPlanCode: process.env.PAYSTACK_WORKER_PRO_PLAN_CODE,
    paystackYearlyCode: process.env.PAYSTACK_WORKER_PRO_YEARLY_PLAN_CODE,
    savings: "Save ₦5,000/year",
    features: [
      "Unlimited job applications",
      "⭐ Pro badge — stand out to hirers",
      "Boosted in search results",
      "Up to 20 portfolio images",
      "Video intro on profile",
      "Earnings analytics",
      "Priority support",
      "Direct booking requests from hirers",
    ],
    limits: {
      bidsPerMonth: -1,
      portfolioImages: 20,
      boosted: true,
      analytics: true,
      prioritySupport: true,
      teamAccounts: 0,
      apiAccess: false,
    },
  },

  // ── PRO YEARLY (same limits, different billing) ──────────────────────────────
  {
    id: "worker_pro_yearly",
    tier: "PRO",
    name: "Pro Worker",
    price: 25000, // ₦25,000/year billed annually
    monthlyEquivalent: 2083, // ₦2,083/month equivalent
    currency: "NGN",
    billingCycle: "yearly",
    popular: false,
    stripePriceId: null,
    paystackPlanCode: process.env.PAYSTACK_WORKER_PRO_YEARLY_PLAN_CODE,
    savings: "Save ₦5,000 vs monthly",
    badge: "Best Value",
    features: [
      "Unlimited job applications",
      "⭐ Pro badge — stand out to hirers",
      "Boosted in search results",
      "Up to 20 portfolio images",
      "Video intro on profile",
      "Earnings analytics",
      "Priority support",
      "Direct booking requests from hirers",
      "🎁 2 months free vs monthly plan",
    ],
    limits: {
      bidsPerMonth: -1,
      portfolioImages: 20,
      boosted: true,
      analytics: true,
      prioritySupport: true,
      teamAccounts: 0,
      apiAccess: false,
    },
  },

  // ── ENTERPRISE MONTHLY ───────────────────────────────────────────────────────
  {
    id: "worker_enterprise",
    tier: "ENTERPRISE",
    name: "Enterprise Worker",
    price: 8000, // ₦8,000/month
    yearlyPrice: 80000, // ₦80,000/year (save ₦16,000)
    currency: "NGN",
    billingCycle: "monthly",
    stripePriceId: null,
    paystackPlanCode: process.env.PAYSTACK_WORKER_ENT_PLAN_CODE,
    paystackYearlyCode: process.env.PAYSTACK_WORKER_ENT_YEARLY_PLAN_CODE,
    savings: "Save ₦16,000/year",
    features: [
      "Everything in Pro",
      "🏆 Featured at top of category",
      "Team sub-accounts (up to 5 workers)",
      "White-label invoices",
      "API access",
      "Dedicated account manager",
      "SLA support",
      "Custom profile domain",
      "Bulk application tools",
    ],
    limits: {
      bidsPerMonth: -1,
      portfolioImages: -1,
      boosted: true,
      analytics: true,
      prioritySupport: true,
      teamAccounts: 5,
      apiAccess: true,
    },
  },

  // ── ENTERPRISE YEARLY ────────────────────────────────────────────────────────
  {
    id: "worker_enterprise_yearly",
    tier: "ENTERPRISE",
    name: "Enterprise Worker",
    price: 80000, // ₦80,000/year
    monthlyEquivalent: 6667, // ₦6,667/month equivalent
    currency: "NGN",
    billingCycle: "yearly",
    stripePriceId: null,
    paystackPlanCode: process.env.PAYSTACK_WORKER_ENT_YEARLY_PLAN_CODE,
    savings: "Save ₦16,000 vs monthly",
    badge: "Best Value",
    features: [
      "Everything in Pro",
      "🏆 Featured at top of category",
      "Team sub-accounts (up to 5 workers)",
      "White-label invoices",
      "API access",
      "Dedicated account manager",
      "SLA support",
      "Custom profile domain",
      "Bulk application tools",
      "🎁 2 months free vs monthly plan",
    ],
    limits: {
      bidsPerMonth: -1,
      portfolioImages: -1,
      boosted: true,
      analytics: true,
      prioritySupport: true,
      teamAccounts: 5,
      apiAccess: true,
    },
  },
];

export const HIRER_PLANS = [
  // ── FREE ────────────────────────────────────────────────────────────────────
  {
    id: "hirer_free",
    tier: "FREE",
    name: "Free",
    price: 0,
    yearlyPrice: 0,
    currency: "NGN",
    billingCycle: "forever",
    stripePriceId: null,
    features: [
      "Post up to 5 jobs/month",
      "Access full worker search",
      "Basic messaging",
      "3 saved searches",
      "Community support",
    ],
    limits: {
      jobPostsPerMonth: 5,
      boostedSearch: false,
      advancedFilters: false,
      analytics: false,
      teamAccounts: 0,
      apiAccess: false,
      bulkHiring: false,
    },
  },

  // ── PRO MONTHLY ─────────────────────────────────────────────────────────────
  {
    id: "hirer_pro",
    tier: "PRO",
    name: "Pro Hirer",
    price: 3500, // ₦3,500/month
    yearlyPrice: 35000, // ₦35,000/year (save ₦7,000)
    currency: "NGN",
    billingCycle: "monthly",
    popular: true,
    stripePriceId: null,
    paystackPlanCode: process.env.PAYSTACK_HIRER_PRO_PLAN_CODE,
    paystackYearlyCode: process.env.PAYSTACK_HIRER_PRO_YEARLY_PLAN_CODE,
    savings: "Save ₦7,000/year",
    features: [
      "Unlimited job posts",
      "See verified workers first",
      "Advanced GPS radius filters",
      "Unlimited saved worker lists",
      "Priority worker matching",
      "⭐ Pro badge on profile",
      "Job post analytics",
      "Direct booking (skip job board)",
    ],
    limits: {
      jobPostsPerMonth: -1,
      boostedSearch: true,
      advancedFilters: true,
      analytics: true,
      teamAccounts: 0,
      apiAccess: false,
      bulkHiring: false,
    },
  },

  // ── PRO YEARLY ───────────────────────────────────────────────────────────────
  {
    id: "hirer_pro_yearly",
    tier: "PRO",
    name: "Pro Hirer",
    price: 35000, // ₦35,000/year
    monthlyEquivalent: 2917, // ₦2,917/month equivalent
    currency: "NGN",
    billingCycle: "yearly",
    popular: false,
    stripePriceId: null,
    paystackPlanCode: process.env.PAYSTACK_HIRER_PRO_YEARLY_PLAN_CODE,
    savings: "Save ₦7,000 vs monthly",
    badge: "Best Value",
    features: [
      "Unlimited job posts",
      "See verified workers first",
      "Advanced GPS radius filters",
      "Unlimited saved worker lists",
      "Priority worker matching",
      "⭐ Pro badge on profile",
      "Job post analytics",
      "Direct booking (skip job board)",
      "🎁 2 months free vs monthly plan",
    ],
    limits: {
      jobPostsPerMonth: -1,
      boostedSearch: true,
      advancedFilters: true,
      analytics: true,
      teamAccounts: 0,
      apiAccess: false,
      bulkHiring: false,
    },
  },

  // ── ENTERPRISE MONTHLY ───────────────────────────────────────────────────────
  {
    id: "hirer_enterprise",
    tier: "ENTERPRISE",
    name: "Enterprise",
    price: 20000, // ₦20,000/month
    yearlyPrice: 200000, // ₦200,000/year (save ₦40,000)
    currency: "NGN",
    billingCycle: "monthly",
    stripePriceId: null,
    paystackPlanCode: process.env.PAYSTACK_HIRER_ENT_PLAN_CODE,
    paystackYearlyCode: process.env.PAYSTACK_HIRER_ENT_YEARLY_PLAN_CODE,
    savings: "Save ₦40,000/year",
    features: [
      "Everything in Pro",
      "Bulk hiring dashboard",
      "Team accounts (up to 20 hirers)",
      "Dedicated account manager",
      "Invoice & purchase order billing",
      "API integration",
      "Compliance & audit reporting",
      "Custom onboarding",
      "SLA guarantee",
    ],
    limits: {
      jobPostsPerMonth: -1,
      boostedSearch: true,
      advancedFilters: true,
      analytics: true,
      teamAccounts: 20,
      apiAccess: true,
      bulkHiring: true,
    },
  },

  // ── ENTERPRISE YEARLY ────────────────────────────────────────────────────────
  {
    id: "hirer_enterprise_yearly",
    tier: "ENTERPRISE",
    name: "Enterprise",
    price: 200000, // ₦200,000/year
    monthlyEquivalent: 16667, // ₦16,667/month equivalent
    currency: "NGN",
    billingCycle: "yearly",
    stripePriceId: null,
    paystackPlanCode: process.env.PAYSTACK_HIRER_ENT_YEARLY_PLAN_CODE,
    savings: "Save ₦40,000 vs monthly",
    badge: "Best Value",
    features: [
      "Everything in Pro",
      "Bulk hiring dashboard",
      "Team accounts (up to 20 hirers)",
      "Dedicated account manager",
      "Invoice & purchase order billing",
      "API integration",
      "Compliance & audit reporting",
      "Custom onboarding",
      "SLA guarantee",
      "🎁 2 months free vs monthly plan",
    ],
    limits: {
      jobPostsPerMonth: -1,
      boostedSearch: true,
      advancedFilters: true,
      analytics: true,
      teamAccounts: 20,
      apiAccess: true,
      bulkHiring: true,
    },
  },
];

export const FEATURED_PACKAGES = [
  // Keep for future when traffic justifies paid placement
  // Until you hit 50k users, featured is a subscription perk only
  {
    id: "featured_7days",
    name: "7-Day Spotlight",
    days: 7,
    price: 1500, // ₦1,500 — was $5 (₦7,700+), too expensive
    currency: "NGN",
    description: "Appear at the top of your category for 7 days",
    type: "CATEGORY_TOP",
    availableFrom: "phase2", // Don't even show this until phase 2
  },
  {
    id: "featured_14days",
    name: "14-Day Boost",
    days: 14,
    price: 2500, // ₦2,500 — was $9
    currency: "NGN",
    description: "14 days of top placement across all search results",
    type: "SEARCH_TOP",
    popular: true,
    availableFrom: "phase2",
  },
  {
    id: "featured_30days",
    name: "30-Day Premium",
    days: 30,
    price: 5000, // ₦5,000 — was $19
    currency: "NGN",
    description: "30 days at the top + homepage feature",
    type: "HOMEPAGE",
    availableFrom: "phase2",
  },
];

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
    const sub = await prisma.subscription.findFirst({
      where: { userId: req.user.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });

    const plans = req.user.role === "WORKER" ? WORKER_PLANS : HIRER_PLANS;
    const currentPlan =
      plans.find((p) => p.tier === (sub?.tier || "FREE")) || plans[0];

    return sendResponse(res, {
      data: {
        subscription: sub || { tier: "FREE", status: "ACTIVE", price: 0 },
        plan: currentPlan,
        isActive: !sub || sub.status === "ACTIVE",
        expiresAt: sub?.expiresAt || null,
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch subscription");
  }
};

// ── POST /api/subscriptions/checkout ─────────────────────────────────────────
// Returns a Paystack authorization URL — open in WebBrowser on mobile
export const createCheckout = async (req, res) => {
  try {
    const { planId } = req.body;
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

    // ── Initialize Paystack transaction with a plan ───────────────────────────
    // When a plan is passed, Paystack automatically sets up recurring billing.
    const txData = await paystackRequest("/transaction/initialize", "POST", {
      email: user.email,
      amount: plan.price * 100, // kobo
      plan: planCode,
      currency: "NGN",
      metadata: {
        userId: req.user.id,
        planId,
        tier: plan.tier,
        role,
        cancel_action: `${process.env.CLIENT_URL}/dashboard/${role.toLowerCase()}/subscription`,
      },
      callback_url: `${process.env.CLIENT_URL}/subscription/verify?plan=${planId}`,
    });

    return sendResponse(res, {
      data: {
        url: txData.authorization_url,
        reference: txData.reference,
        accessCode: txData.access_code,
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

    // ── Verify the transaction with Paystack ──────────────────────────────────
    const tx = await paystackRequest(`/transaction/verify/${reference}`);

    if (tx.status !== "success") {
      return sendError(res, "Payment not successful", 400);
    }

    const { userId, planId, tier, role } = tx.metadata;

    // ── Fetch the subscription Paystack created (via the plan) ────────────────
    // Paystack auto-creates a subscription when a transaction with a plan succeeds
    let paystackSub = null;
    let customerCode = tx.customer?.customer_code || null;

    try {
      // Get subscriptions for this customer + plan
      const planCode = getPlanCode(planId);
      const subs = await paystackRequest(
        `/subscription?customer=${customerCode}&plan=${planCode}`,
      );
      // subs is an array — get the most recent active one
      paystackSub = Array.isArray(subs)
        ? subs.find((s) => s.status === "active") || subs[0]
        : null;
    } catch {
      // Non-fatal — subscription still worked, we just can't get the sub code
    }

    const plans = role === "WORKER" ? WORKER_PLANS : HIRER_PLANS;
    const plan = plans.find((p) => p.id === planId);
    const isYearly = planId.endsWith("_yearly");
    const expiresAt = new Date();
    if (isYearly) {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }

    // ── Cancel any existing active subscription ───────────────────────────────
    const existingSub = await prisma.subscription.findFirst({
      where: { userId, status: "ACTIVE" },
    });

    if (existingSub?.paystackSubscriptionCode) {
      // Disable on Paystack side too
      try {
        await paystackRequest("/subscription/disable", "POST", {
          code: existingSub.paystackSubscriptionCode,
          token: existingSub.paystackEmailToken,
        });
      } catch {
        /* non-fatal */
      }
    }

    await prisma.subscription.updateMany({
      where: { userId, status: "ACTIVE" },
      data: { status: "CANCELLED" },
    });

    // ── Create new subscription record ────────────────────────────────────────
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
        // Paystack-specific fields (from migration)
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

    await prisma.notification.create({
      data: {
        userId,
        title: `${plan.name} Activated ✅`,
        body: `Your ${plan.name} subscription is now active at ₦${plan.price.toLocaleString()}/month.`,
        type: "SUBSCRIPTION_ACTIVATED",
        data: { planId, tier, reference, expiresAt },
      },
    });

    return sendResponse(res, {
      message: `${plan.name} activated`,
      data: { subscription: sub, plan },
    });
  } catch (err) {
    console.error("Paystack verify error:", err.message);
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
