import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

// ── Plan definitions ──────────────────────────────────────────────────────────
export const WORKER_PLANS = [
  {
    id: "worker_free",
    tier: "FREE",
    name: "Free",
    price: 0,
    currency: "NGN",
    billingCycle: "forever",
    features: [
      "Basic profile listing",
      "Apply to up to 5 jobs/month",
      "Standard search placement",
      "1 portfolio image",
      "Basic support",
    ],
    limits: { bidsPerMonth: 5, portfolioImages: 1, boosted: false },
  },
  {
    id: "worker_pro",
    tier: "PRO",
    name: "Pro Worker",
    price: 5000,
    currency: "NGN",
    billingCycle: "monthly",
    popular: true,
    features: [
      "Boosted profile in search results",
      "Apply to unlimited jobs/month",
      "Pro badge on your profile",
      "Up to 20 portfolio images",
      "Priority in hirer search",
      "Analytics dashboard",
      "Priority customer support",
    ],
    limits: { bidsPerMonth: -1, portfolioImages: 20, boosted: true },
  },
  {
    id: "worker_enterprise",
    tier: "ENTERPRISE",
    name: "Enterprise Worker",
    price: 15000,
    currency: "NGN",
    billingCycle: "monthly",
    features: [
      "Everything in Pro",
      "Featured at top of category search",
      "Dedicated account manager",
      "Team sub-accounts (up to 5)",
      "White-label invoices",
      "API access",
      "SLA support",
    ],
    limits: { bidsPerMonth: -1, portfolioImages: -1, boosted: true },
  },
];

export const HIRER_PLANS = [
  {
    id: "hirer_free",
    tier: "FREE",
    name: "Free",
    price: 0,
    currency: "NGN",
    billingCycle: "forever",
    features: [
      "Post up to 3 jobs/month",
      "Access to standard worker search",
      "Basic messaging",
      "Community support",
    ],
    limits: { jobPostsPerMonth: 3, boostedSearch: false },
  },
  {
    id: "hirer_pro",
    tier: "PRO",
    name: "Pro Hirer",
    price: 8000,
    currency: "NGN",
    billingCycle: "monthly",
    popular: true,
    features: [
      "Post unlimited jobs",
      "See verified workers first",
      "Advanced filters (GPS radius, rating, etc.)",
      "Saved worker lists",
      "Priority matching",
      "Pro badge on your profile",
      "Analytics on your job posts",
    ],
    limits: { jobPostsPerMonth: -1, boostedSearch: true },
  },
  {
    id: "hirer_enterprise",
    tier: "ENTERPRISE",
    name: "Enterprise",
    price: 50000,
    currency: "NGN",
    billingCycle: "monthly",
    features: [
      "Everything in Pro",
      "Bulk hiring dashboard",
      "Team accounts (up to 20 hirers)",
      "Dedicated account manager",
      "Custom SLA & contracts",
      "Invoice & purchase order billing",
      "API integration",
      "Compliance reporting",
    ],
    limits: { jobPostsPerMonth: -1, boostedSearch: true },
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

    const role = req.user.role;
    const plans = role === "WORKER" ? WORKER_PLANS : HIRER_PLANS;
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

// POST /api/subscriptions/subscribe
export const subscribe = async (req, res) => {
  try {
    const { planId, paymentMethod = "manual" } = req.body;
    if (!planId) return sendError(res, "Plan ID is required", 400);

    const role = req.user.role;
    const plans = role === "WORKER" ? WORKER_PLANS : HIRER_PLANS;
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return sendError(res, "Invalid plan", 404);

    if (plan.tier === "FREE") {
      return sendError(res, "You are already on the free plan", 400);
    }

    // Cancel any existing active subscription
    await prisma.subscription.updateMany({
      where: { userId: req.user.id, status: "ACTIVE" },
      data: { status: "CANCELLED" },
    });

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    const reference = `SUB-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const sub = await prisma.subscription.create({
      data: {
        userId: req.user.id,
        tier: plan.tier,
        role: role,
        status: "ACTIVE",
        price: plan.price,
        currency: plan.currency,
        startedAt: new Date(),
        expiresAt,
        autoRenew: true,
        reference,
      },
    });

    // Notify user
    await prisma.notification.create({
      data: {
        userId: req.user.id,
        title: `${plan.name} Activated ✅`,
        body: `Your ${plan.name} subscription is now active. Enjoy your benefits!`,
        type: "SUBSCRIPTION_ACTIVATED",
        data: { planId: plan.id, tier: plan.tier, reference, expiresAt },
      },
    });

    return sendResponse(res, {
      status: 201,
      message: `${plan.name} subscription activated`,
      data: { subscription: sub, plan, reference },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to subscribe");
  }
};

// POST /api/subscriptions/cancel
export const cancelSubscription = async (req, res) => {
  try {
    await prisma.subscription.updateMany({
      where: { userId: req.user.id, status: "ACTIVE" },
      data: { status: "CANCELLED", autoRenew: false },
    });

    await prisma.notification.create({
      data: {
        userId: req.user.id,
        title: "Subscription Cancelled",
        body: "Your subscription has been cancelled. You will retain access until the end of your billing period.",
        type: "SUBSCRIPTION_CANCELLED",
        data: {},
      },
    });

    return sendResponse(res, { message: "Subscription cancelled" });
  } catch (err) {
    return sendError(res, "Failed to cancel subscription");
  }
};
