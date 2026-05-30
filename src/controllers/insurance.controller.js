import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { uniqueRef } from "../utils/helpers.js";

const FLW_SECRET = process.env.FLUTTERWAVE_SECRET_KEY;
const FLW_BASE = "https://api.flutterwave.com/v3";
const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:5173";

async function flw(method, path, body = null) {
  const res = await fetch(`${FLW_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${FLW_SECRET}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
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

// ── Replace these two functions in src/controllers/insurance.controller.js ──
// Remove the Stripe import and getStripe() entirely from the file.
// Add this import at the top instead:
//   import { FEE_CONFIG } from "../config/fees.js";
//   import { uniqueRef } from "../utils/helpers.js";

// POST /api/insurance/checkout
export const createInsuranceCheckout = async (req, res) => {
  try {
    const { planId, bookingId, callbackUrl } = req.body;
    if (!planId) return sendError(res, "Plan ID is required", 400);

    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) return sendError(res, "Invalid plan", 404);

    // if (bookingId) {
    //   const booking = await prisma.booking.findUnique({
    //     where: { id: bookingId },
    //   });
    //   if (!booking) return sendError(res, "Booking not found", 404);
    //   if (booking.hirerId !== req.user.id)
    //     return sendError(res, "Not your booking", 403);
    // }

    if (bookingId) {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { hirerId: true, currency: true }, // ← get both at once
      });
      if (!booking) return sendError(res, "Booking not found", 404);
      if (booking.hirerId !== req.user.id)
        return sendError(res, "Not your booking", 403);
      currency = booking.currency ?? "NGN";
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    // ── Determine currency — use booking currency if tied to a booking,
    //    otherwise default to NGN (Paystack) or USD (Flutterwave) ──────────
    let currency = "NGN";
    if (bookingId) {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { currency: true },
      });
      currency = booking?.currency ?? "NGN";
    }

    // ── Convert plan price to local currency if needed ────────────────────
    // Plans are priced in USD; for NGN use a rough rate or store NGN prices
    // For simplicity we charge in USD via Flutterwave which handles FX.
    // Switch currency to "USD" so FLW handles conversion — or add NGN prices
    // to PLANS if you want native NGN pricing.
    const chargeCurrency = currency === "NGN" ? "USD" : currency;
    const amount = plan.price; // already in USD

    const txRef = uniqueRef("INS");

    const redirectUrl =
      callbackUrl ??
      `${CLIENT_URL}/insurance/success?tx_ref=${txRef}&plan=${planId}&booking=${bookingId ?? ""}`;

    const flwRes = await flw("POST", "/payments", {
      tx_ref: txRef,
      amount,
      currency: chargeCurrency,
      redirect_url: redirectUrl,
      customer: {
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
      },
      customizations: {
        title: `${plan.name} — SkilledProz Insurance`,
        description: plan.description,
        logo: `${CLIENT_URL}/logo.png`,
      },
      meta: {
        plan_id: planId,
        plan_name: plan.name,
        booking_id: bookingId ?? "",
        user_id: req.user.id,
      },
    });

    if (flwRes.status !== "success") {
      console.error("Flutterwave insurance error:", flwRes.message);
      return sendError(res, flwRes.message ?? "Failed to create checkout", 502);
    }

    return sendResponse(res, {
      data: {
        url: flwRes.data.link,
        reference: txRef,
        provider: "flutterwave",
      },
    });
  } catch (err) {
    console.error("Insurance checkout error:", err.message);
    return sendError(res, "Failed to create insurance checkout");
  }
};

// POST /api/insurance/verify
// Body: { reference }   ← tx_ref from Flutterwave redirect query param
export const verifyInsuranceCheckout = async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) return sendError(res, "Reference required", 400);

    // ── Verify transaction via Flutterwave ────────────────────────────────
    const result = await flw("GET", `/transactions?tx_ref=${reference}`);

    if (result.status !== "success" || !result.data?.length) {
      return sendError(res, "Transaction not found", 404);
    }

    const tx = result.data[0];

    if (tx.status !== "successful") {
      return sendError(
        res,
        `Payment not successful — status: ${tx.status}`,
        400,
      );
    }

    // ── Extract metadata ──────────────────────────────────────────────────
    const planId = tx.meta?.plan_id ?? "";
    const planName = tx.meta?.plan_name ?? "";
    const bookingId = tx.meta?.booking_id ?? "";
    const userId = tx.meta?.user_id ?? req.user.id;

    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) return sendError(res, "Plan not found", 404);

    const ref = `INS-${reference.slice(-8).toUpperCase()}`;

    // ── If tied to a booking, stamp it ───────────────────────────────────
    if (bookingId) {
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          insuranceRef: ref,
          insurancePlan: planName || plan.name,
          insurancePaidAt: new Date(),
        },
      });
    }

    // ── Create notification receipt ───────────────────────────────────────
    await prisma.notification.create({
      data: {
        userId,
        title: `🛡️ Insurance Activated: ${plan.name}`,
        body: `Your ${plan.name} is now active. Coverage up to ${plan.coverageCurrency} ${plan.coverageAmount?.toLocaleString()}. Ref: ${ref}`,
        type: "INSURANCE_PURCHASED",
        data: {
          planId,
          planName: plan.name,
          bookingId: bookingId || null,
          reference: ref,
          coverageAmount: plan.coverageAmount,
          coverageCurrency: plan.coverageCurrency,
          price: plan.price,
          currency: tx.currency,
          flwTransactionId: tx.id,
          purchasedAt: new Date().toISOString(),
          status: "ACTIVE",
        },
      },
    });

    return sendResponse(res, {
      message: "Insurance activated",
      data: {
        reference,
        plan: plan.name,
        coverage: `${plan.coverageCurrency} ${plan.coverageAmount?.toLocaleString()}`,
        purchasedAt: new Date(),
        bookingId: bookingId || null,
        txRef: reference,
      },
    });
  } catch (err) {
    console.error("Insurance verify error:", err.message);
    return sendError(res, "Failed to verify insurance payment");
  }
};

// GET /api/insurance/plans
export const getInsurancePlans = async (req, res) => {
  return sendResponse(res, { data: { plans: PLANS } });
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
