// src/utils/helpers.js
// ─────────────────────────────────────────────────────────────────────────────
// Shared utility functions used across all SkilledProz controllers and services.
//
// Import only what you need:
//   import { paginate, fullName, formatCurrency } from "../utils/helpers.js";
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";

// ═════════════════════════════════════════════════════════════════════════════
// § 1  DATABASE / PAGINATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns { skip, take } for Prisma queries.
 * Clamps limit to maxLimit to prevent abuse.
 *
 * @example
 *   const { skip, take } = paginate(req.query.page, req.query.limit);
 *   prisma.booking.findMany({ skip, take, ... });
 */
export function paginate(page = 1, limit = 20, maxLimit = 100) {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(parseInt(limit) || 20, maxLimit);
  return { skip: (p - 1) * l, take: l, page: p, limit: l };
}

/**
 * Build a standard pagination meta object to attach to list responses.
 *
 * @example
 *   return sendResponse(res, { data: { items, ...paginationMeta(total, page, limit) } });
 */
export function paginationMeta(total, page, limit) {
  const p = parseInt(page) || 1;
  const l = parseInt(limit) || 20;
  return {
    total,
    page: p,
    limit: l,
    pages: Math.ceil(total / l),
    hasNextPage: p * l < total,
    hasPrevPage: p > 1,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// § 2  UNIQUE REFERENCE / ID GENERATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Generates a unique, URL-safe reference string.
 * Used for payment refs, withdrawal refs, booking refs, etc.
 *
 * @param {string} prefix  e.g. "PAY" → "PAY-1748823999-A3F2C1B0"
 */
export function uniqueRef(prefix = "SP") {
  const hex = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}-${Date.now()}-${hex}`;
}

/**
 * Generates a random alphanumeric referral code.
 *
 * @param {number} length  default 8
 * @returns {string}       e.g. "K9X2MQ7P"
 */
export function generateReferralCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusable chars (0/O, 1/I)
  return Array.from(crypto.randomBytes(length))
    .map((b) => chars[b % chars.length])
    .join("");
}

/**
 * Generates a numeric OTP of a given length.
 *
 * @param {number} length  default 6
 */
export function generateOTP(length = 6) {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return String(crypto.randomInt(min, max + 1));
}

// ═════════════════════════════════════════════════════════════════════════════
// § 3  STRING UTILITIES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Creates a URL-safe slug from any string.
 *
 * @example slugify("Web & App Development") → "web-app-development"
 */
export function slugify(str) {
  return String(str)
    .toLowerCase()
    .normalize("NFD") // decompose accented chars
    .replace(/[\u0300-\u036f]/g, "") // strip accent marks
    .replace(/[^a-z0-9\s-]/g, "") // keep only alphanumeric + space + hyphen
    .trim()
    .replace(/[\s_]+/g, "-") // spaces/underscores → hyphen
    .replace(/-+/g, "-"); // collapse multiple hyphens
}

/**
 * Truncates a string to `max` chars and appends `…` if needed.
 * Useful for notification bodies and message previews.
 *
 * @example truncate("Long message here...", 30) → "Long message here..."
 */
export function truncate(str, max = 100) {
  if (!str) return "";
  const s = String(str);
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/**
 * Capitalises the first letter of a string.
 */
export function capitalize(str) {
  if (!str) return "";
  return (
    String(str).charAt(0).toUpperCase() + String(str).slice(1).toLowerCase()
  );
}

/**
 * Strips HTML tags and dangerous characters from user-supplied strings.
 * Lightweight — not a full XSS sanitiser but removes the most common vectors.
 */
export function sanitize(str) {
  if (!str) return "";
  return String(str)
    .replace(/<[^>]*>/g, "") // strip HTML tags
    .replace(/[<>"'`]/g, "") // strip dangerous chars
    .replace(/\x00/g, "") // strip null bytes
    .trim();
}

// ═════════════════════════════════════════════════════════════════════════════
// § 4  USER / NAME HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns a consistent full name from any user-like object.
 *
 * @example fullName({ firstName: "Ada", lastName: "Obi" }) → "Ada Obi"
 */
export function fullName(user) {
  if (!user) return "Unknown User";
  const first = user.firstName || user.first_name || "";
  const last = user.lastName || user.last_name || "";
  return `${first} ${last}`.trim() || user.email || "Unknown User";
}

/**
 * Returns initials from a user object. Useful for avatar placeholders.
 *
 * @example initials({ firstName: "Ada", lastName: "Obi" }) → "AO"
 */
export function initials(user) {
  if (!user) return "?";
  const f = (user.firstName || user.first_name || "").charAt(0).toUpperCase();
  const l = (user.lastName || user.last_name || "").charAt(0).toUpperCase();
  return f + l || "?";
}

// ═════════════════════════════════════════════════════════════════════════════
// § 5  PRIVACY / MASKING
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Masks an email address for safe display in logs and notifications.
 *
 * @example maskEmail("ada@example.com") → "a***@example.com"
 */
export function maskEmail(email) {
  if (!email || !email.includes("@")) return "***";
  const [local, domain] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, local.length - 2))}@${domain}`;
}

/**
 * Masks a phone number, showing only the last 4 digits.
 *
 * @example maskPhone("+2348012345678") → "+234 **** **** 5678"
 */
export function maskPhone(phone) {
  if (!phone) return "***";
  const s = String(phone).replace(/\s/g, "");
  if (s.length < 4) return "****";
  return `${"*".repeat(s.length - 4)}${s.slice(-4)}`;
}

/**
 * Strips sensitive fields from a user object before logging or serialising.
 * Always call this before logging req.user or any user object.
 */
export function safeUser(user) {
  if (!user) return null;
  const {
    password,
    refreshToken,
    emailVerifyToken,
    passwordResetToken,
    passwordResetExpiry,
    ...safe
  } = user;
  return safe;
}

/**
 * Picks only the specified keys from an object.
 *
 * @example pick(user, ["id", "email", "role"])
 */
export function pick(obj, keys) {
  if (!obj || !keys) return {};
  return keys.reduce((acc, key) => {
    if (key in obj) acc[key] = obj[key];
    return acc;
  }, {});
}

/**
 * Returns a copy of `obj` without the specified keys.
 *
 * @example omit(user, ["password", "refreshToken"])
 */
export function omit(obj, keys) {
  if (!obj || !keys) return obj;
  const keysToOmit = new Set(keys);
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !keysToOmit.has(k)),
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// § 6  CURRENCY & FINANCIAL
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Formats a monetary amount with its currency code.
 * Locale-aware — Nigerian users see ₦ amounts formatted correctly.
 *
 * @example formatCurrency(50000, "NGN")   → "₦50,000"
 * @example formatCurrency(100.5, "USD")   → "$100.50"
 * @example formatCurrency(100, "GBP")     → "£100.00"
 */
export function formatCurrency(amount, currency = "NGN") {
  const num = parseFloat(amount) || 0;
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    }).format(num);
  } catch {
    // Fallback for unsupported currency codes (e.g. USDC)
    return `${currency.toUpperCase()} ${num.toLocaleString("en-NG")}`;
  }
}

/**
 * Rounds a number to 2 decimal places (financial precision).
 */
export function toFixed2(n) {
  return Math.round((parseFloat(n) || 0) * 100) / 100;
}

/**
 * Calculates a percentage of a total, safely.
 *
 * @example percentage(35, 200) → 17.5
 */
export function percentage(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10; // one decimal place
}

/**
 * Rounds a rating to one decimal place for display.
 *
 * @example roundRating(4.666) → 4.7
 */
export function roundRating(rating) {
  return Math.round((parseFloat(rating) || 0) * 10) / 10;
}

// ═════════════════════════════════════════════════════════════════════════════
// § 7  DATE & TIME
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns a Date object N days in the past.
 *
 * @example daysAgo(7) → Date 7 days ago
 */
export function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000);
}

/**
 * Returns a Date object N days in the future.
 */
export function daysFromNow(n) {
  return new Date(Date.now() + n * 86_400_000);
}

/**
 * Returns a human-readable "time ago" string.
 *
 * @example timeAgo(new Date(Date.now() - 3600000)) → "1 hour ago"
 */
export function timeAgo(date) {
  if (!date) return "unknown";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  const intervals = [
    [31536000, "year"],
    [2592000, "month"],
    [604800, "week"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [threshold, label] of intervals) {
    const count = Math.floor(seconds / threshold);
    if (count >= 1) return `${count} ${label}${count > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

/**
 * Returns start/end Date objects for common reporting periods.
 *
 * @param {"today"|"week"|"month"|"year"} period
 */
export function getDateRange(period) {
  const now = new Date();
  const start = new Date(now);

  switch (period) {
    case "today":
      start.setHours(0, 0, 0, 0);
      return { from: start, to: now };
    case "week":
      start.setDate(now.getDate() - 7);
      return { from: start, to: now };
    case "month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    case "last_month": {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: lm, to: new Date(now.getFullYear(), now.getMonth(), 0) };
    }
    case "year":
      return { from: new Date(now.getFullYear(), 0, 1), to: now };
    default:
      return { from: daysAgo(30), to: now };
  }
}

/**
 * Returns start/end for the current calendar month.
 */
export function currentMonth() {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// § 8  NETWORK / REQUEST
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Extracts the client IP address from a request,
 * correctly handling Railway's reverse proxy and CDN headers.
 *
 * @param {import("express").Request} req
 */
export function extractIP(req) {
  return (
    req.headers["x-real-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

/**
 * Extracts a truncated user-agent string for logging.
 */
export function extractUA(req) {
  return req.headers["user-agent"]?.slice(0, 200) || null;
}

// ═════════════════════════════════════════════════════════════════════════════
// § 9  ARRAYS & OBJECTS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Splits an array into chunks of `size`.
 * Used for push notification batching, bulk DB inserts, etc.
 *
 * @example chunk([1,2,3,4,5], 2) → [[1,2],[3,4],[5]]
 */
export function chunk(arr, size) {
  if (!Array.isArray(arr) || size < 1) return [arr];
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/**
 * Removes duplicate values from an array.
 */
export function unique(arr) {
  return [...new Set(arr)];
}

/**
 * Safely parses a JSON string. Returns `fallback` on error.
 * Used for parsing the `notes` JSONB column on Withdrawal records.
 *
 * @example parseJSON('{"bankCode":"044"}', {}) → { bankCode: "044" }
 */
export function parseJSON(str, fallback = null) {
  if (!str) return fallback;
  if (typeof str === "object") return str; // already parsed
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/**
 * Safely serialises an object to JSON. Returns `"{}"` on error.
 */
export function toJSON(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return "{}";
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// § 10  VALIDATION HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns true if `str` is a valid UUID v4.
 */
export function isValidUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    str,
  );
}

/**
 * Returns true if `str` is a valid email address.
 */
export function isValidEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(str));
}

/**
 * Returns true if `token` looks like a valid Expo push token.
 */
export function isValidPushToken(token) {
  return (
    typeof token === "string" &&
    (token.startsWith("ExponentPushToken[") ||
      token.startsWith("ExpoPushToken[") ||
      token.length > 50)
  );
}

/**
 * Returns true if `amount` is a valid positive financial amount.
 */
export function isValidAmount(amount) {
  const n = parseFloat(amount);
  return !isNaN(n) && n > 0 && isFinite(n);
}

// ═════════════════════════════════════════════════════════════════════════════
// § 11  PLATFORM STATUS LABELS
// Human-readable labels and colours for booking/payment/job statuses.
// Used by admin dashboards and notification messages.
// ═════════════════════════════════════════════════════════════════════════════

export const BOOKING_STATUS_LABEL = {
  PENDING: { label: "Pending", color: "yellow" },
  ACCEPTED: { label: "Accepted", color: "blue" },
  IN_PROGRESS: { label: "In Progress", color: "indigo" },
  COMPLETED: { label: "Completed", color: "green" },
  CANCELLED: { label: "Cancelled", color: "gray" },
  DISPUTED: { label: "Disputed", color: "red" },
};

export const PAYMENT_STATUS_LABEL = {
  PENDING: { label: "Pending", color: "yellow" },
  HELD: { label: "In Escrow", color: "blue" },
  RELEASED: { label: "Released", color: "green" },
  REFUNDED: { label: "Refunded", color: "orange" },
  FAILED: { label: "Failed", color: "red" },
};

export const JOB_STATUS_LABEL = {
  OPEN: { label: "Open", color: "green" },
  FILLED: { label: "Filled", color: "blue" },
  CANCELLED: { label: "Cancelled", color: "gray" },
};

export const WITHDRAWAL_STATUS_LABEL = {
  PENDING: { label: "Pending", color: "yellow" },
  PROCESSING: { label: "Processing", color: "blue" },
  COMPLETED: { label: "Completed", color: "green" },
  FAILED: { label: "Failed", color: "red" },
  REJECTED: { label: "Rejected", color: "red" },
};

/**
 * Returns the label and colour for a given status string.
 *
 * @param {"booking"|"payment"|"job"|"withdrawal"} type
 * @param {string} status
 */
export function statusLabel(type, status) {
  const maps = {
    booking: BOOKING_STATUS_LABEL,
    payment: PAYMENT_STATUS_LABEL,
    job: JOB_STATUS_LABEL,
    withdrawal: WITHDRAWAL_STATUS_LABEL,
  };
  return maps[type]?.[status] ?? { label: status, color: "gray" };
}

// ═════════════════════════════════════════════════════════════════════════════
// § 12  ASYNC UTILITIES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Async sleep / delay.
 *
 * @example await sleep(500); // wait 500ms
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries an async function up to `retries` times with exponential back-off.
 * Useful for flaky external API calls (Paystack, Flutterwave).
 *
 * @param {Function} fn       - async function to call
 * @param {number}   retries  - max attempts (default 3)
 * @param {number}   delayMs  - initial delay in ms (doubles each retry)
 */
export async function withRetry(fn, retries = 3, delayMs = 300) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) await sleep(delayMs * Math.pow(2, i));
    }
  }
  throw lastErr;
}

/**
 * Runs an async function with a timeout.
 * Throws if the operation takes longer than `ms` milliseconds.
 *
 * @example const data = await withTimeout(fetchData(), 5000);
 */
export function withTimeout(promise, ms, message = "Operation timed out") {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(message)), ms),
  );
  return Promise.race([promise, timeout]);
}

// ═════════════════════════════════════════════════════════════════════════════
// § 13  NIGERIAN-SPECIFIC HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Normalises a Nigerian phone number to international format (+234...).
 *
 * @example normaliseNGPhone("08012345678")   → "+2348012345678"
 * @example normaliseNGPhone("+2348012345678") → "+2348012345678"
 */
export function normaliseNGPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("234")) return `+${digits}`;
  if (digits.startsWith("0")) return `+234${digits.slice(1)}`;
  if (digits.length === 10) return `+234${digits}`;
  return `+${digits}`;
}

/**
 * Returns true if a phone number looks like a valid Nigerian mobile number.
 */
export function isNGPhone(phone) {
  const normalised = normaliseNGPhone(phone) || "";
  return /^\+234[789][01]\d{8}$/.test(normalised);
}

/**
 * Formats a Naira amount concisely for display in notification messages.
 *
 * @example nairaDisplay(1500000) → "₦1.5M"
 * @example nairaDisplay(50000)   → "₦50,000"
 */
export function nairaDisplay(amount) {
  const n = parseFloat(amount) || 0;
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${n.toLocaleString("en-NG")}`;
  return `₦${n}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// § 14  PROFILE COMPLETION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Calculates a worker's profile completion percentage.
 * The same logic as getWorkerDashboard — centralised here to avoid duplication.
 *
 * @param {object} worker - full WorkerProfile with user, portfolio, etc.
 * @returns {number}  0–100
 */
export function workerProfileCompletion(worker) {
  if (!worker) return 0;
  const checks = [
    !!worker.user?.avatar,
    !!worker.user?.phone,
    !!worker.title,
    !!worker.description,
    (worker.portfolio?.length || 0) > 0,
    (worker.certifications?.length || 0) > 0,
    (worker.categories?.length || 0) > 0,
    (worker.availability?.length || 0) > 0,
    worker.verificationStatus === "VERIFIED",
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
