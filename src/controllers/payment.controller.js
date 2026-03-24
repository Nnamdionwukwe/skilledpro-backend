// src/controllers/payment.controller.js
import prisma from "../config/database.js";
import { asyncHandler } from "../middleware/error.middleware.js";
import {
  initiatePayment,
  verifyPaystackPayment,
  releaseEscrow,
  processRefund,
} from "../services/payment.service.js";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ── Initiate payment for a booking ───────────────────────────────────────────
// POST /api/payments/initiate/:bookingId
export const initiateBookingPayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const hirerId = req.user.id;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payment: true },
  });

  if (!booking) {
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  }

  if (booking.hirerId !== hirerId) {
    return res
      .status(403)
      .json({ success: false, message: "Not your booking" });
  }

  if (booking.payment) {
    return res
      .status(400)
      .json({ success: false, message: "Payment already initiated" });
  }

  if (booking.status !== "ACCEPTED") {
    return res.status(400).json({
      success: false,
      message: "Booking must be accepted before payment",
    });
  }

  const hirer = await prisma.user.findUnique({ where: { id: hirerId } });

  const result = await initiatePayment({ booking, hirer });

  res.status(200).json({
    success: true,
    message: "Payment initiated",
    data: result,
  });
});

// ── Verify Paystack payment (redirect callback) ───────────────────────────────
// GET /api/payments/verify/paystack?reference=xxx
export const verifyPaystack = asyncHandler(async (req, res) => {
  const { reference } = req.query;

  if (!reference) {
    return res
      .status(400)
      .json({ success: false, message: "Reference required" });
  }

  const transaction = await verifyPaystackPayment(reference);

  if (transaction.status !== "success") {
    return res
      .status(400)
      .json({ success: false, message: "Payment not successful" });
  }

  // Update payment status to HELD (in escrow)
  const payment = await prisma.payment.update({
    where: { providerRef: reference },
    data: { status: "HELD" },
  });

  // Update booking status
  await prisma.booking.update({
    where: { id: payment.bookingId },
    data: { status: "IN_PROGRESS" },
  });

  res.status(200).json({
    success: true,
    message: "Payment verified and held in escrow",
    data: { bookingId: payment.bookingId, status: "HELD" },
  });
});

// ── Stripe webhook (payment confirmation) ─────────────────────────────────────
// POST /api/payments/webhook/stripe
export const stripeWebhook = asyncHandler(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody || req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    return res
      .status(400)
      .json({ success: false, message: `Webhook error: ${err.message}` });
  }

  switch (event.type) {
    case "payment_intent.amount_capturable_updated": {
      // Payment authorised — move to HELD (escrow)
      const pi = event.data.object;
      const payment = await prisma.payment.findFirst({
        where: { providerRef: pi.id },
      });

      if (payment) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "HELD" },
        });

        await prisma.booking.update({
          where: { id: payment.bookingId },
          data: { status: "IN_PROGRESS" },
        });
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const pi = event.data.object;
      const payment = await prisma.payment.findFirst({
        where: { providerRef: pi.id },
      });
      if (payment) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "FAILED" },
        });
      }
      break;
    }

    default:
      break;
  }

  res.status(200).json({ received: true });
});

// ── Release escrow (hirer confirms job complete) ──────────────────────────────
// POST /api/payments/release/:bookingId
export const releasePayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const hirerId = req.user.id;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payment: true },
  });

  if (!booking) {
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  }

  if (booking.hirerId !== hirerId) {
    return res
      .status(403)
      .json({ success: false, message: "Not your booking" });
  }

  if (!booking.payment || booking.payment.status !== "HELD") {
    return res.status(400).json({
      success: false,
      message: "No payment in escrow for this booking",
    });
  }

  // Mark booking complete
  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  // Release escrow
  const payment = await releaseEscrow(bookingId);

  // Increment worker's completed jobs
  await prisma.workerProfile.update({
    where: { userId: booking.workerId },
    data: { completedJobs: { increment: 1 } },
  });

  res.status(200).json({
    success: true,
    message: "Payment released to worker",
    data: payment,
  });
});

// ── Refund payment (dispute / cancellation) ───────────────────────────────────
// POST /api/payments/refund/:bookingId
export const refundPayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { amount } = req.body; // optional partial refund amount

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payment: true },
  });

  if (!booking) {
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  }

  // Only admin or the hirer can issue a refund
  if (req.user.role !== "ADMIN" && booking.hirerId !== req.user.id) {
    return res.status(403).json({ success: false, message: "Not authorised" });
  }

  if (!booking.payment) {
    return res
      .status(400)
      .json({ success: false, message: "No payment found" });
  }

  const payment = await processRefund(bookingId, amount);

  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "CANCELLED" },
  });

  res.status(200).json({
    success: true,
    message: "Refund processed",
    data: payment,
  });
});

// ── Get payment details for a booking ────────────────────────────────────────
// GET /api/payments/:bookingId
export const getPayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user.id;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payment: true },
  });

  if (!booking) {
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  }

  // Only hirer, worker, or admin can view
  if (
    booking.hirerId !== userId &&
    booking.workerId !== userId &&
    req.user.role !== "ADMIN"
  ) {
    return res.status(403).json({ success: false, message: "Not authorised" });
  }

  res.status(200).json({
    success: true,
    data: booking.payment,
  });
});

// ── Get all payments (admin) ──────────────────────────────────────────────────
// GET /api/payments
export const getAllPayments = asyncHandler(async (req, res) => {
  const { status, provider, page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const where = {
    ...(status && { status }),
    ...(provider && { provider }),
  };

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        booking: {
          include: {
            hirer: { select: { firstName: true, lastName: true, email: true } },
            worker: {
              select: { firstName: true, lastName: true, email: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: Number(skip),
      take: Number(limit),
    }),
    prisma.payment.count({ where }),
  ]);

  res.status(200).json({
    success: true,
    data: payments,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / limit),
    },
  });
});

// ── Worker earnings summary ───────────────────────────────────────────────────
// GET /api/payments/earnings
export const getWorkerEarnings = asyncHandler(async (req, res) => {
  const workerId = req.user.id;

  const payments = await prisma.payment.findMany({
    where: {
      booking: { workerId },
      status: { in: ["HELD", "RELEASED"] },
    },
    include: {
      booking: {
        select: { title: true, scheduledAt: true, completedAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalEarned = payments
    .filter((p) => p.status === "RELEASED")
    .reduce((sum, p) => sum + p.workerPayout, 0);

  const pendingEscrow = payments
    .filter((p) => p.status === "HELD")
    .reduce((sum, p) => sum + p.workerPayout, 0);

  res.status(200).json({
    success: true,
    data: {
      totalEarned,
      pendingEscrow,
      payments,
    },
  });
});
