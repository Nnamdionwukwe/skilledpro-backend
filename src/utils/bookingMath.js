// src/utils/bookingMath.js
//
// Single source of truth for converting a job's rate + duration into the
// total amount a booking will charge. Used by:
//
//   GET  /api/bookings/from-job/:id/draft  → to price each option
//   POST /api/bookings/from-job/:id        → to set the final agreedRate
//
// NEVER trust the client to compute this. The frontend sends only
// `selectedRateOption` and (optionally) `negotiatedRate`. The server
// computes and stores everything else.
//
// ── Duration unit conversion ───────────────────────────────────────────
// These multipliers MUST match `toEstimatedHours` in PostJob.jsx and
// EditJob.jsx. If you change one, change all three.
//
const HOURS_PER_DAY = 8;
const HOURS_PER_WEEK = 56; // 8 × 7
const HOURS_PER_MONTH = 242.5; // 56 × 4.33
const HOURS_PER_YEAR = 2910; // 242.5 × 12

/**
 * Convert an (estimatedValue, estimatedUnit) pair to hours.
 * Returns null for custom or invalid inputs.
 */
function durationToHours(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;

  switch (unit) {
    case "hours":
      return n;
    case "days":
      return n * HOURS_PER_DAY;
    case "weeks":
      return n * HOURS_PER_WEEK;
    case "months":
      return n * HOURS_PER_MONTH;
    case "years":
      return n * HOURS_PER_YEAR;
    default:
      return null;
  }
}

/**
 * Convert a duration expressed in HOURS into the rate's time unit.
 * e.g. 56 hours ÷ 56 = 1 "week" when the rate is WEEKLY.
 */
function hoursToRateUnit(hours, budgetType) {
  if (!Number.isFinite(hours) || hours <= 0) return null;

  switch (budgetType) {
    case "HOURLY":
      return hours;
    case "DAILY":
      return hours / HOURS_PER_DAY;
    case "WEEKLY":
      return hours / HOURS_PER_WEEK;
    case "MONTHLY":
      return hours / HOURS_PER_MONTH;
    case "YEARLY":
      return hours / HOURS_PER_YEAR;
    default:
      return null;
  }
}

function resolveRate(job, optionKey) {
  switch (optionKey) {
    case "budget":
      return Number(job.budget);
    case "salaryAmount":
      return Number(job.salaryAmount);
    case "salaryMin":
      return Number(job.salaryMin);
    case "salaryMax":
      return Number(job.salaryMax);
    case "salaryText":
      return null; // freeform — no numeric amount
    default:
      return null;
  }
}

function resolveCurrency(job, optionKey) {
  if (optionKey === "budget") return job.currency || "NGN";
  return job.salaryCurrency || job.currency || "NGN";
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
function round4(n) {
  return Math.round(n * 10000) / 10000;
}

/**
 * Compute the total for a booking created from a job post.
 *
 * @param  {object} job           JobPost row (budgetType, budget,
 *                                estimatedValue, estimatedUnit, currency,
 *                                salaryCurrency, salaryAmount, salaryMin,
 *                                salaryMax, salaryText, salaryPeriod).
 * @param  {string} optionKey     "budget" | "salaryAmount" | "salaryMin"
 *                                | "salaryMax" | "salaryText"
 * @param  {number|string|null} negotiatedRate  Overrides the computed
 *                                total if provided and positive.
 *
 * @returns {{
 *   amount:       number,   // final total, 2 dp
 *   currency:     string,
 *   isNegotiated: boolean,
 *   explanation:  string,   // human-readable audit trail
 * }}
 *
 * @throws Error with `.code` ∈ {
 *   MISSING_RATE, MISSING_DURATION, CUSTOM_UNSUPPORTED,
 *   SALARY_TEXT_UNSUPPORTED
 * }
 */
export function computeJobBookingTotal(job, optionKey, negotiatedRate) {
  // ── 1. Negotiated amount short-circuits everything else ───────────
  if (negotiatedRate != null && negotiatedRate !== "") {
    const n = Number(negotiatedRate);
    if (!Number.isFinite(n) || n <= 0) {
      const err = new Error("Negotiated rate must be a positive number");
      err.code = "MISSING_RATE";
      throw err;
    }
    return {
      amount: round2(n),
      currency: resolveCurrency(job, optionKey),
      isNegotiated: true,
      explanation: "Negotiated amount (overrides computed total)",
    };
  }

  // ── 2. Freeform salary text → cannot compute ──────────────────────
  if (optionKey === "salaryText") {
    const err = new Error(
      "This option uses a free-form salary text with no numeric amount. Please enter a negotiated amount.",
    );
    err.code = "SALARY_TEXT_UNSUPPORTED";
    throw err;
  }

  // ── 3. Resolve the raw rate ───────────────────────────────────────
  const rate = resolveRate(job, optionKey);
  if (!Number.isFinite(rate) || rate <= 0) {
    const err = new Error(
      "The selected price option has no numeric amount. Please enter a negotiated amount.",
    );
    err.code = "MISSING_RATE";
    throw err;
  }
  const currency = resolveCurrency(job, optionKey);

  // ── 4. FIXED (or unset) → flat total ─────────────────────────────
  const budgetType = job.budgetType || "FIXED";
  if (budgetType === "FIXED") {
    return {
      amount: round2(rate),
      currency,
      isNegotiated: false,
      explanation: `Fixed total: ${currency} ${rate}`,
    };
  }

  // ── 5. CUSTOM → negotiation required ─────────────────────────────
  if (budgetType === "CUSTOM") {
    const err = new Error(
      "This job uses a custom pay rate. Please enter the agreed total amount as a negotiated rate.",
    );
    err.code = "CUSTOM_UNSUPPORTED";
    throw err;
  }

  // ── 6. Time-based rate → need a duration ─────────────────────────
  const hours = durationToHours(job.estimatedValue, job.estimatedUnit);
  if (hours == null) {
    const err = new Error(
      "This job uses a rate per unit of time but no usable duration was set. Please enter a negotiated amount.",
    );
    err.code = "MISSING_DURATION";
    throw err;
  }

  const units = hoursToRateUnit(hours, budgetType);
  if (units == null || units <= 0) {
    const err = new Error(
      "Could not convert the job's duration into the rate's time unit. Please enter a negotiated amount.",
    );
    err.code = "MISSING_DURATION";
    throw err;
  }

  const amount = round2(rate * units);

  return {
    amount,
    currency,
    isNegotiated: false,
    explanation:
      `${currency} ${rate} × ${round4(units)} ${budgetType.toLowerCase()} ` +
      `(${job.estimatedValue} ${job.estimatedUnit} = ${round2(hours)} h) = ` +
      `${currency} ${amount}`,
  };
}
