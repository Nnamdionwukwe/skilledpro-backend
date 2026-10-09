// src/utils/pricing.js  (backend)
// Shared pricing utility — mirror of the frontend's src/utils/pricing.js
// so Paystack, Flutterwave, bank-transfer, and crypto paths all agree
// with what the UI shows.

import prisma from "../config/database.js";

export const HIRER_FEE_RATE = 0.05;

export function calcPricing(booking, referralDiscount = 0) {
  const agreedRate = Number(booking?.agreedRate) || 0;
  const unit = booking?.estimatedUnit || "hours";
  const hours = booking?.estimatedHours;
  const value = booking?.estimatedValue
    ? parseFloat(booking.estimatedValue)
    : null;
  const currency = booking?.currency || "USD";
  const isNegotiated = !!(booking?.isNegotiated && booking?.negotiatedRate);
  const quantity = booking?.quantity || 1;

  // ── Job-post bookings ────────────────────────────────────────────────
  // When a booking is created from a job post (source === "JOB_POST"),
  // the agreedRate IS the final amount the hirer picked (either a
  // selected price option or a negotiated override). We do NOT multiply
  // by duration — the amount is already the total.
  const isJobPostBooking = booking?.source === "JOB_POST";

  let qty = 1;
  let subtotal = 0;
  let hasQty = false;

  if (isJobPostBooking) {
    subtotal = parseFloat(agreedRate.toFixed(2));
    if (unit === "custom" && quantity) {
      qty = quantity;
      hasQty = true;
    } else if (value && unit !== "custom") {
      qty = value;
      hasQty = true;
    } else if (hours) {
      qty = hours;
      hasQty = true;
    }
  } else if (isNegotiated) {
    subtotal =
      parseFloat(booking.negotiatedRate) || parseFloat(agreedRate) || 0;
    if (unit === "custom" && quantity) {
      qty = quantity;
      hasQty = true;
    } else if (value && unit !== "custom") {
      qty = value;
      hasQty = true;
    } else if (hours) {
      qty = hours;
      hasQty = true;
    }
  } else if (unit === "custom") {
    const customRate = agreedRate || 0;
    const customQty = quantity || 1;
    subtotal = parseFloat((customRate * customQty).toFixed(2));
    qty = customQty;
    hasQty = true;
  } else {
    if (value && unit !== "custom") {
      qty = value;
      hasQty = true;
    } else if (hours) {
      if (unit === "hours") qty = hours;
      else if (unit === "days") qty = Math.round(hours / 8);
      else if (unit === "weeks") qty = Math.round(hours / 40);
      else if (unit === "months") qty = Math.round(hours / 160);
      else if (unit === "years") qty = Math.round(hours / 1920);
      hasQty = true;
    }
    subtotal = parseFloat((agreedRate * qty).toFixed(2));
  }

  const unitSuffix =
    {
      hours: "/hr",
      days: "/day",
      weeks: "/wk",
      months: "/mo",
      years: "/yr",
      custom: "",
    }[unit] || "";

  const unitLabel =
    {
      hours: "hour",
      days: "day",
      weeks: "week",
      months: "month",
      years: "year",
      custom: "custom",
    }[unit] || unit;

  const hirerFee = parseFloat((subtotal * HIRER_FEE_RATE).toFixed(2));
  const workerPayout = subtotal;
  const grossTotal = parseFloat((subtotal + hirerFee).toFixed(2));
  const referralSaving = currency === "NGN" ? referralDiscount : 0;
  const totalCharged = parseFloat(
    Math.max(0, grossTotal - referralSaving).toFixed(2),
  );

  return {
    agreedRate: isJobPostBooking
      ? agreedRate
      : isNegotiated
        ? booking.negotiatedRate
        : agreedRate,
    qty,
    unit,
    unitSuffix,
    unitLabel,
    currency,
    subtotal,
    hirerFee,
    workerPayout,
    grossTotal,
    totalCharged,
    referralSaving,
    hasQty: hasQty || unit === "custom" || !!(value || hours),
    isNegotiated,
    negotiatedRate: isNegotiated ? booking.negotiatedRate : null,
    isJobPostBooking,
  };
}

// ── Convenience wrapper used by payment.controller.js ─────────────────
// Returns the same shape the controller used to expect from
// computeBookingTotal(booking), so call sites don't need changing.
export function computeBookingTotal(booking) {
  const p = calcPricing(booking);
  return {
    subtotal: p.subtotal,
    platformFee: p.hirerFee,
    workerPayout: p.workerPayout,
    total: p.grossTotal,
    isJobPostBooking: p.isJobPostBooking,
  };
}

// ─── Escrow release (canonical) ─────────────────────────────────────────────
// Performs the full release flow:
//   1. Marks payment RELEASED + escrowReleasedAt
//   2. Marks booking COMPLETED + completedAt
//   3. Increments worker's completedJobs counter
//   4. Converts any pending referrals for the worker
//   5. Sends a notification to the worker
//
// Auth and permission checks stay in the controller — this service assumes
// the caller has already authorized the release.
//
// Returns: { payment, booking } on success.
// Throws if the payment isn't in a releasable state.
export async function releaseEscrow(paymentId, options = {}) {
  const { triggeredBy = null, triggeredByRole = "SYSTEM" } = options;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      booking: {
        include: {
          worker: { select: { id: true, firstName: true } },
          hirer: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  if (!payment) {
    throw new Error("Payment not found");
  }

  if (payment.status !== "HELD") {
    throw new Error(
      `Payment cannot be released — current status is ${payment.status}, expected HELD`,
    );
  }

  const booking = payment.booking;
  if (!booking) {
    throw new Error("Payment has no associated booking");
  }

  // 1 + 2. Update payment and booking atomically
  const [updatedPayment, updatedBooking] = await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: { status: "RELEASED", escrowReleasedAt: new Date() },
    }),
    prisma.booking.update({
      where: { id: booking.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    }),
  ]);

  // 3. Increment worker's completedJobs counter (best-effort — profile may not exist)
  await prisma.workerProfile
    .update({
      where: { userId: booking.workerId },
      data: { completedJobs: { increment: 1 } },
    })
    .catch(() => {});

  // 4. Convert referrals (fire and forget)
  const { convertReferral } = await import("./referral.controller.js").catch(
    () => ({ convertReferral: null }),
  );
  if (convertReferral) {
    await convertReferral(booking.workerId, payment.amount).catch((err) =>
      console.error("convertReferral (releaseEscrow) error:", err.message),
    );
  }

  // 5. Notify worker
  const { createNotification } =
    await import("./notification.service.js").catch(() => ({
      createNotification: null,
    }));
  if (createNotification) {
    await createNotification({
      userId: booking.workerId,
      title: "Payment Released 🎉",
      body: `Payment for "${booking.title}" has been released to you.`,
      type: "PAYMENT_RELEASED",
      data: { bookingId: booking.id, paymentId: payment.id },
      icon: "FaMoneyBillWave",
    }).catch((err) =>
      console.error("notify (releaseEscrow) error:", err.message),
    );
  }

  console.log(
    `[releaseEscrow] Payment ${payment.id} released to worker ${booking.workerId} (triggered by ${triggeredByRole} ${triggeredBy ?? "system"})`,
  );

  return { payment: updatedPayment, booking: updatedBooking };
}
