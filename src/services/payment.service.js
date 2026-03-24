// src/services/payment.service.js
import Stripe from "stripe";
import axios from "axios";
import prisma from "../config/database.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const PAYSTACK_BASE = "https://api.paystack.co";
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PLATFORM_FEE_PERCENT = 0.15; // 15% platform commission

// ── Helpers ──────────────────────────────────────────────────────────────────

function calcFees(amount) {
  const platformFee = parseFloat((amount * PLATFORM_FEE_PERCENT).toFixed(2));
  const workerPayout = parseFloat((amount - platformFee).toFixed(2));
  return { platformFee, workerPayout };
}

// African currencies that route to Paystack
const PAYSTACK_CURRENCIES = ["NGN", "GHS", "ZAR", "KES", "USD"];

function getProvider(currency) {
  return PAYSTACK_CURRENCIES.includes(currency.toUpperCase())
    ? "paystack"
    : "stripe";
}

// ── Stripe ───────────────────────────────────────────────────────────────────

export async function createStripePaymentIntent({
  amount,
  currency,
  bookingId,
  hirerId,
}) {
  const { platformFee, workerPayout } = calcFees(amount);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // Stripe uses smallest currency unit
    currency: currency.toLowerCase(),
    metadata: { bookingId, hirerId, platformFee, workerPayout },
    capture_method: "manual", // Authorise now, capture on job completion (escrow)
    description: `SkilledPro booking ${bookingId}`,
  });

  // Store payment record in DB
  await prisma.payment.create({
    data: {
      bookingId,
      userId: hirerId,
      amount,
      currency,
      platformFee,
      workerPayout,
      status: "PENDING",
      provider: "stripe",
      providerRef: paymentIntent.id,
    },
  });

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    platformFee,
    workerPayout,
  };
}

export async function captureStripePayment(paymentIntentId) {
  // Called when job is marked complete — releases funds from escrow
  const captured = await stripe.paymentIntents.capture(paymentIntentId);
  return captured;
}

export async function refundStripePayment(paymentIntentId, amount) {
  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    ...(amount && { amount: Math.round(amount * 100) }),
  });
  return refund;
}

// ── Paystack ─────────────────────────────────────────────────────────────────

export async function initializePaystackPayment({
  amount,
  currency,
  email,
  bookingId,
  hirerId,
}) {
  const { platformFee, workerPayout } = calcFees(amount);

  // Paystack uses kobo for NGN (multiply by 100)
  const amountInSmallestUnit = Math.round(amount * 100);

  const response = await axios.post(
    `${PAYSTACK_BASE}/transaction/initialize`,
    {
      email,
      amount: amountInSmallestUnit,
      currency: currency.toUpperCase(),
      reference: `SPR-${bookingId}-${Date.now()}`,
      metadata: {
        bookingId,
        hirerId,
        platformFee,
        workerPayout,
        custom_fields: [
          {
            display_name: "Booking ID",
            variable_name: "booking_id",
            value: bookingId,
          },
        ],
      },
      callback_url: `${process.env.CLIENT_URL}/payment/verify`,
    },
    {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
    },
  );

  const { data } = response.data;

  // Store payment record in DB
  await prisma.payment.create({
    data: {
      bookingId,
      userId: hirerId,
      amount,
      currency,
      platformFee,
      workerPayout,
      status: "PENDING",
      provider: "paystack",
      providerRef: data.reference,
    },
  });

  return {
    authorizationUrl: data.authorization_url,
    reference: data.reference,
    platformFee,
    workerPayout,
  };
}

export async function verifyPaystackPayment(reference) {
  const response = await axios.get(
    `${PAYSTACK_BASE}/transaction/verify/${reference}`,
    {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    },
  );

  return response.data.data;
}

export async function refundPaystackPayment({ reference, amount, currency }) {
  const response = await axios.post(
    `${PAYSTACK_BASE}/refund`,
    {
      transaction: reference,
      ...(amount && { amount: Math.round(amount * 100) }),
      currency: currency.toUpperCase(),
    },
    {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
    },
  );
  return response.data.data;
}

// ── Unified payment initiator ─────────────────────────────────────────────────

export async function initiatePayment({ booking, hirer }) {
  const { id: bookingId, agreedRate: amount, currency } = booking;
  const provider = getProvider(currency);

  if (provider === "paystack") {
    return initializePaystackPayment({
      amount,
      currency,
      email: hirer.email,
      bookingId,
      hirerId: hirer.id,
    });
  }

  return createStripePaymentIntent({
    amount,
    currency,
    bookingId,
    hirerId: hirer.id,
  });
}

// ── Escrow release (job completed) ───────────────────────────────────────────

export async function releaseEscrow(bookingId) {
  const payment = await prisma.payment.findUnique({
    where: { bookingId },
  });

  if (!payment) throw new Error("Payment record not found");
  if (payment.status === "RELEASED")
    throw new Error("Payment already released");

  if (payment.provider === "stripe") {
    await captureStripePayment(payment.providerRef);
  }
  // For Paystack: funds are held on our end — trigger worker payout separately
  // In a real system you'd use Paystack Transfer API here

  const updated = await prisma.payment.update({
    where: { bookingId },
    data: {
      status: "RELEASED",
      escrowReleasedAt: new Date(),
    },
  });

  // Update worker total earnings
  await prisma.workerProfile.update({
    where: {
      userId: (await prisma.booking.findUnique({ where: { id: bookingId } }))
        .workerId,
    },
    data: { totalEarnings: { increment: payment.workerPayout } },
  });

  return updated;
}

// ── Refund (dispute / cancellation) ──────────────────────────────────────────

export async function processRefund(bookingId, amount) {
  const payment = await prisma.payment.findUnique({
    where: { bookingId },
  });

  if (!payment) throw new Error("Payment record not found");
  if (payment.status === "REFUNDED") throw new Error("Already refunded");

  if (payment.provider === "stripe") {
    await refundStripePayment(payment.providerRef, amount);
  } else {
    await refundPaystackPayment({
      reference: payment.providerRef,
      amount,
      currency: payment.currency,
    });
  }

  const updated = await prisma.payment.update({
    where: { bookingId },
    data: {
      status: "REFUNDED",
      refundedAt: new Date(),
    },
  });

  return updated;
}
