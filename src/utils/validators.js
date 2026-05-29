// src/utils/validators.js
// ─────────────────────────────────────────────────────────────────────────────
// Input validation for all SkilledProz API endpoints.
// Uses express-validator (already in package.json as ^7.3.1).
//
// Usage in routes:
//   import { validateRegister, validateCreateBooking, validate } from "../utils/validators.js";
//
//   router.post("/register", validateRegister, register);
//   router.post("/",         validateCreateBooking, createBooking);
//
// Each named export is an array of validation chains + the `validate` handler
// as the final element, so you can spread them directly into router.post().
// ─────────────────────────────────────────────────────────────────────────────

import {
  body,
  param,
  query,
  validationResult,
  isUUID,
} from "express-validator";

// ─────────────────────────────────────────────────────────────────────────────
// § 0  CORE RESULT HANDLER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Drop this as the last item in any validator array.
 * Returns 400 with the first error message + a full errors array.
 * In development the invalid value is included for easier debugging.
 */
export const validate = (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const errors = result.array().map((e) => ({
    field: e.path,
    message: e.msg,
    ...(process.env.NODE_ENV !== "production" && { value: e.value }),
  }));

  return res.status(400).json({
    success: false,
    message: errors[0].message, // most relevant error as the top-level message
    errors,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// § 0.1  SHARED REUSABLE FIELD RULES
// ─────────────────────────────────────────────────────────────────────────────

const r = {
  // UUID param / body field
  uuid: (field, location = body) =>
    location(field)
      .trim()
      .notEmpty()
      .withMessage(`${field} is required`)
      .isUUID(4)
      .withMessage(`${field} must be a valid UUID`),

  // Generic required string
  str: (field, min = 1, max = 500, location = body) =>
    location(field)
      .trim()
      .notEmpty()
      .withMessage(`${field} is required`)
      .isLength({ min, max })
      .withMessage(`${field} must be between ${min} and ${max} characters`),

  // Optional string (only validate if present)
  optStr: (field, max = 500, location = body) =>
    location(field)
      .optional({ nullable: true, checkFalsy: true })
      .trim()
      .isLength({ max })
      .withMessage(`${field} must not exceed ${max} characters`),

  // Positive amount (financial)
  amount: (field = "amount", min = 0.01) =>
    body(field)
      .notEmpty()
      .withMessage(`${field} is required`)
      .isFloat({ min })
      .withMessage(`${field} must be a positive number greater than ${min}`),

  // Integer with range
  int: (field, min = 1, max = 2147483647) =>
    body(field)
      .notEmpty()
      .withMessage(`${field} is required`)
      .isInt({ min, max })
      .withMessage(`${field} must be an integer between ${min} and ${max}`),

  // Enum value
  oneOf: (field, values, location = body) =>
    location(field)
      .notEmpty()
      .withMessage(`${field} is required`)
      .isIn(values)
      .withMessage(`${field} must be one of: ${values.join(", ")}`),

  // Optional enum
  optOneOf: (field, values, location = body) =>
    location(field)
      .optional({ nullable: true })
      .isIn(values)
      .withMessage(`${field} must be one of: ${values.join(", ")}`),

  // Pagination query params
  page: query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),
  limit: query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
};

// ─────────────────────────────────────────────────────────────────────────────
// § 1  AUTH VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/auth/register
export const validateRegister = [
  body("firstName")
    .trim()
    .notEmpty()
    .withMessage("First name is required")
    .isLength({ max: 50 })
    .withMessage("First name must not exceed 50 characters")
    .matches(/^[a-zA-Z\s'\-]+$/)
    .withMessage(
      "First name may only contain letters, spaces, hyphens, and apostrophes",
    ),

  body("lastName")
    .trim()
    .notEmpty()
    .withMessage("Last name is required")
    .isLength({ max: 50 })
    .withMessage("Last name must not exceed 50 characters")
    .matches(/^[a-zA-Z\s'\-]+$/)
    .withMessage(
      "Last name may only contain letters, spaces, hyphens, and apostrophes",
    ),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .isLength({ max: 128 })
    .withMessage("Password must not exceed 128 characters")
    .matches(/[a-zA-Z]/)
    .withMessage("Password must contain at least one letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain at least one number"),

  body("role")
    .notEmpty()
    .withMessage("Role is required")
    .isIn(["HIRER", "WORKER"])
    .withMessage("Role must be HIRER or WORKER"),

  body("phone")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage("Phone number must not exceed 20 characters"),

  body("country")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage("Country must not exceed 100 characters"),

  body("city")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage("City must not exceed 100 characters"),

  body("referralCode")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isAlphanumeric()
    .withMessage("Referral code must be alphanumeric")
    .isLength({ min: 4, max: 20 })
    .withMessage("Referral code must be 4–20 characters"),

  validate,
];

// POST /api/auth/login
export const validateLogin = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ max: 128 })
    .withMessage("Invalid credentials"),

  validate,
];

// POST /api/auth/forgot-password
export const validateForgotPassword = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),

  validate,
];

// POST /api/auth/reset-password
export const validateResetPassword = [
  body("token")
    .trim()
    .notEmpty()
    .withMessage("Reset token is required")
    .isLength({ min: 60, max: 70 })
    .withMessage("Invalid reset token format"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .isLength({ max: 128 })
    .withMessage("Password must not exceed 128 characters")
    .matches(/[a-zA-Z]/)
    .withMessage("Password must contain at least one letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain at least one number"),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// § 2  USER / PROFILE VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

// PUT /api/users/me  |  PATCH /api/settings/profile
export const validateUpdateProfile = [
  body("firstName")
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("First name must be 1–50 characters")
    .matches(/^[a-zA-Z\s'\-]+$/)
    .withMessage("First name contains invalid characters"),

  body("lastName")
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("Last name must be 1–50 characters")
    .matches(/^[a-zA-Z\s'\-]+$/)
    .withMessage("Last name contains invalid characters"),

  body("phone")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage("Phone number is too long"),

  body("bio")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Bio must not exceed 1000 characters"),

  body("country")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage("Country is too long"),

  body("city")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage("City is too long"),

  body("state")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage("State is too long"),

  body("language")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage("Language is too long"),

  body("currency")
    .optional({ nullable: true })
    .trim()
    .isLength({ min: 3, max: 4 })
    .withMessage("Currency must be a 3–4 character code"),

  validate,
];

// PATCH /api/settings/password
export const validateChangePassword = [
  body("currentPassword")
    .notEmpty()
    .withMessage("Current password is required"),

  body("newPassword")
    .notEmpty()
    .withMessage("New password is required")
    .isLength({ min: 8 })
    .withMessage("New password must be at least 8 characters")
    .isLength({ max: 128 })
    .withMessage("New password must not exceed 128 characters")
    .matches(/[a-zA-Z]/)
    .withMessage("New password must contain at least one letter")
    .matches(/[0-9]/)
    .withMessage("New password must contain at least one number")
    .custom((val, { req }) => val !== req.body.currentPassword)
    .withMessage("New password must be different from your current password"),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// § 3  WORKER PROFILE VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

// PUT /api/workers/profile  |  PATCH /api/settings/worker-profile
export const validateUpdateWorkerProfile = [
  body("title")
    .optional()
    .trim()
    .isLength({ min: 3, max: 150 })
    .withMessage("Professional title must be 3–150 characters"),

  body("description")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 3000 })
    .withMessage("Description must not exceed 3000 characters"),

  body("hourlyRate")
    .optional()
    .isFloat({ min: 0, max: 1000000 })
    .withMessage("Hourly rate must be a positive number up to 1,000,000"),

  body("currency")
    .optional()
    .trim()
    .isLength({ min: 3, max: 4 })
    .withMessage("Currency must be a valid 3–4 character code"),

  body("yearsExperience")
    .optional()
    .isInt({ min: 0, max: 70 })
    .withMessage("Years of experience must be 0–70"),

  body("serviceRadius")
    .optional()
    .isInt({ min: 1, max: 5000 })
    .withMessage("Service radius must be 1–5000 km"),

  body("pricingNote")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 300 })
    .withMessage("Pricing note must not exceed 300 characters"),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// § 4  BOOKING VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/bookings
export const validateCreateBooking = [
  body("workerId")
    .trim()
    .notEmpty()
    .withMessage("Worker ID is required")
    .isUUID(4)
    .withMessage("Worker ID must be a valid UUID"),

  body("categoryId")
    .trim()
    .notEmpty()
    .withMessage("Category is required")
    .isUUID(4)
    .withMessage("Category ID must be a valid UUID"),

  body("title")
    .trim()
    .notEmpty()
    .withMessage("Booking title is required")
    .isLength({ min: 3, max: 200 })
    .withMessage("Title must be 3–200 characters"),

  body("description")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 3000 })
    .withMessage("Description must not exceed 3000 characters"),

  body("agreedRate")
    .notEmpty()
    .withMessage("Agreed rate is required")
    .isFloat({ min: 1 })
    .withMessage("Agreed rate must be at least 1"),

  body("currency")
    .optional()
    .trim()
    .isLength({ min: 3, max: 4 })
    .withMessage("Currency must be a valid 3–4 character code"),

  body("scheduledAt")
    .notEmpty()
    .withMessage("Scheduled date is required")
    .isISO8601()
    .withMessage("Scheduled date must be a valid ISO 8601 date")
    .custom((val) => new Date(val) > new Date())
    .withMessage("Scheduled date must be in the future"),

  body("address")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 300 })
    .withMessage("Address must not exceed 300 characters"),

  body("notes")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Notes must not exceed 1000 characters"),

  validate,
];

// PATCH /api/bookings/:id/status
export const validateBookingStatus = [
  param("id").isUUID(4).withMessage("Booking ID must be a valid UUID"),

  body("status")
    .notEmpty()
    .withMessage("Status is required")
    .isIn(["ACCEPTED", "REJECTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"])
    .withMessage(
      "Status must be ACCEPTED, REJECTED, IN_PROGRESS, COMPLETED, or CANCELLED",
    ),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// § 5  JOB POST VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

const JOB_TYPES = [
  "ONE_TIME",
  "PART_TIME",
  "FULL_TIME",
  "CONTRACT",
  "INTERNSHIP",
];
const LOCATION_TYPES = ["ONSITE", "REMOTE", "HYBRID"];
const BUDGET_TYPES = [
  "FIXED",
  "HOURLY",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "NEGOTIABLE",
];
const DURATION_TYPES = ["HOURS", "DAYS", "WEEKS", "MONTHS", "CUSTOM"];

// POST /api/jobs
export const validateCreateJob = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Job title is required")
    .isLength({ min: 5, max: 200 })
    .withMessage("Title must be 5–200 characters"),

  body("description")
    .trim()
    .notEmpty()
    .withMessage("Job description is required")
    .isLength({ min: 20, max: 5000 })
    .withMessage("Description must be 20–5000 characters"),

  body("categoryId")
    .trim()
    .notEmpty()
    .withMessage("Category is required")
    .isUUID(4)
    .withMessage("Category ID must be a valid UUID"),

  body("budget")
    .notEmpty()
    .withMessage("Budget is required")
    .isFloat({ min: 1 })
    .withMessage("Budget must be a positive number"),

  body("currency")
    .optional()
    .trim()
    .isLength({ min: 3, max: 4 })
    .withMessage("Currency must be a valid 3–4 character code"),

  body("scheduledAt")
    .notEmpty()
    .withMessage("Scheduled date is required")
    .isISO8601()
    .withMessage("Scheduled date must be a valid ISO 8601 date"),

  body("jobType")
    .optional({ nullable: true })
    .isIn(JOB_TYPES)
    .withMessage(`Job type must be one of: ${JOB_TYPES.join(", ")}`),

  body("locationType")
    .optional({ nullable: true })
    .isIn(LOCATION_TYPES)
    .withMessage(`Location type must be one of: ${LOCATION_TYPES.join(", ")}`),

  body("budgetType")
    .optional({ nullable: true })
    .isIn(BUDGET_TYPES)
    .withMessage(`Budget type must be one of: ${BUDGET_TYPES.join(", ")}`),

  body("durationType")
    .optional({ nullable: true })
    .isIn(DURATION_TYPES)
    .withMessage(`Duration type must be one of: ${DURATION_TYPES.join(", ")}`),

  body("durationValue")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage("Duration value must not exceed 100 characters"),

  body("address")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 300 })
    .withMessage("Address must not exceed 300 characters"),

  body("skills")
    .optional({ nullable: true })
    .isArray({ max: 20 })
    .withMessage("Skills must be an array with at most 20 items"),

  body("skills.*")
    .optional()
    .trim()
    .isLength({ min: 1, max: 80 })
    .withMessage("Each skill must be 1–80 characters"),

  body("notes")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Notes must not exceed 1000 characters"),

  validate,
];

// PATCH /api/jobs/:id/status
export const validateJobStatus = [
  param("id").isUUID(4).withMessage("Job ID must be a valid UUID"),
  body("status")
    .notEmpty()
    .withMessage("Status is required")
    .isIn(["OPEN", "FILLED", "CANCELLED"])
    .withMessage("Job status must be OPEN, FILLED, or CANCELLED"),
  validate,
];

// POST /api/jobs/:id/apply
export const validateJobApplication = [
  param("id").isUUID(4).withMessage("Job ID must be a valid UUID"),

  body("coverLetter")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2000 })
    .withMessage("Cover letter must not exceed 2000 characters"),

  body("proposedRate")
    .optional({ nullable: true })
    .isFloat({ min: 1 })
    .withMessage("Proposed rate must be a positive number"),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// § 6  PAYMENT VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

const VALID_CURRENCIES = [
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

// POST /api/payments/withdraw
export const validateWithdrawal = [
  body("amount")
    .notEmpty()
    .withMessage("Amount is required")
    .isFloat({ min: 0.01 })
    .withMessage("Amount must be a positive number"),

  body("currency")
    .optional()
    .trim()
    .toUpperCase()
    .isIn(VALID_CURRENCIES)
    .withMessage("Invalid currency code"),

  body("method")
    .notEmpty()
    .withMessage("Payment method is required")
    .isIn(["bank_transfer", "mobile_money", "crypto"])
    .withMessage("Method must be bank_transfer, mobile_money, or crypto"),

  // Bank transfer fields
  body("bankCode")
    .if(body("method").equals("bank_transfer"))
    .notEmpty()
    .withMessage("Bank code is required for bank transfers")
    .trim(),

  body("accountNumber")
    .if(body("method").equals("bank_transfer"))
    .notEmpty()
    .withMessage("Account number is required for bank transfers")
    .trim()
    .isLength({ min: 8, max: 20 })
    .withMessage("Account number must be 8–20 digits"),

  body("accountName")
    .if(body("method").equals("bank_transfer"))
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 150 })
    .withMessage("Account name must not exceed 150 characters"),

  body("bankName")
    .if(body("method").equals("bank_transfer"))
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage("Bank name must not exceed 100 characters"),

  // Mobile money fields
  body("mobileNumber")
    .if(body("method").equals("mobile_money"))
    .notEmpty()
    .withMessage("Mobile number is required for mobile money")
    .trim()
    .isLength({ min: 8, max: 20 })
    .withMessage("Mobile number must be 8–20 digits"),

  body("mobileProvider")
    .if(body("method").equals("mobile_money"))
    .notEmpty()
    .withMessage("Mobile provider is required for mobile money")
    .isIn(["paystack", "mpesa", "mtnmomo", "opay", "gcash", "bkash"])
    .withMessage("Invalid mobile provider"),

  // Crypto fields
  body("cryptoAddress")
    .if(body("method").equals("crypto"))
    .notEmpty()
    .withMessage("Wallet address is required for crypto withdrawals")
    .trim()
    .isLength({ min: 25, max: 150 })
    .withMessage("Wallet address must be 25–150 characters"),

  body("cryptoCurrency")
    .if(body("method").equals("crypto"))
    .notEmpty()
    .withMessage("Crypto currency is required")
    .isIn(["USDC", "USDT", "BTC", "ETH"])
    .withMessage("Crypto currency must be USDC, USDT, BTC, or ETH"),

  validate,
];

// PATCH /api/payments/bank-transfer/:bookingId/confirm
export const validateConfirmBankTransfer = [
  param("bookingId").isUUID(4).withMessage("Booking ID must be a valid UUID"),

  body("reference")
    .trim()
    .notEmpty()
    .withMessage("Transfer reference is required")
    .isLength({ max: 100 })
    .withMessage("Reference must not exceed 100 characters"),

  body("proofUrl")
    .optional({ nullable: true })
    .trim()
    .isURL()
    .withMessage("Proof must be a valid URL"),

  body("senderName")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 150 })
    .withMessage("Sender name must not exceed 150 characters"),

  body("bankName")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage("Bank name must not exceed 100 characters"),

  validate,
];

// PATCH /api/payments/crypto/:bookingId/confirm
export const validateConfirmCrypto = [
  param("bookingId").isUUID(4).withMessage("Booking ID must be a valid UUID"),

  body("txHash")
    .trim()
    .notEmpty()
    .withMessage("Transaction hash is required")
    .isLength({ min: 20, max: 150 })
    .withMessage("Transaction hash must be 20–150 characters"),

  body("reference")
    .trim()
    .notEmpty()
    .withMessage("Reference is required")
    .isLength({ max: 100 })
    .withMessage("Reference must not exceed 100 characters"),

  body("cryptoCurrency")
    .optional({ nullable: true })
    .isIn(["USDC", "USDT", "BTC", "ETH"])
    .withMessage("Crypto currency must be USDC, USDT, BTC, or ETH"),

  body("cryptoAmount")
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage("Crypto amount must be a positive number"),

  validate,
];

// POST /api/payments/verify-account
export const validateVerifyAccount = [
  body("accountNumber")
    .trim()
    .notEmpty()
    .withMessage("Account number is required")
    .isLength({ min: 8, max: 20 })
    .withMessage("Account number must be 8–20 digits"),

  body("bankCode")
    .trim()
    .notEmpty()
    .withMessage("Bank code is required")
    .isLength({ min: 2, max: 20 })
    .withMessage("Bank code must be 2–20 characters"),

  body("country")
    .optional()
    .trim()
    .isLength({ min: 2, max: 2 })
    .withMessage("Country must be a 2-letter code (e.g. NG, GH)"),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// § 7  REVIEW VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/reviews
export const validateCreateReview = [
  body("bookingId")
    .trim()
    .notEmpty()
    .withMessage("Booking ID is required")
    .isUUID(4)
    .withMessage("Booking ID must be a valid UUID"),

  body("rating")
    .notEmpty()
    .withMessage("Rating is required")
    .isInt({ min: 1, max: 5 })
    .withMessage("Rating must be between 1 and 5"),

  body("comment")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Review comment must not exceed 1000 characters"),

  body("type")
    .notEmpty()
    .withMessage("Review type is required")
    .isIn(["WORKER", "HIRER"])
    .withMessage("Review type must be WORKER or HIRER"),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// § 8  REPORT VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

const REPORT_TYPES = [
  "USER",
  "JOB_POST",
  "POST",
  "REVIEW",
  "BOOKING",
  "MESSAGE",
];
const REPORT_REASONS = [
  "SPAM",
  "FAKE_PROFILE",
  "INAPPROPRIATE_CONTENT",
  "FRAUD",
  "HARASSMENT",
  "SCAM",
  "MISLEADING_INFORMATION",
  "FAKE_REVIEWS",
  "UNDERAGE_USER",
  "HATE_SPEECH",
  "OTHER",
];

// POST /api/reports
export const validateCreateReport = [
  body("targetType")
    .notEmpty()
    .withMessage("Target type is required")
    .isIn(REPORT_TYPES)
    .withMessage(`Target type must be one of: ${REPORT_TYPES.join(", ")}`),

  body("targetId")
    .trim()
    .notEmpty()
    .withMessage("Target ID is required")
    .isLength({ min: 1, max: 150 })
    .withMessage("Target ID is invalid"),

  body("reason")
    .notEmpty()
    .withMessage("Report reason is required")
    .isIn(REPORT_REASONS)
    .withMessage(`Reason must be one of: ${REPORT_REASONS.join(", ")}`),

  body("description")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Description must not exceed 1000 characters"),

  body("evidence")
    .optional({ nullable: true })
    .isArray({ max: 5 })
    .withMessage("Evidence must be an array of up to 5 URLs"),

  body("evidence.*")
    .optional()
    .trim()
    .isURL()
    .withMessage("Each evidence item must be a valid URL"),

  validate,
];

// PATCH /api/reports/admin/:id/resolve
export const validateResolveReport = [
  param("id").isUUID(4).withMessage("Report ID must be a valid UUID"),

  body("action")
    .notEmpty()
    .withMessage("Action is required")
    .isIn([
      "NO_ACTION",
      "WARNING_ISSUED",
      "CONTENT_REMOVED",
      "USER_SUSPENDED",
      "USER_BANNED",
    ])
    .withMessage("Invalid action"),

  body("adminNote")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage("Admin note must not exceed 500 characters"),

  validate,
];

// PATCH /api/reports/admin/bulk-dismiss
export const validateBulkDismiss = [
  body("reportIds")
    .isArray({ min: 1, max: 50 })
    .withMessage("reportIds must be an array of 1–50 IDs"),

  body("reportIds.*")
    .isUUID(4)
    .withMessage("Each report ID must be a valid UUID"),

  body("adminNote")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 300 })
    .withMessage("Admin note must not exceed 300 characters"),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// § 9  SEARCH VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

const SEARCH_TYPES = ["workers", "categories", "locations", "suggest"];

// GET /api/search
export const validateSearch = [
  query("q")
    .trim()
    .notEmpty()
    .withMessage("Search query is required")
    .isLength({ min: 2, max: 200 })
    .withMessage("Search query must be 2–200 characters"),

  query("type")
    .optional()
    .isIn(SEARCH_TYPES)
    .withMessage(`Search type must be one of: ${SEARCH_TYPES.join(", ")}`),

  query("minRate")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Min rate must be a positive number"),

  query("maxRate")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Max rate must be a positive number"),

  query("rating")
    .optional()
    .isFloat({ min: 1, max: 5 })
    .withMessage("Rating filter must be 1–5"),

  query("lat")
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage("Latitude must be between -90 and 90"),

  query("lng")
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage("Longitude must be between -180 and 180"),

  query("radius")
    .optional()
    .isFloat({ min: 1, max: 2000 })
    .withMessage("Radius must be 1–2000 km"),

  r.page,
  r.limit,
  validate,
];

// GET /api/search/nearby
export const validateNearby = [
  query("lat")
    .notEmpty()
    .withMessage("Latitude is required")
    .isFloat({ min: -90, max: 90 })
    .withMessage("Latitude must be between -90 and 90"),

  query("lng")
    .notEmpty()
    .withMessage("Longitude is required")
    .isFloat({ min: -180, max: 180 })
    .withMessage("Longitude must be between -180 and 180"),

  query("radius")
    .optional()
    .isFloat({ min: 1, max: 2000 })
    .withMessage("Radius must be 1–2000 km"),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// § 10  MESSAGE VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/messages
export const validateSendMessage = [
  body("receiverId")
    .optional({ nullable: true })
    .trim()
    .isUUID(4)
    .withMessage("Receiver ID must be a valid UUID"),

  body("conversationId")
    .optional({ nullable: true })
    .trim()
    .isUUID(4)
    .withMessage("Conversation ID must be a valid UUID"),

  body("content")
    .trim()
    .notEmpty()
    .withMessage("Message content is required")
    .isLength({ min: 1, max: 5000 })
    .withMessage("Message must be 1–5000 characters"),

  body("bookingId")
    .optional({ nullable: true })
    .trim()
    .isUUID(4)
    .withMessage("Booking ID must be a valid UUID"),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// § 11  DISPUTE VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/disputes
export const validateCreateDispute = [
  body("bookingId")
    .trim()
    .notEmpty()
    .withMessage("Booking ID is required")
    .isUUID(4)
    .withMessage("Booking ID must be a valid UUID"),

  body("reason")
    .trim()
    .notEmpty()
    .withMessage("Dispute reason is required")
    .isLength({ min: 10, max: 500 })
    .withMessage("Reason must be 10–500 characters"),

  body("description")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 3000 })
    .withMessage("Description must not exceed 3000 characters"),

  body("evidence")
    .optional({ nullable: true })
    .isArray({ max: 10 })
    .withMessage("Evidence must be an array of up to 10 URLs"),

  body("evidence.*")
    .optional()
    .trim()
    .isURL()
    .withMessage("Each evidence item must be a valid URL"),

  validate,
];

// PATCH /api/disputes/:bookingId/resolve (admin)
export const validateResolveDispute = [
  param("bookingId").isUUID(4).withMessage("Booking ID must be a valid UUID"),

  body("resolution")
    .notEmpty()
    .withMessage("Resolution is required")
    .isIn(["REFUND", "RELEASE", "SPLIT"])
    .withMessage("Resolution must be REFUND, RELEASE, or SPLIT"),

  body("notes")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage("Notes must not exceed 500 characters"),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// § 12  REFERRAL VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/referral/withdraw
export const validateReferralWithdraw = [
  body("amount")
    .notEmpty()
    .withMessage("Amount is required")
    .isFloat({ min: 500 })
    .withMessage("Minimum withdrawal amount is ₦500"),

  body("bankName")
    .trim()
    .notEmpty()
    .withMessage("Bank name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Bank name must be 2–100 characters"),

  body("accountNumber")
    .trim()
    .notEmpty()
    .withMessage("Account number is required")
    .isLength({ min: 10, max: 10 })
    .withMessage("Account number must be exactly 10 digits")
    .isNumeric()
    .withMessage("Account number must contain only digits"),

  body("accountName")
    .trim()
    .notEmpty()
    .withMessage("Account name is required")
    .isLength({ min: 2, max: 150 })
    .withMessage("Account name must be 2–150 characters"),

  validate,
];

// GET /api/referral/validate/:code
export const validateReferralCode = [
  param("code")
    .trim()
    .notEmpty()
    .withMessage("Referral code is required")
    .isAlphanumeric()
    .withMessage("Referral code must be alphanumeric")
    .isLength({ min: 4, max: 20 })
    .withMessage("Referral code must be 4–20 characters"),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// § 13  CAMPAIGN VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/campaign/my-tasks/social
export const validateSocialFollow = [
  body("platform")
    .notEmpty()
    .withMessage("Platform is required")
    .isIn(["facebook", "instagram", "tiktok"])
    .withMessage("Platform must be facebook, instagram, or tiktok"),

  body("screenshotUrl")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isURL()
    .withMessage("Screenshot must be a valid URL"),

  validate,
];

// POST /api/campaign/withdraw
export const validateCampaignWithdraw = [
  body("amount")
    .notEmpty()
    .withMessage("Amount is required")
    .isFloat({ min: 500 })
    .withMessage("Minimum withdrawal amount is ₦500"),

  body("bankName")
    .trim()
    .notEmpty()
    .withMessage("Bank name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Bank name must be 2–100 characters"),

  body("accountNumber")
    .trim()
    .notEmpty()
    .withMessage("Account number is required")
    .isLength({ min: 10, max: 10 })
    .withMessage("Account number must be exactly 10 digits")
    .isNumeric()
    .withMessage("Account number must contain only digits"),

  body("accountName")
    .trim()
    .notEmpty()
    .withMessage("Account name is required")
    .isLength({ min: 2, max: 150 })
    .withMessage("Account name must be 2–150 characters"),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// § 14  CATEGORY VALIDATORS (admin)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/admin/categories
export const validateCreateCategory = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Category name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be 2–100 characters"),

  body("slug")
    .trim()
    .notEmpty()
    .withMessage("Category slug is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Slug must be 2–100 characters")
    .matches(/^[a-z0-9-]+$/)
    .withMessage(
      "Slug may only contain lowercase letters, numbers, and hyphens",
    ),

  body("description")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage("Description must not exceed 500 characters"),

  body("icon")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 10 })
    .withMessage("Icon must not exceed 10 characters"),

  body("parentId")
    .optional({ nullable: true })
    .trim()
    .isUUID(4)
    .withMessage("Parent category ID must be a valid UUID"),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// § 15  NOTIFICATION VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/admin/broadcast
export const validateBroadcast = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Notification title is required")
    .isLength({ min: 3, max: 100 })
    .withMessage("Title must be 3–100 characters"),

  body("body")
    .trim()
    .notEmpty()
    .withMessage("Notification body is required")
    .isLength({ min: 5, max: 500 })
    .withMessage("Body must be 5–500 characters"),

  body("role")
    .optional({ nullable: true })
    .isIn(["HIRER", "WORKER", "ADMIN"])
    .withMessage("Role must be HIRER, WORKER, or ADMIN"),

  body("userIds")
    .optional({ nullable: true })
    .isArray()
    .withMessage("userIds must be an array"),

  body("userIds.*")
    .optional()
    .isUUID(4)
    .withMessage("Each user ID must be a valid UUID"),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// § 16  COMMON PARAM VALIDATORS (reuse in any route)
// ─────────────────────────────────────────────────────────────────────────────

export const validateUUIDParam = (paramName = "id") => [
  param(paramName)
    .trim()
    .notEmpty()
    .withMessage(`${paramName} is required`)
    .isUUID(4)
    .withMessage(`${paramName} must be a valid UUID`),
  validate,
];

export const validatePagination = [r.page, r.limit, validate];
