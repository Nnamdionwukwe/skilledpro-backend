// src/services/payment.service.js
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  NOTICE: This file is a legacy service from an earlier implementation.
//
// The active payment logic lives in src/controllers/payment.controller.js
// which uses Paystack + Flutterwave via native fetch() and does NOT use Stripe.
//
// This file has been cleaned up to:
//   ✓ Remove @stripe/react-stripe-js and @stripe/stripe-js (browser packages)
//   ✓ Retain only the functions that are genuinely useful as shared helpers
//   ✓ Remove the duplicate Paystack implementation that conflicts with the controller
//
// If you intend to add Stripe for international card payments (USD/EUR/GBP):
//   1. Keep the `stripe` server SDK (already in package.json as stripe ^20.4.1)
//   2. Remove @stripe/react-stripe-js and @stripe/stripe-js from package.json
//      (those are browser-only packages — wrong in a Node.js backend)
//   3. Implement Stripe in payment.controller.js alongside Paystack/Flutterwave
//
// To remove unused packages:
//   npm uninstall @stripe/react-stripe-js @stripe/stripe-js
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../config/database.js";

// ─── Fee calculation helper ───────────────────────────────────────────────────
// Kept here as a shared utility — also used in payment.controller.js via fees.js
const PLATFORM_FEE_PERCENT = 0.1; // 10%

export function calcFees(amount) {
  const platformFee = parseFloat((amount * PLATFORM_FEE_PERCENT).toFixed(2));
  const workerPayout = parseFloat((amount - platformFee).toFixed(2));
  return { platformFee, workerPayout };
}

// ─── Provider routing helper ──────────────────────────────────────────────────
// African currencies route to Paystack; others to Flutterwave (or Stripe if implemented)
const PAYSTACK_CURRENCIES = new Set(["NGN", "GHS", "ZAR", "KES", "TZS", "UGX"]);

export function getPaymentProvider(currency) {
  const c = (currency ?? "").toUpperCase();
  if (PAYSTACK_CURRENCIES.has(c)) return "paystack";
  return "flutterwave"; // default for international FX
}

// ─── Payment status helpers ───────────────────────────────────────────────────
export async function getPaymentByBooking(bookingId) {
  return prisma.payment.findFirst({
    where: { bookingId },
    include: {
      booking: {
        select: {
          title: true,
          status: true,
          workerId: true,
          hirerId: true,
        },
      },
    },
  });
}

export async function markPaymentHeld(paymentId) {
  return prisma.payment.update({
    where: { id: paymentId },
    data: { status: "HELD" },
  });
}

export async function markPaymentReleased(paymentId) {
  return prisma.payment.update({
    where: { id: paymentId },
    data: { status: "RELEASED", escrowReleasedAt: new Date() },
  });
}

export async function markPaymentRefunded(paymentId) {
  return prisma.payment.update({
    where: { id: paymentId },
    data: { status: "REFUNDED", refundedAt: new Date() },
  });
}

// ─── Worker balance helper ────────────────────────────────────────────────────
export async function getWorkerAvailableBalance(workerId) {
  const [earnedAgg, pendingAgg] = await Promise.all([
    prisma.payment.aggregate({
      where: { booking: { workerId }, status: "RELEASED" },
      _sum: { workerPayout: true },
    }),
    prisma.withdrawal.aggregate({
      where: { workerId, status: { in: ["PENDING", "PROCESSING"] } },
      _sum: { amount: true },
    }),
  ]);
  const totalEarned = earnedAgg._sum.workerPayout ?? 0;
  const pendingPayout = pendingAgg._sum.amount ?? 0;
  return Math.max(0, totalEarned - pendingPayout);
}
