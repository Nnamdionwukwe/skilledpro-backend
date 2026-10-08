// src/utils/pricing.js  (backend)
// Shared pricing utility — mirror of the frontend's src/utils/pricing.js
// so Paystack, Flutterwave, bank-transfer, and crypto paths all agree
// with what the UI shows.

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
