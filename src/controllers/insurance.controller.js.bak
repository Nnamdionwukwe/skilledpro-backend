import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import Stripe from "stripe";

let _stripe;
function getStripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

export const PLANS = [
  {
    id: "basic",
    name: "Basic Protection",
    description: "Property damage cover up to $5,000",
    price: 5,
    currency: "USD",
    coverageAmount: 5000,
    coverageCurrency: "USD",
    features: [
      "Property damage up to $5,000",
      "Valid for single booking",
      "24-hour claims support",
      "Instant activation",
    ],
    popular: false,
  },
  {
    id: "standard",
    name: "Standard Cover",
    description: "Property + liability — most popular",
    price: 12,
    currency: "USD",
    coverageAmount: 15000,
    coverageCurrency: "USD",
    features: [
      "Property damage up to $15,000",
      "Third-party liability included",
      "Priority claims handling",
      "Same-day payouts",
    ],
    popular: true,
  },
  {
    id: "premium",
    name: "Premium Shield",
    description: "Full coverage including worker injury",
    price: 25,
    currency: "USD",
    coverageAmount: 30000,
    coverageCurrency: "USD",
    features: [
      "Property damage up to $30,000",
      "Third-party liability",
      "Worker injury cover",
      "Legal expenses",
      "Dedicated claims agent",
      "Valid for 30 days",
    ],
    popular: false,
  },
];

// GET /api/insurance/plans
export const getInsurancePlans = async (req, res) => {
  return sendResponse(res, { data: { plans: PLANS } });
};

// POST /api/insurance/checkout — create Stripe checkout session
export const createInsuranceCheckout = async (req, res) => {
  try {
    const { planId, bookingId } = req.body;
    if (!planId) return sendError(res, "Plan ID is required", 400);

    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) return sendError(res, "Invalid plan", 404);

    if (bookingId) {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
      });
      if (!booking) return sendError(res, "Booking not found", 404);
      if (booking.hirerId !== req.user.id)
        return sendError(res, "Not your booking", 403);
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(plan.price * 100),
            product_data: {
              name: `${plan.name} — SkilledProz Insurance`,
              description: plan.description,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.CLIENT_URL}/insurance/success?session_id={CHECKOUT_SESSION_ID}&plan=${planId}&booking=${bookingId || ""}`,
      cancel_url: `${process.env.CLIENT_URL}/bookings/${bookingId || ""}`,
      metadata: {
        userId: req.user.id,
        planId,
        planName: plan.name,
        bookingId: bookingId || "",
      },
    });

    return sendResponse(res, {
      data: { url: session.url, sessionId: session.id },
    });
  } catch (err) {
    console.error("Insurance checkout error:", err.message);
    return sendError(res, "Failed to create insurance checkout");
  }
};

// POST /api/insurance/verify — verify after Stripe redirect
export const verifyInsuranceCheckout = async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return sendError(res, "Session ID required", 400);

    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return sendError(res, "Payment not completed", 400);
    }

    const { userId, planId, planName, bookingId } = session.metadata;
    const plan = PLANS.find((p) => p.id === planId);
    const reference = `INS-${sessionId.slice(-8).toUpperCase()}`;

    // If tied to a booking, update with insurance badge
    if (bookingId) {
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          insuranceRef: reference,
          insurancePlan: planName,
          insurancePaidAt: new Date(),
        },
      });
    }

    // Create notification receipt
    await prisma.notification.create({
      data: {
        userId,
        title: `🛡️ Insurance Activated: ${planName}`,
        body: `Your ${planName} is now active. Coverage up to ${plan?.coverageCurrency} ${plan?.coverageAmount?.toLocaleString()}. Ref: ${reference}`,
        type: "INSURANCE_PURCHASED",
        data: {
          planId,
          planName,
          bookingId: bookingId || null,
          reference,
          coverageAmount: plan?.coverageAmount,
          coverageCurrency: plan?.coverageCurrency,
          price: plan?.price,
          currency: "USD",
          sessionId,
          purchasedAt: new Date().toISOString(),
          status: "ACTIVE",
        },
      },
    });

    return sendResponse(res, {
      message: "Insurance activated",
      data: {
        reference,
        plan: planName,
        coverage: `${plan?.coverageCurrency} ${plan?.coverageAmount?.toLocaleString()}`,
        purchasedAt: new Date(),
        bookingId: bookingId || null,
        sessionId,
      },
    });
  } catch (err) {
    console.error("Insurance verify error:", err.message);
    return sendError(res, "Failed to verify insurance payment");
  }
};

// GET /api/insurance/my
export const getMyInsurance = async (req, res) => {
  try {
    const policies = await prisma.notification.findMany({
      where: { userId: req.user.id, type: "INSURANCE_PURCHASED" },
      orderBy: { createdAt: "desc" },
    });
    return sendResponse(res, {
      data: {
        policies: policies.map((p) => ({
          id: p.id,
          ...p.data,
          purchasedAt: p.createdAt,
        })),
        total: policies.length,
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch insurance");
  }
};
