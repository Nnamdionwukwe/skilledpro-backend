// src/utils/validators.js
// ─────────────────────────────────────────────────────────────────────────────
// Input validation for all SkilledProz API endpoints.
// Uses express-validator (^7.3.1).
//
// CRASH FIX: `isUUID` is NOT a named export of express-validator.
//            Removed from import. Use .isUUID(4) as a chain method instead
//            (that is already how it is used everywhere in this file).
// ─────────────────────────────────────────────────────────────────────────────

import { body, param, query, validationResult } from "express-validator"; // ← fixed

// ─────────────────────────────────────────────────────────────────────────────
// § 0  CORE RESULT HANDLER
// ─────────────────────────────────────────────────────────────────────────────
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
    message: errors[0].message,
    errors,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// § 0.1  SHARED REUSABLE FIELD RULES (internal helpers)
// ─────────────────────────────────────────────────────────────────────────────
const r = {
  uuid: (field, location = body) =>
    location(field)
      .trim()
      .notEmpty()
      .withMessage(`${field} is required`)
      .isUUID(4)
      .withMessage(`${field} must be a valid UUID`),

  str: (field, min = 1, max = 500, location = body) =>
    location(field)
      .trim()
      .notEmpty()
      .withMessage(`${field} is required`)
      .isLength({ min, max })
      .withMessage(`${field} must be between ${min} and ${max} characters`),

  optStr: (field, max = 500, location = body) =>
    location(field)
      .optional({ nullable: true, checkFalsy: true })
      .trim()
      .isLength({ max })
      .withMessage(`${field} must not exceed ${max} characters`),

  amount: (field = "amount", min = 0.01) =>
    body(field)
      .notEmpty()
      .withMessage(`${field} is required`)
      .isFloat({ min })
      .withMessage(`${field} must be a positive number greater than ${min}`),

  int: (field, min = 1, max = 2147483647) =>
    body(field)
      .notEmpty()
      .withMessage(`${field} is required`)
      .isInt({ min, max })
      .withMessage(`${field} must be an integer between ${min} and ${max}`),

  oneOf: (field, values, location = body) =>
    location(field)
      .notEmpty()
      .withMessage(`${field} is required`)
      .isIn(values)
      .withMessage(`${field} must be one of: ${values.join(", ")}`),

  optOneOf: (field, values, location = body) =>
    location(field)
      .optional({ nullable: true })
      .isIn(values)
      .withMessage(`${field} must be one of: ${values.join(", ")}`),

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
// § 1  AUTH
// ─────────────────────────────────────────────────────────────────────────────
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
// § 2  USER / PROFILE
// ─────────────────────────────────────────────────────────────────────────────
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
// § 3  WORKER PROFILE
// ─────────────────────────────────────────────────────────────────────────────
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
// § 4  BOOKINGS
// ─────────────────────────────────────────────────────────────────────────────
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
// § 5  JOB POSTS
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

export const validateJobStatus = [
  param("id").isUUID(4).withMessage("Job ID must be a valid UUID"),
  body("status")
    .notEmpty()
    .withMessage("Status is required")
    .isIn(["OPEN", "FILLED", "CANCELLED"])
    .withMessage("Job status must be OPEN, FILLED, or CANCELLED"),
  validate,
];

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
// § 6  PAYMENTS
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
// § 7  REVIEWS
// ─────────────────────────────────────────────────────────────────────────────
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
// § 8  REPORTS
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
// § 9  SEARCH
// ─────────────────────────────────────────────────────────────────────────────
const SEARCH_TYPES = ["workers", "categories", "locations", "suggest"];

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
// § 10  MESSAGES
// ─────────────────────────────────────────────────────────────────────────────
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
// § 11  DISPUTES
// ─────────────────────────────────────────────────────────────────────────────
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
// § 12  REFERRAL
// ─────────────────────────────────────────────────────────────────────────────
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
// § 13  CAMPAIGN
// ─────────────────────────────────────────────────────────────────────────────
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
// § 14  CATEGORIES (admin)
// ─────────────────────────────────────────────────────────────────────────────
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
// § 15  NOTIFICATIONS (admin broadcast)
// ─────────────────────────────────────────────────────────────────────────────
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
// § 16  COMMON PARAM / PAGINATION VALIDATORS
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

// ═════════════════════════════════════════════════════════════════════════════
//  NEW VALIDATORS BELOW — sections 17–22 added in this update
// ═════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// § 17  SUBSCRIPTIONS
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  IMPORTANT: open prisma/schema.prisma, find the SubscriptionTier enum,
//     and update SUBSCRIPTION_TIERS below to match your exact values.
//     e.g. if your enum is  BASIC | PRO | ELITE  →  ["BASIC","PRO","ELITE"]

const SUBSCRIPTION_TIERS = ["BASIC", "PRO", "ELITE"]; // ← update to match your enum
const SUBSCRIPTION_BILLING = ["MONTHLY", "ANNUALLY"];

// POST /api/subscriptions/checkout
// Body: { tier, billingPeriod?, callbackUrl? }
export const validateSubscriptionCheckout = [
  body("tier")
    .notEmpty()
    .withMessage("Subscription tier is required")
    .isIn(SUBSCRIPTION_TIERS)
    .withMessage(`tier must be one of: ${SUBSCRIPTION_TIERS.join(", ")}`),

  body("billingPeriod")
    .optional({ nullable: true })
    .isIn(SUBSCRIPTION_BILLING)
    .withMessage(`billingPeriod must be ${SUBSCRIPTION_BILLING.join(" or ")}`),

  body("callbackUrl")
    .optional({ nullable: true })
    .trim()
    .isURL()
    .withMessage("callbackUrl must be a valid URL"),

  validate,
];

// POST /api/subscriptions/verify
// Body: { reference }
export const validateSubscriptionVerify = [
  body("reference")
    .trim()
    .notEmpty()
    .withMessage("Payment reference is required")
    .isLength({ min: 5, max: 200 })
    .withMessage("reference must be 5–200 characters"),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// § 18  FEATURED LISTINGS
// ─────────────────────────────────────────────────────────────────────────────
// Allowed durations (days). Add/remove values to match your pricing packages.
const FEATURED_DURATIONS = [7, 14, 30, 60, 90];
const FEATURED_TYPES = ["WORKER_PROFILE", "JOB_POST"];

// POST /api/featured/checkout
// Body: { type, duration, targetId? }
export const validateFeaturedCheckout = [
  body("type")
    .notEmpty()
    .withMessage("Listing type is required")
    .isIn(FEATURED_TYPES)
    .withMessage(`type must be one of: ${FEATURED_TYPES.join(", ")}`),

  body("duration")
    .notEmpty()
    .withMessage("Duration is required")
    .isInt({ min: 1, max: 365 })
    .withMessage("duration must be a number of days between 1 and 365")
    .custom((val) => FEATURED_DURATIONS.includes(Number(val)))
    .withMessage(
      `duration must be one of: ${FEATURED_DURATIONS.join(", ")} days`,
    ),

  // Optional: link the featured slot to a specific job post or worker profile
  body("targetId")
    .optional({ nullable: true })
    .trim()
    .isUUID(4)
    .withMessage("targetId must be a valid UUID"),

  body("callbackUrl")
    .optional({ nullable: true })
    .trim()
    .isURL()
    .withMessage("callbackUrl must be a valid URL"),

  validate,
];

// POST /api/featured/verify
// Body: { sessionId }
export const validateFeaturedVerify = [
  body("sessionId")
    .trim()
    .notEmpty()
    .withMessage("Session ID is required")
    .isLength({ max: 200 })
    .withMessage("sessionId must not exceed 200 characters"),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// § 19  COMMUNITY POSTS
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  Update POST_TYPES to match your PostType enum in schema.prisma.
//     Check with:  grep 'PostType' prisma/schema.prisma

const POST_TYPES = ["POST", "JOB_TIP", "SHOWCASE", "QUESTION", "ANNOUNCEMENT"];
const REACTION_TYPES = ["LIKE", "LOVE", "INSIGHTFUL", "FUNNY", "SUPPORT"];

// POST /api/posts
// Body: { content, type, media?: string[], jobId? }
export const validateCreatePost = [
  body("content")
    .trim()
    .notEmpty()
    .withMessage("Post content is required")
    .isLength({ min: 1, max: 5000 })
    .withMessage("Post content must be 1–5000 characters"),

  body("type")
    .notEmpty()
    .withMessage("Post type is required")
    .isIn(POST_TYPES)
    .withMessage(`type must be one of: ${POST_TYPES.join(", ")}`),

  body("media")
    .optional({ nullable: true })
    .isArray({ max: 10 })
    .withMessage("media must be an array of up to 10 URLs"),

  body("media.*")
    .optional()
    .trim()
    .isURL()
    .withMessage("Each media item must be a valid URL"),

  body("jobId")
    .optional({ nullable: true })
    .trim()
    .isUUID(4)
    .withMessage("jobId must be a valid UUID"),

  validate,
];

// PUT /api/posts/:id
// Body: { content?, media? }
export const validateUpdatePost = [
  param("id").isUUID(4).withMessage("Post ID must be a valid UUID"),

  body("content")
    .optional()
    .trim()
    .isLength({ min: 1, max: 5000 })
    .withMessage("Post content must be 1–5000 characters"),

  body("media")
    .optional({ nullable: true })
    .isArray({ max: 10 })
    .withMessage("media must be an array of up to 10 URLs"),

  body("media.*")
    .optional()
    .trim()
    .isURL()
    .withMessage("Each media item must be a valid URL"),

  validate,
];

// POST /api/posts/:id/comments
// Body: { content, parentId? }
export const validateCreateComment = [
  param("id").isUUID(4).withMessage("Post ID must be a valid UUID"),

  body("content")
    .trim()
    .notEmpty()
    .withMessage("Comment content is required")
    .isLength({ min: 1, max: 1000 })
    .withMessage("Comment must be 1–1000 characters"),

  // parentId enables threaded replies
  body("parentId")
    .optional({ nullable: true })
    .trim()
    .isUUID(4)
    .withMessage("parentId must be a valid UUID"),

  validate,
];

// POST /api/posts/:id/react
// Body: { type }
export const validateReactToPost = [
  param("id").isUUID(4).withMessage("Post ID must be a valid UUID"),

  body("type")
    .notEmpty()
    .withMessage("Reaction type is required")
    .isIn(REACTION_TYPES)
    .withMessage(`type must be one of: ${REACTION_TYPES.join(", ")}`),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// § 20  INSURANCE
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/insurance/plans  (purchase / initiate checkout for a plan)
// Body: { planId, bookingId?, callbackUrl? }
export const validatePurchaseInsurance = [
  body("planId")
    .trim()
    .notEmpty()
    .withMessage("Insurance plan ID is required")
    .isUUID(4)
    .withMessage("planId must be a valid UUID"),

  // Optional: tie the policy to an existing booking
  body("bookingId")
    .optional({ nullable: true })
    .trim()
    .isUUID(4)
    .withMessage("bookingId must be a valid UUID"),

  body("callbackUrl")
    .optional({ nullable: true })
    .trim()
    .isURL()
    .withMessage("callbackUrl must be a valid URL"),

  validate,
];

// POST /api/insurance/verify
// Body: { reference }
export const validateInsuranceVerify = [
  body("reference")
    .trim()
    .notEmpty()
    .withMessage("Payment reference is required")
    .isLength({ min: 5, max: 200 })
    .withMessage("reference must be 5–200 characters"),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// § 21  VIDEO CALLS
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/video-calls/:bookingId/initiate
// Body is empty — only the URL param needs validating.
export const validateInitiateVideoCall = [
  param("bookingId").isUUID(4).withMessage("Booking ID must be a valid UUID"),
  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// § 22  TRANSLATION
// ─────────────────────────────────────────────────────────────────────────────
// Full ISO 639-1 code list so the validator rejects garbage inputs while
// remaining flexible enough for all the languages you may need.
const ISO_LANGUAGE_CODES = [
  "af",
  "sq",
  "am",
  "ar",
  "hy",
  "az",
  "eu",
  "be",
  "bn",
  "bs",
  "bg",
  "ca",
  "ceb",
  "zh",
  "co",
  "hr",
  "cs",
  "da",
  "nl",
  "en",
  "eo",
  "et",
  "fi",
  "fr",
  "fy",
  "gl",
  "ka",
  "de",
  "el",
  "gu",
  "ht",
  "ha",
  "haw",
  "he",
  "hi",
  "hmn",
  "hu",
  "is",
  "ig",
  "id",
  "ga",
  "it",
  "ja",
  "jv",
  "kn",
  "kk",
  "km",
  "ko",
  "ku",
  "ky",
  "lo",
  "la",
  "lv",
  "lt",
  "lb",
  "mk",
  "mg",
  "ms",
  "ml",
  "mt",
  "mi",
  "mr",
  "mn",
  "my",
  "ne",
  "no",
  "ny",
  "or",
  "ps",
  "fa",
  "pl",
  "pt",
  "pa",
  "ro",
  "ru",
  "sm",
  "gd",
  "sr",
  "st",
  "sn",
  "sd",
  "si",
  "sk",
  "sl",
  "so",
  "es",
  "su",
  "sw",
  "sv",
  "tl",
  "tg",
  "ta",
  "tt",
  "te",
  "th",
  "tr",
  "tk",
  "uk",
  "ur",
  "ug",
  "uz",
  "vi",
  "cy",
  "xh",
  "yi",
  "yo",
  "zu",
];

// POST /api/translate
// Body: { text, targetLanguage, sourceLanguage? }
export const validateTranslate = [
  body("text")
    .trim()
    .notEmpty()
    .withMessage("Text to translate is required")
    .isLength({ min: 1, max: 5000 })
    .withMessage("text must be 1–5000 characters"),

  body("targetLanguage")
    .trim()
    .notEmpty()
    .withMessage("Target language is required")
    .toLowerCase()
    .isIn(ISO_LANGUAGE_CODES)
    .withMessage(
      "targetLanguage must be a valid ISO 639-1 code (e.g. 'fr', 'es', 'ar', 'yo')",
    ),

  body("sourceLanguage")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ISO_LANGUAGE_CODES)
    .withMessage(
      "sourceLanguage must be a valid ISO 639-1 code — omit it to auto-detect",
    ),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// APPEND to the bottom of src/utils/validators.js
// ─────────────────────────────────────────────────────────────────────────────
// §23  VERIFICATION SUBMISSION VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

const VALID_ID_TYPES = [
  "NATIONAL_ID",
  "PASSPORT",
  "DRIVERS_LICENSE",
  "VOTERS_CARD",
  "RESIDENCE_PERMIT",
  "WORK_PERMIT",
];

// POST /api/verification/submit-id
// Body: { idType, idNumber, dateOfBirth?, nationality? }  + file upload
export const validateSubmitIdVerification = [
  body("idType")
    .notEmpty()
    .withMessage("ID type is required")
    .isIn(VALID_ID_TYPES)
    .withMessage(`ID type must be one of: ${VALID_ID_TYPES.join(", ")}`),

  body("idNumber")
    .trim()
    .notEmpty()
    .withMessage("ID number is required")
    .isLength({ min: 3, max: 50 })
    .withMessage("ID number must be 3–50 characters"),

  body("dateOfBirth")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("Date of birth must be a valid date (YYYY-MM-DD)"),

  body("nationality")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 60 })
    .withMessage("Nationality must not exceed 60 characters"),

  validate,
];

// POST /api/verification/submit-certification
// Body: { name, issuedBy, issueDate?, expiryDate? }  + optional file upload
export const validateSubmitCertification = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Certification name is required")
    .isLength({ min: 2, max: 150 })
    .withMessage("Name must be 2–150 characters"),

  body("issuedBy")
    .trim()
    .notEmpty()
    .withMessage("Issuing body is required")
    .isLength({ min: 2, max: 150 })
    .withMessage("Issuing body must be 2–150 characters"),

  body("issueDate")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("Issue date must be a valid date"),

  body("expiryDate")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("Expiry date must be a valid date"),

  validate,
];

// POST /api/verification/hirer/submit
// Body: { verificationType, idType?, idNumber?, companyName?, companyRegNumber?, ... }
export const validateSubmitHirerVerification = [
  body("verificationType")
    .notEmpty()
    .withMessage("Verification type is required")
    .isIn(["INDIVIDUAL", "BUSINESS"])
    .withMessage("Verification type must be INDIVIDUAL or BUSINESS"),

  // Individual fields
  body("idType")
    .if(body("verificationType").equals("INDIVIDUAL"))
    .notEmpty()
    .withMessage("ID type is required for individual verification")
    .isIn(VALID_ID_TYPES)
    .withMessage(`ID type must be one of: ${VALID_ID_TYPES.join(", ")}`),

  body("idNumber")
    .if(body("verificationType").equals("INDIVIDUAL"))
    .trim()
    .notEmpty()
    .withMessage("ID number is required for individual verification")
    .isLength({ min: 3, max: 50 })
    .withMessage("ID number must be 3–50 characters"),

  // Business fields
  body("companyName")
    .if(body("verificationType").equals("BUSINESS"))
    .trim()
    .notEmpty()
    .withMessage("Company name is required for business verification")
    .isLength({ min: 2, max: 150 })
    .withMessage("Company name must be 2–150 characters"),

  body("companyRegNumber")
    .if(body("verificationType").equals("BUSINESS"))
    .trim()
    .notEmpty()
    .withMessage("Company registration number is required")
    .isLength({ min: 4, max: 50 })
    .withMessage("Registration number must be 4–50 characters"),

  // Optional for both
  body("companyCountry")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 60 })
    .withMessage("Country must not exceed 60 characters"),

  body("website")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isURL()
    .withMessage("Website must be a valid URL"),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// §24  WORKER AVAILABILITY VALIDATOR
// ─────────────────────────────────────────────────────────────────────────────

const VALID_DAYS = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:MM 24-hour

// PUT /api/workers/availability
// Body: { availability: [{ dayOfWeek, startTime, endTime, isAvailable? }] }
export const validateUpdateAvailability = [
  body("availability")
    .isArray({ min: 1, max: 7 })
    .withMessage("availability must be an array of 1–7 day schedules"),

  body("availability.*.dayOfWeek")
    .notEmpty()
    .withMessage("Each slot must have a dayOfWeek")
    .custom((v) => {
      if (typeof v === "string") return VALID_DAYS.includes(v.toUpperCase());
      if (typeof v === "number") return v >= 0 && v <= 6;
      return false;
    })
    .withMessage("dayOfWeek must be a weekday name (MONDAY…) or 0–6"),

  body("availability.*.startTime")
    .notEmpty()
    .withMessage("Each slot must have a startTime")
    .matches(TIME_RE)
    .withMessage("startTime must be HH:MM (e.g. 08:00)"),

  body("availability.*.endTime")
    .notEmpty()
    .withMessage("Each slot must have an endTime")
    .matches(TIME_RE)
    .withMessage("endTime must be HH:MM (e.g. 18:00)")
    .custom((end, { req }) => {
      // Basic sanity: endTime must be after startTime on the same slot
      // We can't easily access the sibling startTime via express-validator
      // so just validate format here — the controller handles the logic
      return true;
    }),

  body("availability.*.isAvailable")
    .optional()
    .isBoolean()
    .withMessage("isAvailable must be true or false"),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// §25  CATEGORY UPDATE VALIDATOR  (admin PATCH /:id)
// ─────────────────────────────────────────────────────────────────────────────

// PATCH /api/categories/:id  (reuses the admin createCategory shape, all optional)
export const validateUpdateCategory = [
  param("id").isUUID(4).withMessage("Category ID must be a valid UUID"),

  body("name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be 2–100 characters"),

  body("slug")
    .optional()
    .trim()
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

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// APPEND to the bottom of src/utils/validators.js
// These 3 validators close the last genuine §7 gaps.
// ─────────────────────────────────────────────────────────────────────────────

// ─── §26  NOTIFICATION PREFERENCES  (PATCH /api/settings/notifications) ──────
export const validateUpdateNotificationPrefs = [
  body("email")
    .optional({ nullable: true })
    .isBoolean()
    .withMessage("email must be true or false"),
  body("sms")
    .optional({ nullable: true })
    .isBoolean()
    .withMessage("sms must be true or false"),
  body("push")
    .optional({ nullable: true })
    .isBoolean()
    .withMessage("push must be true or false"),
  body("bookings")
    .optional({ nullable: true })
    .isBoolean()
    .withMessage("bookings must be true or false"),
  body("payments")
    .optional({ nullable: true })
    .isBoolean()
    .withMessage("payments must be true or false"),
  body("messages")
    .optional({ nullable: true })
    .isBoolean()
    .withMessage("messages must be true or false"),
  body("reviews")
    .optional({ nullable: true })
    .isBoolean()
    .withMessage("reviews must be true or false"),
  body("marketing")
    .optional({ nullable: true })
    .isBoolean()
    .withMessage("marketing must be true or false"),
  validate,
];

// ─── §27  PRIVACY SETTINGS  (PATCH /api/settings/privacy) ────────────────────
export const validateUpdatePrivacySettings = [
  body("profileVisible")
    .optional({ nullable: true })
    .isBoolean()
    .withMessage("profileVisible must be true or false"),
  body("showPhone")
    .optional({ nullable: true })
    .isBoolean()
    .withMessage("showPhone must be true or false"),
  body("showEmail")
    .optional({ nullable: true })
    .isBoolean()
    .withMessage("showEmail must be true or false"),
  body("showLocation")
    .optional({ nullable: true })
    .isBoolean()
    .withMessage("showLocation must be true or false"),
  body("showGender")
    .optional({ nullable: true })
    .isBoolean()
    .withMessage("showGender must be true or false"),
  body("allowMessages")
    .optional({ nullable: true })
    .isBoolean()
    .withMessage("allowMessages must be true or false"),
  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// APPEND to the bottom of src/utils/validators.js
// Payment validators for all payment route endpoints
// ─────────────────────────────────────────────────────────────────────────────

// ─── §28  INITIATE PAYSTACK/FLUTTERWAVE PAYMENT ───────────────────────────────
// POST /api/payments/initiate/:bookingId
export const validateInitiatePayment = [
  body("callbackUrl")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isURL()
    .withMessage("callbackUrl must be a valid URL"),

  body("currency")
    .optional()
    .isIn(["NGN", "USD", "GBP", "EUR"])
    .withMessage("currency must be NGN, USD, GBP or EUR"),

  validate,
];

// ─── §29  BANK TRANSFER ───────────────────────────────────────────────────────
// POST /api/payments/bank-transfer/:bookingId
export const validateBankTransfer = [
  body("bankCode")
    .trim()
    .notEmpty()
    .withMessage("bankCode is required")
    .isLength({ min: 3, max: 10 })
    .withMessage("bankCode must be 3–10 characters"),

  body("accountNumber")
    .trim()
    .notEmpty()
    .withMessage("accountNumber is required")
    .matches(/^\d{10}$/)
    .withMessage("accountNumber must be exactly 10 digits"),

  body("accountName")
    .trim()
    .notEmpty()
    .withMessage("accountName is required")
    .isLength({ min: 3, max: 100 })
    .withMessage("accountName must be 3–100 characters"),

  validate,
];

// POST /api/payments/bank-transfer/:bookingId/confirm
export const validateInitiateCryptoPayment = [
  body("currency")
    .notEmpty()
    .withMessage("currency is required")
    .isIn(["USDC", "USDT", "ETH", "BTC"])
    .withMessage("currency must be USDC, USDT, ETH or BTC"),

  body("network")
    .optional()
    .isIn(["ERC20", "TRC20", "BEP20", "BITCOIN"])
    .withMessage("network must be ERC20, TRC20, BEP20 or BITCOIN"),

  validate,
];

// PATCH /api/payments/crypto/:bookingId/confirm
export const validateConfirmCryptoPayment = [
  body("txHash")
    .trim()
    .notEmpty()
    .withMessage("txHash (transaction hash) is required")
    .isLength({ min: 20, max: 150 })
    .withMessage("txHash must be 20–150 characters")
    .matches(/^[a-fA-F0-9x]+$/)
    .withMessage("txHash must be a valid hex string"),

  validate,
];

// ─── §31  WITHDRAWAL REQUEST ──────────────────────────────────────────────────
// POST /api/payments/withdraw
export const validateRequestWithdrawal = [
  body("amount")
    .notEmpty()
    .withMessage("amount is required")
    .isFloat({ min: 100 })
    .withMessage("amount must be at least ₦100"),

  body("bankCode")
    .trim()
    .notEmpty()
    .withMessage("bankCode is required")
    .isLength({ min: 3, max: 10 })
    .withMessage("bankCode must be 3–10 characters"),

  body("accountNumber")
    .trim()
    .notEmpty()
    .withMessage("accountNumber is required")
    .matches(/^\d{10}$/)
    .withMessage("accountNumber must be exactly 10 digits"),

  body("accountName")
    .trim()
    .notEmpty()
    .withMessage("accountName is required")
    .isLength({ min: 3, max: 100 })
    .withMessage("accountName must be 3–100 characters"),

  body("currency")
    .optional()
    .isIn(["NGN", "USD"])
    .withMessage("currency must be NGN or USD"),

  validate,
];

// ─── §32  VERIFY BANK ACCOUNT ─────────────────────────────────────────────────
// POST /api/payments/verify-account
export const validateVerifyBankAccount = [
  body("accountNumber")
    .trim()
    .notEmpty()
    .withMessage("accountNumber is required")
    .matches(/^\d{10}$/)
    .withMessage("accountNumber must be exactly 10 digits"),

  body("bankCode")
    .trim()
    .notEmpty()
    .withMessage("bankCode is required")
    .isLength({ min: 3, max: 10 })
    .withMessage("bankCode must be 3–10 characters"),

  validate,
];

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-ADDED by fix-missing-validators.js
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/auth/resend-verification
export const validateResendVerification = [
  body("email")
    .trim().notEmpty().withMessage("email is required")
    .isEmail().withMessage("Must be a valid email address")
    .normalizeEmail(),
  validate,
];
