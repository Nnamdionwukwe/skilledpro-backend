// src/services/payment.service.js  (acting as your pricing utility)
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

  // ✅ Two-tier fee math — NGN (2%) vs. everything else (5%).
  const feeRate = FEE_CONFIG.getHirerFeeRate(currency);
  const feePercent = Math.round(feeRate * 100);

  const hirerFee = FEE_CONFIG.computeHirerFee(subtotal, currency);
  const workerPayout = FEE_CONFIG.computeWorkerPayout(subtotal);
  const grossTotal = FEE_CONFIG.computeGrossTotal(subtotal, currency);

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
    // ✅ Expose the effective rate so callers (controller, invoices,
    // emails, notifications) can render the correct label per currency.
    feeRate,
    feePercent,
  };
}

// ── Convenience wrapper used by payment.controller.js ─────────────────
export function computeBookingTotal(booking) {
  const p = calcPricing(booking);
  return {
    subtotal: p.subtotal,
    platformFee: p.hirerFee,
    workerPayout: p.workerPayout,
    total: p.grossTotal,
    isJobPostBooking: p.isJobPostBooking,
    feeRate: p.feeRate,
    feePercent: p.feePercent,
  };
}

// ─── Escrow release (canonical) ─────────────────────────────────────────────
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

  await prisma.workerProfile
    .update({
      where: { userId: booking.workerId },
      data: { completedJobs: { increment: 1 } },
    })
    .catch(() => {});

  const { convertReferral } = await import("./referral.controller.js").catch(
    () => ({ convertReferral: null }),
  );
  if (convertReferral) {
    await convertReferral(booking.workerId, payment.amount).catch((err) =>
      console.error("convertReferral (releaseEscrow) error:", err.message),
    );
  }

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

  if (isFinal) {
    await prisma.workerProfile
      .update({
        where: { userId: booking.workerId },
        data: { completedJobs: { increment: 1 } },
      })
      .catch(() => {});

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
