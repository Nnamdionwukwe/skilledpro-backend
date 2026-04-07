import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import Stripe from "stripe";

let _stripe;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
  }
  if (!_stripe)
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16",
    });
  return _stripe;
}

// ── Plans (no Stripe Price IDs needed for one-time payments) ─────────────────
export const WORKER_PLANS = {
  FREE: {
    name: "Free",
    price: 0,
    tier: "FREE",
    features: ["5 bookings/mo", "Basic profile", "Standard search listing"],
  },
  PRO: {
    name: "Pro",
    price: 9,
    tier: "PRO",
    features: [
      "Unlimited bookings",
      "Pro badge",
      "Priority listing",
      "Advanced analytics",
      "GPS radius filter",
    ],
  },
  ENTERPRISE: {
    name: "Enterprise",
    price: 29,
    tier: "ENTERPRISE",
    features: [
      "Everything in Pro",
      "Team accounts",
      "API access",
      "Dedicated support",
      "Custom integrations",
    ],
  },
};

export const HIRER_PLANS = {
  FREE: {
    name: "Free",
    price: 0,
    tier: "FREE",
    features: ["3 active hires/mo", "Basic search", "Standard support"],
  },
  PRO: {
    name: "Pro",
    price: 15,
    tier: "PRO",
    features: [
      "Unlimited hires",
      "Advanced search filters",
      "Priority support",
      "Bulk hiring tools",
    ],
  },
  ENTERPRISE: {
    name: "Enterprise",
    price: 79,
    tier: "ENTERPRISE",
    features: [
      "Everything in Pro",
      "Team accounts",
      "API access",
      "Dedicated account manager",
      "Custom contracts",
    ],
  },
};

// GET /api/subscriptions/plans
export const getPlans = async (req, res) => {
  return sendResponse(res, {
    data: {
      worker: Object.entries(WORKER_PLANS).map(([id, p]) => ({ id, ...p })),
      hirer: Object.entries(HIRER_PLANS).map(([id, p]) => ({ id, ...p })),
    },
  });
};

// GET /api/subscriptions/my
export const getMySubscription = async (req, res) => {
  try {
    const sub = await prisma.subscription.findFirst({
      where: { userId: req.user.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
    return sendResponse(res, { data: { subscription: sub || null } });
  } catch (err) {
    return sendError(res, "Failed to fetch subscription");
  }
};

// POST /api/subscriptions/checkout
export const createCheckout = async (req, res) => {
  try {
    const { tier, role } = req.body;

    if (!tier || !role)
      return sendError(res, "tier and role are required", 400);
    if (!["PRO", "ENTERPRISE"].includes(tier))
      return sendError(res, "Invalid tier", 400);
    if (!["WORKER", "HIRER"].includes(role))
      return sendError(res, "Invalid role", 400);

    const plans = role === "WORKER" ? WORKER_PLANS : HIRER_PLANS;
    const plan = plans[tier];
    if (!plan) return sendError(res, "Plan not found", 404);

    // Validate env vars upfront with clear messages
    const clientUrl = process.env.CLIENT_URL;
    if (!clientUrl)
      return sendError(res, "SERVER_CONFIG: CLIENT_URL not set", 500);

    const stripe = getStripe();
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    // Use Stripe price IDs if set, otherwise create one-time payment
    const priceIdKey = `STRIPE_${role}_${tier}_PRICE_ID`;
    const priceId = process.env[priceIdKey];

    let sessionConfig;

    if (priceId) {
      // Recurring subscription
      sessionConfig = {
        payment_method_types: ["card"],
        mode: "subscription",
        customer_email: user.email,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${clientUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}&tier=${tier}&role=${role}`,
        cancel_url: `${clientUrl}/dashboard/${role.toLowerCase()}`,
        metadata: { userId: req.user.id, tier, role, planName: plan.name },
      };
    } else {
      // One-time payment fallback (no price ID needed)
      sessionConfig = {
        payment_method_types: ["card"],
        mode: "payment",
        customer_email: user.email,
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: plan.price * 100,
              product_data: {
                name: `SkilledProz ${plan.name} — ${role}`,
                description: plan.features.join(", "),
              },
            },
            quantity: 1,
          },
        ],
        success_url: `${clientUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}&tier=${tier}&role=${role}`,
        cancel_url: `${clientUrl}/dashboard/${role.toLowerCase()}`,
        metadata: { userId: req.user.id, tier, role, planName: plan.name },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    return sendResponse(res, {
      data: { url: session.url, sessionId: session.id },
    });
  } catch (err) {
    console.error("createCheckout error:", err.message);
    return sendError(res, `Checkout failed: ${err.message}`, 500);
  }
};

// POST /api/subscriptions/verify
export const verifyCheckout = async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return sendError(res, "Session ID required", 400);

    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (
      !["paid", "complete"].includes(session.payment_status) &&
      session.mode !== "subscription"
    ) {
      return sendError(res, "Payment not completed", 400);
    }

    const { userId, tier, role, planName } = session.metadata;

    // Deactivate old subscriptions
    await prisma.subscription.updateMany({
      where: { userId, status: "ACTIVE" },
      data: { status: "CANCELLED" },
    });

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    const sub = await prisma.subscription.create({
      data: {
        userId,
        tier,
        role,
        status: "ACTIVE",
        stripeSessionId: sessionId,
        stripeSubscriptionId: session.subscription || null,
        expiresAt,
      },
    });

    await prisma.notification.create({
      data: {
        userId,
        title: `🎉 ${planName} Activated`,
        body: `Your ${planName} subscription is now active. Enjoy your new features!`,
        type: "SUBSCRIPTION_ACTIVATED",
        data: { tier, role, expiresAt: expiresAt.toISOString() },
      },
    });

    return sendResponse(res, {
      message: "Subscription activated",
      data: { subscription: sub },
    });
  } catch (err) {
    console.error("verifyCheckout error:", err.message);
    return sendError(res, `Verification failed: ${err.message}`, 500);
  }
};

// POST /api/subscriptions/cancel
export const cancelSubscription = async (req, res) => {
  try {
    const sub = await prisma.subscription.findFirst({
      where: { userId: req.user.id, status: "ACTIVE" },
    });
    if (!sub) return sendError(res, "No active subscription", 404);

    // Cancel in Stripe if recurring
    if (sub.stripeSubscriptionId) {
      await getStripe().subscriptions.cancel(sub.stripeSubscriptionId);
    }

    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "CANCELLED" },
    });

    return sendResponse(res, { message: "Subscription cancelled" });
  } catch (err) {
    return sendError(res, "Cancellation failed");
  }
};

// GET /api/subscriptions/invoice
export const getInvoice = async (req, res) => {
  try {
    const sub = await prisma.subscription.findFirst({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });
    if (!sub) return sendError(res, "No subscription found", 404);

    const plans = sub.role === "WORKER" ? WORKER_PLANS : HIRER_PLANS;
    const plan = plans[sub.tier];

    return sendResponse(res, {
      data: {
        invoice: {
          id: sub.id,
          tier: sub.tier,
          role: sub.role,
          planName: plan?.name,
          price: plan?.price,
          status: sub.status,
          createdAt: sub.createdAt,
          expiresAt: sub.expiresAt,
          stripeSessionId: sub.stripeSessionId,
        },
      },
    });
  } catch (err) {
    return sendError(res, "Failed to get invoice");
  }
};
