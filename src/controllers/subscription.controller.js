import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import Stripe from "stripe";

let _stripe;
function getStripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

// ── Plan definitions (USD) ────────────────────────────────────────────────────
export const WORKER_PLANS = [
  {
    id: "worker_free",
    tier: "FREE",
    name: "Free",
    price: 0,
    currency: "USD",
    billingCycle: "forever",
    stripePriceId: null,
    features: [
      "Basic profile listing in search",
      "Apply to up to 5 jobs/month",
      "Standard search placement",
      "1 portfolio image",
      "Basic messaging",
      "Community support",
    ],
    limits: {
      bidsPerMonth: 5,
      portfolioImages: 1,
      boosted: false,
      analytics: false,
      prioritySupport: false,
      teamAccounts: 0,
      apiAccess: false,
    },
  },
  {
    id: "worker_pro",
    tier: "PRO",
    name: "Pro Worker",
    price: 9,
    currency: "USD",
    billingCycle: "monthly",
    popular: true,
    stripePriceId: process.env.STRIPE_WORKER_PRO_PRICE_ID,
    features: [
      "Boosted profile in search results",
      "Unlimited job applications/month",
      "⭐ Pro badge on your profile",
      "Up to 20 portfolio images",
      "Priority in hirer search",
      "Earnings analytics dashboard",
      "Priority customer support",
      "Video intro on profile",
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
  {
    id: "worker_enterprise",
    tier: "ENTERPRISE",
    name: "Enterprise Worker",
    price: 29,
    currency: "USD",
    billingCycle: "monthly",
    stripePriceId: process.env.STRIPE_WORKER_ENTERPRISE_PRICE_ID,
    features: [
      "Everything in Pro",
      "🏆 Featured at top of category search",
      "Dedicated account manager",
      "Team sub-accounts (up to 5 workers)",
      "White-label invoices",
      "API access",
      "SLA guaranteed support",
      "Custom profile domain",
      "Bulk job application tools",
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
  {
    id: "hirer_free",
    tier: "FREE",
    name: "Free",
    price: 0,
    currency: "USD",
    billingCycle: "forever",
    stripePriceId: null,
    features: [
      "Post up to 3 jobs/month",
      "Access standard worker search",
      "Basic messaging",
      "1 saved search",
      "Community support",
    ],
    limits: {
      jobPostsPerMonth: 3,
      boostedSearch: false,
      advancedFilters: false,
      analytics: false,
      teamAccounts: 0,
      apiAccess: false,
      bulkHiring: false,
    },
  },
  {
    id: "hirer_pro",
    tier: "PRO",
    name: "Pro Hirer",
    price: 15,
    currency: "USD",
    billingCycle: "monthly",
    popular: true,
    stripePriceId: process.env.STRIPE_HIRER_PRO_PRICE_ID,
    features: [
      "Post unlimited jobs/month",
      "See verified workers first",
      "Advanced GPS radius filters",
      "Saved worker lists (unlimited)",
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
  {
    id: "hirer_enterprise",
    tier: "ENTERPRISE",
    name: "Enterprise",
    price: 79,
    currency: "USD",
    billingCycle: "monthly",
    stripePriceId: process.env.STRIPE_HIRER_ENTERPRISE_PRICE_ID,
    features: [
      "Everything in Pro",
      "Bulk hiring dashboard",
      "Team accounts (up to 20 hirers)",
      "Dedicated account manager",
      "Custom SLA & contract terms",
      "Invoice & purchase order billing",
      "API integration",
      "Compliance & audit reporting",
      "Custom onboarding",
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

// POST /api/subscriptions/checkout — create Stripe checkout session
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

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(plan.price * 100),
            recurring: { interval: "month" },
            product_data: {
              name: plan.name,
              description: plan.features.slice(0, 3).join(" · "),
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.CLIENT_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}&plan=${planId}`,
      cancel_url: `${process.env.CLIENT_URL}/dashboard/${role.toLowerCase()}/subscription`,
      metadata: {
        userId: req.user.id,
        planId,
        tier: plan.tier,
        role,
      },
    });

    return sendResponse(res, {
      data: { url: session.url, sessionId: session.id },
    });
  } catch (err) {
    console.error("Checkout error:", err.message);
    return sendError(res, "Failed to create checkout session");
  }
};

// POST /api/subscriptions/verify — called after Stripe redirect
export const verifyCheckout = async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return sendError(res, "Session ID required", 400);

    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return sendError(res, "Payment not completed", 400);
    }

    const { userId, planId, tier, role } = session.metadata;

    // Cancel any existing active sub
    await prisma.subscription.updateMany({
      where: { userId, status: "ACTIVE" },
      data: { status: "CANCELLED" },
    });

    const plans = role === "WORKER" ? WORKER_PLANS : HIRER_PLANS;
    const plan = plans.find((p) => p.id === planId);

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    const sub = await prisma.subscription.create({
      data: {
        userId,
        tier,
        role,
        status: "ACTIVE",
        price: plan.price,
        currency: "USD",
        startedAt: new Date(),
        expiresAt,
        autoRenew: true,
        reference: session.id,
        stripeSessionId: session.id,
      },
    });

    await prisma.notification.create({
      data: {
        userId,
        title: `${plan.name} Activated ✅`,
        body: `Your ${plan.name} subscription is now active. Enjoy your upgraded features!`,
        type: "SUBSCRIPTION_ACTIVATED",
        data: { planId, tier, sessionId, expiresAt },
      },
    });

    return sendResponse(res, {
      message: `${plan.name} activated`,
      data: { subscription: sub, plan },
    });
  } catch (err) {
    console.error("Verify error:", err.message);
    return sendError(res, "Failed to verify payment");
  }
};

// POST /api/subscriptions/cancel
export const cancelSubscription = async (req, res) => {
  try {
    const sub = await prisma.subscription.findFirst({
      where: { userId: req.user.id, status: "ACTIVE" },
    });

    if (!sub) return sendError(res, "No active subscription", 404);

    // Cancel in Stripe if has subscription ID
    if (sub.stripeSubscriptionId) {
      await getStripe()
        .subscriptions.cancel(sub.stripeSubscriptionId)
        .catch(() => {});
    }

    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "CANCELLED", autoRenew: false },
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
    const session = await getStripe().checkout.sessions.retrieve(
      req.params.sessionId,
      { expand: ["invoice"] },
    );

    if (session.invoice?.hosted_invoice_url) {
      return sendResponse(res, {
        data: {
          invoiceUrl: session.invoice.hosted_invoice_url,
          pdfUrl: session.invoice.invoice_pdf,
        },
      });
    }

    return sendError(res, "Invoice not available", 404);
  } catch (err) {
    return sendError(res, "Failed to fetch invoice");
  }
};
