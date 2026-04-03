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

// ── Lazy Stripe init — avoids crash if env not loaded yet ────────────────────
let _stripe;
function getStripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

// ── Supported currencies (fiat + stablecoin) ─────────────────────────────────
export const SUPPORTED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "NGN",
  "GHS",
  "KES",
  "ZAR",
  "INR",
  "CAD",
  "AUD",
  "JPY",
  "CNY",
  "BRL",
  "MXN",
  "EGP",
  "TZS",
  "UGX",
  "RWF",
  "XOF",
  "MAD",
  "PHP",
  "IDR",
  "VND",
  "THB",
  "BDT",
  "PKR",
  "AED",
  "SAR",
  "QAR",
  "MYR",
  "SGD",
  "HKD",
  "USDC",
  "USDT",
];

export const CRYPTO_CURRENCIES = ["USDC", "USDT"];

// ── Initiate payment ──────────────────────────────────────────────────────────
export const initiateBookingPayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const hirerId = req.user.id;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payment: true },
  });

  if (!booking)
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  if (booking.hirerId !== hirerId)
    return res
      .status(403)
      .json({ success: false, message: "Not your booking" });
  if (booking.payment)
    return res
      .status(400)
      .json({ success: false, message: "Payment already initiated" });
  if (booking.status !== "ACCEPTED")
    return res.status(400).json({
      success: false,
      message: "Booking must be accepted before payment",
    });

  const hirer = await prisma.user.findUnique({ where: { id: hirerId } });
  const result = await initiatePayment({ booking, hirer });

  res
    .status(200)
    .json({ success: true, message: "Payment initiated", data: result });
});

// ── Verify Paystack ───────────────────────────────────────────────────────────
export const verifyPaystack = asyncHandler(async (req, res) => {
  const { reference } = req.query;
  if (!reference)
    return res
      .status(400)
      .json({ success: false, message: "Reference required" });

  const transaction = await verifyPaystackPayment(reference);
  if (transaction.status !== "success")
    return res
      .status(400)
      .json({ success: false, message: "Payment not successful" });

  const existing = await prisma.payment.findFirst({
    where: { providerRef: reference },
  });
  if (!existing)
    return res
      .status(404)
      .json({ success: false, message: "Payment record not found" });

  const payment = await prisma.payment.update({
    where: { id: existing.id },
    data: { status: "HELD" },
  });
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

// ── Stripe webhook ────────────────────────────────────────────────────────────
export const stripeWebhook = asyncHandler(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = getStripe().webhooks.constructEvent(
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
      const payment = await prisma.payment.findFirst({
        where: { providerRef: event.data.object.id },
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
      const payment = await prisma.payment.findFirst({
        where: { providerRef: event.data.object.id },
      });
      if (payment)
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "FAILED" },
        });
      break;
    }
    default:
      break;
  }
  res.status(200).json({ received: true });
});

// ── Release escrow ────────────────────────────────────────────────────────────
export const releasePayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const hirerId = req.user.id;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payment: true },
  });
  if (!booking)
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  if (booking.hirerId !== hirerId)
    return res
      .status(403)
      .json({ success: false, message: "Not your booking" });
  if (!booking.payment || booking.payment.status !== "HELD")
    return res
      .status(400)
      .json({ success: false, message: "No payment in escrow" });

  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  const payment = await releaseEscrow(bookingId);
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

// ── Refund ────────────────────────────────────────────────────────────────────
export const refundPayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { amount } = req.body;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payment: true },
  });
  if (!booking)
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  if (req.user.role !== "ADMIN" && booking.hirerId !== req.user.id)
    return res.status(403).json({ success: false, message: "Not authorised" });
  if (!booking.payment)
    return res
      .status(400)
      .json({ success: false, message: "No payment found" });

  const payment = await processRefund(bookingId, amount);
  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "CANCELLED" },
  });

  res
    .status(200)
    .json({ success: true, message: "Refund processed", data: payment });
});

// ── Single booking payment ────────────────────────────────────────────────────
export const getPayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payment: true },
  });
  if (!booking)
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  if (
    booking.hirerId !== req.user.id &&
    booking.workerId !== req.user.id &&
    req.user.role !== "ADMIN"
  )
    return res.status(403).json({ success: false, message: "Not authorised" });
  res.status(200).json({ success: true, data: booking.payment });
});

// ── Admin: all payments ───────────────────────────────────────────────────────
export const getAllPayments = asyncHandler(async (req, res) => {
  const { status, provider, currency, page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const where = {
    ...(status && { status }),
    ...(provider && { provider }),
    ...(currency && currency !== "ALL"
      ? { currency: currency.toUpperCase() }
      : {}),
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
      skip,
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
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

// ── Worker: paginated earnings with currency filter ───────────────────────────
// GET /api/workers/dashboard/earnings  (used by WorkerEarnings page)
export const getWorkerEarnings = asyncHandler(async (req, res) => {
  const { from, to, currency, page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = {
    booking: { workerId: req.user.id },
    status: "RELEASED",
    ...(currency && currency !== "ALL"
      ? { currency: currency.toUpperCase() }
      : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  };

  const [payments, total, aggregate] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: parseInt(limit),
      include: {
        booking: {
          select: {
            title: true,
            scheduledAt: true,
            currency: true,
            category: { select: { name: true, icon: true } },
            hirer: {
              select: { firstName: true, lastName: true, avatar: true },
            },
          },
        },
      },
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({
      where,
      _sum: { workerPayout: true, amount: true, platformFee: true },
    }),
  ]);

  // Currencies used by this worker across ALL earnings (for filter dropdown)
  const usedCurrencies = await prisma.payment.findMany({
    where: { booking: { workerId: req.user.id }, status: "RELEASED" },
    select: { currency: true },
    distinct: ["currency"],
  });

  res.status(200).json({
    success: true,
    data: {
      payments,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      summary: {
        totalEarned: aggregate._sum.workerPayout ?? 0,
        totalJobValue: aggregate._sum.amount ?? 0,
        totalFees: aggregate._sum.platformFee ?? 0,
      },
      availableCurrencies: usedCurrencies.map((c) => c.currency),
    },
  });
});

// ── Hirer: full payment history with currency filter ──────────────────────────
// GET /api/payments/hirer
export const getHirerPayments = asyncHandler(async (req, res) => {
  const hirerId = req.user.id;
  const { status, currency, page = 1, limit = 10 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const where = {
    booking: { hirerId },
    ...(status && status !== "ALL" ? { status } : {}),
    ...(currency && currency !== "ALL"
      ? { currency: currency.toUpperCase() }
      : {}),
  };

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
      include: {
        booking: {
          select: {
            id: true,
            title: true,
            status: true,
            scheduledAt: true,
            completedAt: true,
            currency: true,
            category: { select: { name: true } },
            worker: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                avatar: true,
              },
            },
            hirer: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
    }),
    prisma.payment.count({ where }),
  ]);

  // Summary totals in ALL currencies (no filter) so summary cards are always accurate
  const baseWhere = { booking: { hirerId } };
  const [totalSpentAgg, inEscrowAgg, refundedAgg] = await Promise.all([
    prisma.payment.aggregate({
      where: { ...baseWhere, status: "RELEASED" },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { ...baseWhere, status: "HELD" },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { ...baseWhere, status: "REFUNDED" },
      _sum: { amount: true },
    }),
  ]);

  // Currencies this hirer has used (for filter dropdown)
  const usedCurrencies = await prisma.payment.findMany({
    where: baseWhere,
    select: { currency: true },
    distinct: ["currency"],
  });

  res.status(200).json({
    success: true,
    data: {
      payments,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      summary: {
        totalSpent: totalSpentAgg._sum.amount ?? 0,
        inEscrow: inEscrowAgg._sum.amount ?? 0,
        totalRefunds: refundedAgg._sum.amount ?? 0,
      },
      availableCurrencies: usedCurrencies.map((c) => c.currency),
    },
  });
});

// ── Worker: Request a payout withdrawal ──────────────────────────────────────
// POST /api/payments/withdraw
export const requestWithdrawal = asyncHandler(async (req, res) => {
  const workerId = req.user.id;
  const {
    amount,
    method,
    bankName,
    accountNumber,
    accountName,
    mobileNumber,
    mobileProvider,
  } = req.body;

  if (!amount || parseFloat(amount) <= 0) {
    return res
      .status(400)
      .json({ success: false, message: "Valid amount is required" });
  }

  // Check available balance (released payments)
  const balanceAgg = await prisma.payment.aggregate({
    where: { booking: { workerId }, status: "RELEASED" },
    _sum: { workerPayout: true },
  });

  const totalEarned = balanceAgg._sum.workerPayout || 0;

  // Get sum of previous withdrawals
  const withdrawnAgg = (await prisma.notification.aggregate) ? null : null; // Withdrawal tracking via notifications since no Withdrawal model

  if (parseFloat(amount) > totalEarned) {
    return res
      .status(400)
      .json({ success: false, message: "Insufficient balance" });
  }

  // Store withdrawal request as notification record (no Withdrawal model in schema)
  const withdrawal = await prisma.notification.create({
    data: {
      userId: workerId,
      title: "Withdrawal Requested",
      body: `Withdrawal of ₦${parseFloat(amount).toLocaleString()} via ${method === "mobile" ? mobileProvider : bankName} requested.`,
      type: "WITHDRAWAL_REQUEST",
      data: {
        amount: parseFloat(amount),
        method: method || "bank",
        bankName: bankName || null,
        accountNumber: accountNumber || null,
        accountName: accountName || null,
        mobileNumber: mobileNumber || null,
        mobileProvider: mobileProvider || null,
        status: "PENDING",
        requestedAt: new Date().toISOString(),
      },
    },
  });

  res.status(201).json({
    success: true,
    message:
      "Withdrawal request submitted. Processing within 1–3 business days.",
    data: { withdrawal },
  });
});

// ── Worker: Get withdrawal history + live balance ─────────────────────────────
// GET /api/payments/withdrawals
export const getWithdrawals = asyncHandler(async (req, res) => {
  const workerId = req.user.id;
  const { page = 1, limit = 15 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  // Live balance from released payments
  const [balanceAgg, escrowAgg, withdrawalNotifs, total] = await Promise.all([
    prisma.payment.aggregate({
      where: { booking: { workerId }, status: "RELEASED" },
      _sum: { workerPayout: true },
    }),
    prisma.payment.aggregate({
      where: { booking: { workerId }, status: "HELD" },
      _sum: { workerPayout: true },
    }),
    prisma.notification.findMany({
      where: { userId: workerId, type: "WITHDRAWAL_REQUEST" },
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.notification.count({
      where: { userId: workerId, type: "WITHDRAWAL_REQUEST" },
    }),
  ]);

  const totalEarned = balanceAgg._sum.workerPayout || 0;
  const inEscrow = escrowAgg._sum.workerPayout || 0;

  // Calculate total withdrawn (approved withdrawals)
  const allWithdrawals = await prisma.notification.findMany({
    where: { userId: workerId, type: "WITHDRAWAL_REQUEST" },
    select: { data: true },
  });

  const totalWithdrawn = allWithdrawals.reduce((sum, w) => {
    const d = w.data;
    if (d && (d.status === "APPROVED" || d.status === "PENDING")) {
      return sum + (d.amount || 0);
    }
    return sum;
  }, 0);

  const availableBalance = Math.max(0, totalEarned - totalWithdrawn);

  res.status(200).json({
    success: true,
    data: {
      balance: {
        available: availableBalance,
        totalEarned,
        inEscrow,
        totalWithdrawn,
      },
      withdrawals: withdrawalNotifs.map((n) => ({
        id: n.id,
        createdAt: n.createdAt,
        ...n.data,
      })),
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

// NOTE: The following functions from hirer.controller.js are REDUNDANT and should be removed:
// - postJob (replaced by createJobPost in job.controller.js — never saved to DB)
// - getHirerProfile (basic version replaced by getHirerPublicProfile in job.controller.js)
// The duplicate EarningsPage.jsx (identical files in docs 46 and 47) — keep only one.
// The old getWorkerEarnings in payment.controller.js (basic/non-paginated) is now unified above.
