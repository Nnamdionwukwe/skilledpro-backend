// src/utils/pricing.js  (backend)
// Shared pricing utility — mirror of the frontend's src/utils/pricing.js
// so Paystack, Flutterwave, bank-transfer, and crypto paths all agree
// with what the UI shows.
//
// Fee rate comes from src/config/fees.js — the single source of truth
// for every fee on the platform.

import prisma from "../config/database.js";
import { FEE_CONFIG } from "../config/fees.js";

// Re-exported for backwards compatibility with existing importers.
export const HIRER_FEE_RATE = FEE_CONFIG.HIRER_FEE_RATE;

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

  // Fee math — pulled from FEE_CONFIG so changing the fee rate in one
  // place updates pricing, payments, invoices, refunds, and emails.
  const hirerFee = FEE_CONFIG.computeHirerFee(subtotal);
  const workerPayout = FEE_CONFIG.computeWorkerPayout(subtotal);
  const grossTotal = FEE_CONFIG.computeGrossTotal(subtotal);
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

// ─── Partial escrow release ──────────────────────────────────────────────────
// Releases a specific amount from a HELD payment to the worker. This is the
// primitive that underpins both partial releases and the "release all"
// shortcut.
//
// Rules:
//   • payment.status must be "HELD"
//   • amount must be > 0 and ≤ (workerPayout - releasedAmount)
//   • releases are non-refundable once made
//   • booking.status is NEVER touched by this service — a partially-released
//     booking is still IN_PROGRESS or COMPLETED, depending on where the
//     worker is in the job lifecycle
//   • when releasedAmount reaches workerPayout, the payment flips to
//     RELEASED and the full-release side effects fire (referral conversion,
//     both-party notifications, completedJobs increment). Partial releases
//     do NOT fire any of those.
//
// Returns: { payment, release, isFinal }
export async function releaseEscrowPartial(paymentId, amount, options = {}) {
  const {
    triggeredBy = null,
    triggeredByRole = "SYSTEM",
    note = null,
  } = options;

  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new Error("Release amount must be a positive number");
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      booking: {
        include: {
          worker: { select: { id: true, firstName: true } },
          hirer: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      },
    },
  });

  if (!payment) throw new Error("Payment not found");
  if (payment.status !== "HELD") {
    throw new Error(
      `Payment cannot be released — current status is ${payment.status}, expected HELD`,
    );
  }

  const booking = payment.booking;
  if (!booking) throw new Error("Payment has no associated booking");

  const workerPayout = Number(payment.workerPayout) || 0;
  const alreadyReleased = Number(payment.releasedAmount) || 0;
  const remainingBefore = parseFloat(
    (workerPayout - alreadyReleased).toFixed(2),
  );

  if (remainingBefore <= 0) {
    throw new Error("This payment has already been fully released");
  }
  if (amountNum > remainingBefore) {
    throw new Error(
      `Release amount (${amountNum}) exceeds the remaining balance (${remainingBefore})`,
    );
  }

  const roundedAmount = parseFloat(amountNum.toFixed(2));
  const remainingAfter = parseFloat(
    (remainingBefore - roundedAmount).toFixed(2),
  );
  const newReleasedAmount = parseFloat(
    (alreadyReleased + roundedAmount).toFixed(2),
  );
  const isFinal = remainingAfter === 0;

  // ── Atomic write: bump releasedAmount/releaseCount, append release row,
  //    and (if final) flip status → RELEASED ────────────────────────────
  const [updatedPayment, release] = await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        releasedAmount: newReleasedAmount,
        releaseCount: { increment: 1 },
        ...(isFinal
          ? { status: "RELEASED", escrowReleasedAt: new Date() }
          : {}),
      },
    }),
    prisma.paymentRelease.create({
      data: {
        paymentId: payment.id,
        amount: roundedAmount,
        currency: payment.currency || "NGN",
        note: note || null,
        releasedById: triggeredBy || booking.hirerId,
        workerPayoutAtRelease: workerPayout,
        remainingBefore,
        remainingAfter,
      },
    }),
  ]);

  // ── Notify the worker ───────────────────────────────────────────────
  const { createNotification } =
    await import("./notification.service.js").catch(() => ({
      createNotification: null,
    }));

  if (createNotification) {
    const cur = payment.currency || "NGN";
    const title = isFinal
      ? "Payment Fully Released 🎉"
      : "Partial Payment Received 💸";
    const body = isFinal
      ? `The full amount of ${cur} ${roundedAmount.toLocaleString()} for "${booking.title}" has been released to you.${note ? ` Note: ${note}` : ""}`
      : `${cur} ${roundedAmount.toLocaleString()} has been released to you for "${booking.title}". Remaining in escrow: ${cur} ${remainingAfter.toLocaleString()}.${note ? ` Note: ${note}` : ""}`;

    await createNotification({
      userId: booking.workerId,
      title,
      body,
      type: isFinal ? "PAYMENT_RELEASED" : "PAYMENT_PARTIALLY_RELEASED",
      data: {
        bookingId: booking.id,
        paymentId: payment.id,
        releaseId: release.id,
        amount: roundedAmount,
        currency: cur,
        remaining: remainingAfter,
        isFinal,
        note: note || null,
      },
      icon: "FaMoneyBillWave",
    }).catch((err) =>
      console.error("notify (releaseEscrowPartial) error:", err.message),
    );
  }

  // ── Full-release side effects — only when 100% has been released ────
  if (isFinal) {
    // completedJobs increment (best-effort)
    await prisma.workerProfile
      .update({
        where: { userId: booking.workerId },
        data: { completedJobs: { increment: 1 } },
      })
      .catch(() => {});

    // Referral conversion (fire-and-forget)
    const { convertReferral } = await import("./referral.controller.js").catch(
      () => ({ convertReferral: null }),
    );
    if (convertReferral) {
      await convertReferral(booking.workerId, payment.amount).catch((err) =>
        console.error(
          "convertReferral (releaseEscrowPartial) error:",
          err.message,
        ),
      );
    }
  }

  console.log(
    `[releaseEscrowPartial] Payment ${payment.id}: released ${roundedAmount} ${payment.currency} (${alreadyReleased}→${newReleasedAmount} of ${workerPayout}), final=${isFinal}, by ${triggeredByRole} ${triggeredBy ?? "system"}`,
  );

  return { payment: updatedPayment, release, isFinal };
}
