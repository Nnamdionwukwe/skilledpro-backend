import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

const PLANS = [
  {
    id: "basic",
    name: "Basic Protection",
    description: "Covers accidental property damage up to $5,000",
    price: 2500,
    currency: "NGN",
    coverageAmount: 500000,
    coverageCurrency: "NGN",
    features: [
      "Property damage up to ₦500,000",
      "Valid for single booking",
      "24-hour claims support",
      "Instant activation",
    ],
    popular: false,
  },
  {
    id: "standard",
    name: "Standard Cover",
    description: "Comprehensive cover for hirers — property + liability",
    price: 5000,
    currency: "NGN",
    coverageAmount: 2000000,
    coverageCurrency: "NGN",
    features: [
      "Property damage up to ₦2,000,000",
      "Third-party liability included",
      "Valid for single booking",
      "Priority claims handling",
      "Same-day payouts",
    ],
    popular: true,
  },
  {
    id: "premium",
    name: "Premium Shield",
    description: "Full coverage — property, liability, and worker injury",
    price: 10000,
    currency: "NGN",
    coverageAmount: 5000000,
    coverageCurrency: "NGN",
    features: [
      "Property damage up to ₦5,000,000",
      "Third-party liability",
      "Worker injury cover",
      "Legal expenses included",
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

// POST /api/insurance/purchase
export const purchaseInsurance = async (req, res) => {
  try {
    const { planId, bookingId } = req.body;

    if (!planId) return sendError(res, "Plan ID is required", 400);

    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) return sendError(res, "Invalid plan", 404);

    // If tied to a booking, verify ownership
    if (bookingId) {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
      });
      if (!booking) return sendError(res, "Booking not found", 404);
      if (booking.hirerId !== req.user.id)
        return sendError(res, "Not your booking", 403);
    }

    // Create notification record as insurance receipt
    const reference = `INS-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const notification = await prisma.notification.create({
      data: {
        userId: req.user.id,
        title: `Insurance Activated: ${plan.name} ✅`,
        body: `Your ${plan.name} is active. Coverage up to ${plan.coverageCurrency} ${plan.coverageAmount.toLocaleString()}. Reference: ${reference}`,
        type: "INSURANCE_PURCHASED",
        data: {
          planId: plan.id,
          planName: plan.name,
          bookingId: bookingId || null,
          reference,
          coverageAmount: plan.coverageAmount,
          coverageCurrency: plan.coverageCurrency,
          price: plan.price,
          currency: plan.currency,
          purchasedAt: new Date().toISOString(),
          status: "ACTIVE",
        },
      },
    });

    return sendResponse(res, {
      status: 201,
      message: "Insurance activated successfully",
      data: {
        reference,
        plan: plan.name,
        coverage: `${plan.coverageCurrency} ${plan.coverageAmount.toLocaleString()}`,
        purchasedAt: new Date(),
        notificationId: notification.id,
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to purchase insurance");
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
    return sendError(res, "Failed to fetch insurance policies");
  }
};
