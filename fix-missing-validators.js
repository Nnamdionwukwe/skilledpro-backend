#!/usr/bin/env node
// fix-missing-validators.js
// ─────────────────────────────────────────────────────────────────────────────
// Scans every route file, collects every validateXxx import,
// checks which ones are missing from validators.js, and appends them.
//
// Run from project root:  node fix-missing-validators.js
// ─────────────────────────────────────────────────────────────────────────────
import { readFile, writeFile, readdir, copyFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
function findRoot(s) {
  let d = s;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(d, "package.json"))) return d;
    d = dirname(d);
  }
  return s;
}
const ROOT = findRoot(__dirname);
const SRC = join(ROOT, "src");
const VALIDATORS = join(SRC, "utils", "validators.js");
const LINE = "─".repeat(66);

console.log(`\n${LINE}`);
console.log(" Fix Missing Validators");
console.log(LINE);

// ── 1. Read validators.js and get all exported names ─────────────────────────
const valContent = await readFile(VALIDATORS, "utf8");
const exportedNames = new Set(
  [...valContent.matchAll(/^export\s+const\s+(\w+)\s*=/gm)].map((m) => m[1]),
);
console.log(`\n  validators.js exports: ${exportedNames.size} names`);

// ── 2. Scan all route files for validateXxx imports ───────────────────────────
const routesDir = join(SRC, "routes");
const routeFiles = (await readdir(routesDir)).filter(
  (f) => f.endsWith(".js") && !f.endsWith(".bak"),
);

const allImported = new Set();
for (const file of routeFiles) {
  const content = await readFile(join(routesDir, file), "utf8");
  // Strip comments, then find all validate-prefixed identifiers in import blocks
  const cleaned = content
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const imports = [...cleaned.matchAll(/\b(validate[A-Z]\w+)\b/g)].map(
    (m) => m[1],
  );
  imports.forEach((n) => allImported.add(n));
}

// ── 3. Find missing ones ──────────────────────────────────────────────────────
const missing = [...allImported]
  .filter((n) => n !== "validate" && !exportedNames.has(n))
  .sort();

if (missing.length === 0) {
  console.log("\n  ✅  No missing validators — nothing to do.");
  console.log(`\n${LINE}\n`);
  process.exit(0);
}

console.log(`\n  Missing validators (${missing.length}):`);
missing.forEach((n) => console.log(`    • ${n}`));

// ── 4. Definitions for every known missing validator ─────────────────────────
// Add more entries here as needed — safe to have extras (script only appends missing ones)
const DEFINITIONS = {
  // ── Auth ────────────────────────────────────────────────────────────────────
  validateResendVerification: `
// POST /api/auth/resend-verification
export const validateResendVerification = [
  body("email")
    .trim().notEmpty().withMessage("email is required")
    .isEmail().withMessage("Must be a valid email address")
    .normalizeEmail(),
  validate,
];`,

  validateRegister: `
// POST /api/auth/register
export const validateRegister = [
  body("firstName")
    .trim().notEmpty().withMessage("firstName is required")
    .isLength({ min: 2, max: 50 }).withMessage("firstName must be 2–50 characters"),
  body("lastName")
    .trim().notEmpty().withMessage("lastName is required")
    .isLength({ min: 2, max: 50 }).withMessage("lastName must be 2–50 characters"),
  body("email")
    .trim().notEmpty().withMessage("email is required")
    .isEmail().withMessage("Must be a valid email").normalizeEmail(),
  body("password")
    .notEmpty().withMessage("password is required")
    .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
    .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter")
    .matches(/[0-9]/).withMessage("Password must contain at least one number"),
  body("role")
    .optional()
    .isIn(["WORKER","HIRER"]).withMessage("role must be WORKER or HIRER"),
  body("referralCode")
    .optional({ nullable: true, checkFalsy: true })
    .trim().isLength({ max: 20 }),
  validate,
];`,

  validateLogin: `
// POST /api/auth/login
export const validateLogin = [
  body("email")
    .trim().notEmpty().withMessage("email is required")
    .isEmail().withMessage("Must be a valid email").normalizeEmail(),
  body("password")
    .notEmpty().withMessage("password is required"),
  validate,
];`,

  validateForgotPassword: `
// POST /api/auth/forgot-password
export const validateForgotPassword = [
  body("email")
    .trim().notEmpty().withMessage("email is required")
    .isEmail().withMessage("Must be a valid email").normalizeEmail(),
  validate,
];`,

  validateResetPassword: `
// POST /api/auth/reset-password
export const validateResetPassword = [
  body("token")
    .trim().notEmpty().withMessage("Reset token is required"),
  body("password")
    .notEmpty().withMessage("password is required")
    .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
    .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter")
    .matches(/[0-9]/).withMessage("Password must contain at least one number"),
  validate,
];`,

  // ── Settings ────────────────────────────────────────────────────────────────
  validateUpdateProfile: `
// PATCH /api/settings/profile
export const validateUpdateProfile = [
  body("firstName")
    .optional().trim().isLength({ min: 2, max: 50 }).withMessage("firstName must be 2–50 characters"),
  body("lastName")
    .optional().trim().isLength({ min: 2, max: 50 }).withMessage("lastName must be 2–50 characters"),
  body("phone")
    .optional({ nullable: true, checkFalsy: true })
    .trim().isLength({ min: 7, max: 20 }).withMessage("phone must be 7–20 characters"),
  body("city")
    .optional({ nullable: true }).trim().isLength({ max: 60 }),
  body("country")
    .optional({ nullable: true }).trim().isLength({ max: 60 }),
  body("bio")
    .optional({ nullable: true }).trim().isLength({ max: 500 }),
  validate,
];`,

  validateChangePassword: `
// PATCH /api/settings/password
export const validateChangePassword = [
  body("currentPassword")
    .notEmpty().withMessage("Current password is required"),
  body("newPassword")
    .notEmpty().withMessage("New password is required")
    .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
    .matches(/[A-Z]/).withMessage("Must contain at least one uppercase letter")
    .matches(/[0-9]/).withMessage("Must contain at least one number"),
  validate,
];`,

  // ── Payments ─────────────────────────────────────────────────────────────────
  validateInitiatePayment: `
// POST /api/payments/initiate/:bookingId
export const validateInitiatePayment = [
  body("callbackUrl")
    .optional({ nullable: true, checkFalsy: true })
    .trim().isURL().withMessage("callbackUrl must be a valid URL"),
  body("currency")
    .optional().isIn(["NGN","USD","GBP","EUR"])
    .withMessage("currency must be NGN, USD, GBP or EUR"),
  validate,
];`,

  validateBankTransfer: `
// POST /api/payments/bank-transfer/:bookingId
export const validateBankTransfer = [
  body("bankCode")
    .trim().notEmpty().withMessage("bankCode is required")
    .isLength({ min: 3, max: 10 }),
  body("accountNumber")
    .trim().notEmpty().withMessage("accountNumber is required")
    .matches(/^\\d{10}$/).withMessage("accountNumber must be exactly 10 digits"),
  body("accountName")
    .trim().notEmpty().withMessage("accountName is required")
    .isLength({ min: 3, max: 100 }),
  validate,
];`,

  validateInitiateCryptoPayment: `
// POST /api/payments/crypto/:bookingId
export const validateInitiateCryptoPayment = [
  body("currency")
    .notEmpty().withMessage("currency is required")
    .isIn(["USDC","USDT","ETH","BTC"]),
  body("network")
    .optional().isIn(["ERC20","TRC20","BEP20","BITCOIN"]),
  validate,
];`,

  validateRequestWithdrawal: `
// POST /api/payments/withdraw
export const validateRequestWithdrawal = [
  body("amount")
    .notEmpty().withMessage("amount is required")
    .isFloat({ min: 100 }).withMessage("minimum withdrawal is ₦100"),
  body("bankCode")
    .trim().notEmpty().withMessage("bankCode is required"),
  body("accountNumber")
    .trim().notEmpty().withMessage("accountNumber is required")
    .matches(/^\\d{10}$/).withMessage("accountNumber must be exactly 10 digits"),
  body("accountName")
    .trim().notEmpty().withMessage("accountName is required"),
  validate,
];`,

  validateVerifyBankAccount: `
// POST /api/payments/verify-account
export const validateVerifyBankAccount = [
  body("accountNumber")
    .trim().notEmpty().withMessage("accountNumber is required")
    .matches(/^\\d{10}$/).withMessage("accountNumber must be exactly 10 digits"),
  body("bankCode")
    .trim().notEmpty().withMessage("bankCode is required"),
  validate,
];`,

  // ── Reviews ──────────────────────────────────────────────────────────────────
  validateCreateReview: `
// POST /api/reviews
export const validateCreateReview = [
  body("bookingId")
    .notEmpty().withMessage("bookingId is required")
    .isUUID(4).withMessage("bookingId must be a valid UUID"),
  body("rating")
    .notEmpty().withMessage("rating is required")
    .isInt({ min: 1, max: 5 }).withMessage("rating must be 1–5"),
  body("comment")
    .optional({ nullable: true })
    .trim().isLength({ max: 1000 }).withMessage("comment must not exceed 1000 characters"),
  validate,
];`,

  // ── Bookings ─────────────────────────────────────────────────────────────────
  validateCreateBooking: `
// POST /api/bookings
export const validateCreateBooking = [
  body("workerId")
    .notEmpty().withMessage("workerId is required")
    .isUUID(4).withMessage("workerId must be a valid UUID"),
  body("categoryId")
    .notEmpty().withMessage("categoryId is required")
    .isUUID(4).withMessage("categoryId must be a valid UUID"),
  body("title")
    .trim().notEmpty().withMessage("title is required")
    .isLength({ min: 5, max: 200 }).withMessage("title must be 5–200 characters"),
  body("description")
    .optional({ nullable: true })
    .trim().isLength({ max: 2000 }),
  body("agreedRate")
    .notEmpty().withMessage("agreedRate is required")
    .isFloat({ min: 0 }).withMessage("agreedRate must be a positive number"),
  body("scheduledAt")
    .optional({ nullable: true })
    .isISO8601().withMessage("scheduledAt must be a valid date"),
  validate,
];`,

  validateUpdateBookingStatus: `
// PATCH /api/bookings/:id/status
export const validateUpdateBookingStatus = [
  body("status")
    .notEmpty().withMessage("status is required")
    .isIn(["ACCEPTED","REJECTED","CANCELLED","COMPLETED"])
    .withMessage("status must be ACCEPTED, REJECTED, CANCELLED or COMPLETED"),
  validate,
];`,
};

// ── 5. Build the additions string ─────────────────────────────────────────────
let additions =
  "\n// ─────────────────────────────────────────────────────────────────────────────\n";
additions += "// AUTO-ADDED by fix-missing-validators.js\n";
additions +=
  "// ─────────────────────────────────────────────────────────────────────────────\n";

const added = [];
const skipped = [];

for (const name of missing) {
  if (DEFINITIONS[name]) {
    additions += DEFINITIONS[name] + "\n";
    added.push(name);
  } else {
    skipped.push(name);
  }
}

// ── 6. Write ──────────────────────────────────────────────────────────────────
await copyFile(VALIDATORS, `${VALIDATORS}.bak2`);
await writeFile(VALIDATORS, valContent + additions, "utf8");

console.log(`\n  ✅  Added (${added.length}):`);
added.forEach((n) => console.log(`    + ${n}`));

if (skipped.length > 0) {
  console.log(`\n  ⚠️  No definition for (${skipped.length}) — add manually:`);
  skipped.forEach((n) => console.log(`    ? ${n}`));
}

console.log(`\n  Backup: validators.js.bak2`);
console.log(`\n${LINE}`);
console.log(" Done — run:  npm run dev");
console.log(LINE + "\n");
