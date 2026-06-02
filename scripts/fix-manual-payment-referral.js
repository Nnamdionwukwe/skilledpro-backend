// scripts/fix-manual-payment-referral.js
// ─────────────────────────────────────────────────────────────────────────────
// Applies 4 patches to src/controllers/payment.controller.js so that
// bank-transfer and crypto manual payments correctly store the referral-
// discounted amount, making the admin panel's referralDiscount badge work.
//
// Run: node scripts/fix-manual-payment-referral.js
// ─────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";

const FILE = path.resolve("src/controllers/payment.controller.js");

if (!fs.existsSync(FILE)) {
  console.error(`❌  File not found: ${FILE}`);
  process.exit(1);
}

let src = fs.readFileSync(FILE, "utf8");
const original = src;

// ─────────────────────────────────────────────────────────────────────────────
// Each patch: [description, exactFindString, replaceString]
// ─────────────────────────────────────────────────────────────────────────────
const PATCHES = [
  // ── PATCH 1: confirmBankTransfer — store discounted amount ──────────────────
  [
    "confirmBankTransfer — apply referral discount to stored amount",
    `  // Always create a NEW payment record — preserves full retry history
  const fees = FEE_CONFIG.compute(booking.agreedRate);
  const {
    platformFeeFromHirer: platformFee,
    totalToHirer: totalToSend,
    workerPayout,
  } = fees;

  const payment = await prisma.payment.create({
    data: {
      bookingId,
      userId: req.user.id,
      amount: totalToSend,
      currency: booking.currency,
      platformFee,
      workerPayout,
      status: "PENDING",
      provider: "bank_transfer",`,
    `  // Always create a NEW payment record — preserves full retry history
  const fees = FEE_CONFIG.compute(booking.agreedRate);
  const {
    platformFeeFromHirer: platformFee,
    totalToHirer: totalToSend,
    workerPayout,
  } = fees;

  // Apply referral discount — workerPayout + platformFee stays at full gross
  // so adminGetManualPayments recovers: referralDiscount = (workerPayout + platformFee) - amount
  const referralDiscountBank = await getHirerFirstBookingDiscount(
    req.user.id,
    booking.agreedRate,
  );
  const chargedAmount = parseFloat((totalToSend - referralDiscountBank).toFixed(2));

  const payment = await prisma.payment.create({
    data: {
      bookingId,
      userId: req.user.id,
      amount: chargedAmount,
      currency: booking.currency,
      platformFee,
      workerPayout,
      status: "PENDING",
      provider: "bank_transfer",`,
  ],

  // ── PATCH 2: confirmCryptoPayment — store discounted amount ─────────────────
  [
    "confirmCryptoPayment — apply referral discount to stored amount",
    `  const wallet =
    CRYPTO_WALLETS[(cryptoCurrency ?? "USDC").toUpperCase()] ??
    CRYPTO_WALLETS.USDC;
  const fees = FEE_CONFIG.compute(booking.agreedRate);
  const {
    platformFeeFromHirer: platformFee,
    totalToHirer: totalToSend,
    workerPayout,
  } = fees;

  // Always create a NEW record — preserves full retry history
  const payment = await prisma.payment.create({
    data: {
      bookingId,
      userId: req.user.id,
      amount: totalToSend,`,
    `  const wallet =
    CRYPTO_WALLETS[(cryptoCurrency ?? "USDC").toUpperCase()] ??
    CRYPTO_WALLETS.USDC;
  const fees = FEE_CONFIG.compute(booking.agreedRate);
  const {
    platformFeeFromHirer: platformFee,
    totalToHirer: totalToSend,
    workerPayout,
  } = fees;

  // Apply referral discount — same logic as bank transfer
  const referralDiscountCrypto = await getHirerFirstBookingDiscount(
    req.user.id,
    booking.agreedRate,
  );
  const chargedAmountCrypto = parseFloat(
    (totalToSend - referralDiscountCrypto).toFixed(2),
  );

  // Always create a NEW record — preserves full retry history
  const payment = await prisma.payment.create({
    data: {
      bookingId,
      userId: req.user.id,
      amount: chargedAmountCrypto,`,
  ],

  // ── PATCH 3: initiateBankTransfer — show discounted preview to hirer ─────────
  [
    "initiateBankTransfer — show discounted amount in preview response",
    `  const fees = FEE_CONFIG.compute(booking.agreedRate);
  const {
    platformFeeFromHirer: platformFee,
    totalToHirer: totalToSend,
    workerPayout,
  } = fees;
  const reference = uniqueRef("BT");

  return res.status(200).json({
    success: true,
    message: "Send the exact amount below, then click 'I have transferred'.",
    data: {
      reference,
      platformFee,
      workerPayout,
      totalToSend,
      bankDetails: {
        bankName: process.env.PLATFORM_BANK_NAME ?? "First Bank",
        accountNumber: process.env.PLATFORM_ACCOUNT_NUMBER ?? "0123456789",
        accountName: process.env.PLATFORM_ACCOUNT_NAME ?? "SkilledProz Ltd",
        amount: totalToSend,`,
    `  const fees = FEE_CONFIG.compute(booking.agreedRate);
  const {
    platformFeeFromHirer: platformFee,
    totalToHirer: totalToSend,
    workerPayout,
  } = fees;
  const referralDiscountPreview = await getHirerFirstBookingDiscount(
    req.user.id,
    booking.agreedRate,
  );
  const totalCharged = parseFloat((totalToSend - referralDiscountPreview).toFixed(2));
  const reference = uniqueRef("BT");

  return res.status(200).json({
    success: true,
    message: "Send the exact amount below, then click 'I have transferred'.",
    data: {
      reference,
      platformFee,
      workerPayout,
      referralDiscount: referralDiscountPreview,
      totalToSend: totalCharged,
      totalGross: totalToSend,
      bankDetails: {
        bankName: process.env.PLATFORM_BANK_NAME ?? "First Bank",
        accountNumber: process.env.PLATFORM_ACCOUNT_NUMBER ?? "0123456789",
        accountName: process.env.PLATFORM_ACCOUNT_NAME ?? "SkilledProz Ltd",
        amount: totalCharged,`,
  ],

  // ── PATCH 4: initiateCryptoPayment — show discounted preview to hirer ────────
  [
    "initiateCryptoPayment — show discounted amount in preview response",
    `  const fees = FEE_CONFIG.compute(booking.agreedRate);
  const {
    platformFeeFromHirer: platformFee,
    totalToHirer: totalToSend,
    workerPayout,
  } = fees;
  const reference = uniqueRef("CRYPTO");

  return res.status(200).json({
    success: true,
    message: "Send the exact amount below, then click 'I have transferred'.",
    data: {
      reference,
      platformFee,
      workerPayout,
      totalToSend,
      cryptoDetails: {`,
    `  const fees = FEE_CONFIG.compute(booking.agreedRate);
  const {
    platformFeeFromHirer: platformFee,
    totalToHirer: totalToSend,
    workerPayout,
  } = fees;
  const referralDiscountCryptoPreview = await getHirerFirstBookingDiscount(
    req.user.id,
    booking.agreedRate,
  );
  const totalChargedCrypto = parseFloat(
    (totalToSend - referralDiscountCryptoPreview).toFixed(2),
  );
  const reference = uniqueRef("CRYPTO");

  return res.status(200).json({
    success: true,
    message: "Send the exact amount below, then click 'I have transferred'.",
    data: {
      reference,
      platformFee,
      workerPayout,
      referralDiscount: referralDiscountCryptoPreview,
      totalToSend: totalChargedCrypto,
      totalGross: totalToSend,
      cryptoDetails: {`,
  ],
];

// ─────────────────────────────────────────────────────────────────────────────
// Apply each patch
// ─────────────────────────────────────────────────────────────────────────────
let allOk = true;

for (const [desc, find, replace] of PATCHES) {
  const count = src.split(find).length - 1;

  if (count === 0) {
    console.log(`⚠️  NOT FOUND (already applied or text differs): ${desc}`);
    allOk = false;
    continue;
  }

  if (count > 1) {
    console.log(`⚠️  AMBIGUOUS (found ${count} times — skipping): ${desc}`);
    allOk = false;
    continue;
  }

  src = src.replace(find, replace);
  console.log(`✅  ${desc}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Write only if something changed
// ─────────────────────────────────────────────────────────────────────────────
if (src === original) {
  console.log("\nℹ️  No changes made — file already up to date.");
  process.exit(0);
}

// Backup original
const backupPath = FILE + ".bak";
fs.writeFileSync(backupPath, original, "utf8");
console.log(`\n📦  Backup saved → ${backupPath}`);

fs.writeFileSync(FILE, src, "utf8");
console.log(`✍️  Patched      → ${FILE}`);

// ─────────────────────────────────────────────────────────────────────────────
// Verify: check getHirerFirstBookingDiscount is called in each target function
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n🔍 Verification:");

const checks = [
  ["confirmBankTransfer", "referralDiscountBank"],
  ["confirmCryptoPayment", "referralDiscountCrypto"],
  ["initiateBankTransfer", "referralDiscountPreview"],
  ["initiateCryptoPayment", "referralDiscountCryptoPreview"],
];

let verifyOk = true;
for (const [fn, varName] of checks) {
  const present = src.includes(varName);
  console.log(`   ${present ? "✅" : "❌"} ${fn} — ${varName}`);
  if (!present) verifyOk = false;
}

if (!verifyOk || !allOk) {
  console.log("\n⚠️  One or more patches may not have applied correctly.");
  console.log("   Check the ⚠️ lines above and apply those patches manually.");
  process.exit(1);
}

console.log("\n🎉 All 4 patches applied. Restart your server and retest.");
