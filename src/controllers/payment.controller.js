// src/controllers/payment.controller.js
// ─────────────────────────────────────────────────────────────────────────────
// Global multi-provider payment controller for SkilledProz
//
// Payment initiation:
//   NGN              → Paystack (best-in-class for Nigeria)
//   All other FX     → Flutterwave (30+ currencies, 150+ countries)
//
// Withdrawal / payout:
//   NGN (Nigeria)    → Paystack Transfer API
//   Other African    → Flutterwave Transfer API
//   International    → Flutterwave Transfer API
//   Mobile Money     → Flutterwave Transfer API
//   Crypto           → Recorded; admin dispatches off-chain
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";
import prisma from "../config/database.js";
import { asyncHandler } from "../middleware/error.middleware.js";
import { FEE_CONFIG } from "../config/fees.js";
import bcrypt from "bcryptjs";
import {
  convertReferral as _convertReferral,
  getHirerFirstBookingDiscount,
} from "./referral.controller.js";

import { logAdminAction } from "../utils/auditLog.js";
import {
  paginate,
  paginationMeta,
  fullName,
  formatCurrency,
  truncate,
  slugify,
  uniqueRef,
  parseJSON,
  extractIP,
  timeAgo,
  safeUser,
} from "../utils/helpers.js";

const PIN_MAX_ATTEMPTS = 3;
const PIN_LOCKOUT_MINS = 30;
const PIN_DIGITS_RE = /^\d{4}$/;
// ─────────────────────────────────────────────────────────────────────────────
// § 1  CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const FLW_SECRET = process.env.FLUTTERWAVE_SECRET_KEY;
const FLW_BASE = "https://api.flutterwave.com/v3";
const FLW_ENC_KEY = process.env.FLUTTERWAVE_ENCRYPTION_KEY;

const PS_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PS_BASE = "https://api.paystack.co";

const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:5173";

// Currencies handled by Paystack (NGN primary; others via FLW)
const PAYSTACK_CURRENCIES = new Set(["NGN"]);

// African countries whose banks are in Paystack (others via FLW)
const PAYSTACK_COUNTRIES = new Set(["NG"]);

// All supported fiat + stablecoins for display / validation
export const SUPPORTED_CURRENCIES = [
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
export const CRYPTO_CURRENCIES = ["USDC", "USDT", "BTC", "ETH"];

// ─────────────────────────────────────────────────────────────────────────────
// § 2  FLUTTERWAVE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Generic FLW API call
async function flw(method, path, body = null) {
  const res = await fetch(`${FLW_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${FLW_SECRET}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

// Generate a standard Flutterwave payment link
async function flwInitiatePayment({
  txRef,
  amount,
  currency,
  email,
  name,
  bookingId,
  redirectUrl,
}) {
  return flw("POST", "/payments", {
    tx_ref: txRef,
    amount,
    currency,
    redirect_url: redirectUrl,
    customer: { email, name },
    customizations: {
      title: "SkilledProz",
      description: "Secure escrow payment",
      logo: `${CLIENT_URL}/logo.png`,
    },
    meta: { booking_id: bookingId },
  });
}

// Verify a FLW transaction by tx_ref or transaction_id
async function flwVerifyTransaction(transactionId) {
  return flw("GET", `/transactions/${transactionId}/verify`);
}

// Verify via tx_ref (used in redirect callback)
async function flwVerifyByTxRef(txRef) {
  const result = await flw("GET", `/transactions?tx_ref=${txRef}`);
  if (result.status !== "success" || !result.data?.length) return null;
  return result.data[0];
}

// Initiate a bank transfer payout via Flutterwave
async function flwTransfer({
  accountBank,
  accountNumber,
  amount,
  currency,
  narration,
  reference,
  meta,
}) {
  return flw("POST", "/transfers", {
    account_bank: accountBank,
    account_number: accountNumber,
    amount,
    currency,
    narration,
    reference,
    debit_currency: currency,
    callback_url: `${process.env.API_URL ?? "http://localhost:4000"}/api/payments/webhook/flutterwave`,
    ...(meta ? { meta } : {}),
  });
}

// Initiate a mobile money payout via Flutterwave
async function flwMobileTransfer({
  accountNumber,
  amount,
  currency,
  narration,
  reference,
}) {
  return flw("POST", "/transfers", {
    account_bank: currency === "GHS" ? "MTN" : "AIRTEL",
    account_number: accountNumber, // phone number
    amount,
    currency,
    narration,
    reference,
    debit_currency: currency,
  });
}

// List banks for a country via Flutterwave
async function flwGetBanks(countryCode) {
  return flw("GET", `/banks/${countryCode.toUpperCase()}`);
}

// Verify a bank account via Flutterwave
async function flwVerifyAccount(accountNumber, bankCode) {
  return flw("POST", "/accounts/resolve", {
    account_number: accountNumber,
    account_bank: bankCode,
  });
}

// Poll Flutterwave transfer status
async function flwGetTransfer(transferId) {
  return flw("GET", `/transfers/${transferId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3  PAYSTACK HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function ps(method, path, body = null) {
  const res = await fetch(`${PS_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${PS_SECRET}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

async function psInitializePayment({
  email,
  amount,
  reference,
  currency,
  bookingId,
  callbackUrl,
}) {
  return ps("POST", "/transaction/initialize", {
    email,
    amount: Math.round(amount * 100), // kobo
    reference,
    currency,
    callback_url: callbackUrl,
    metadata: {
      booking_id: bookingId,
      cancel_action: `${CLIENT_URL}/bookings/${bookingId}`,
    },
  });
}

async function psVerifyTransaction(reference) {
  return ps("GET", `/transaction/verify/${reference}`);
}

// Create a Paystack Transfer Recipient (required before transfer)
async function psCreateRecipient({ name, accountNumber, bankCode, currency }) {
  return ps("POST", "/transferrecipient", {
    type: "nuban",
    name,
    account_number: accountNumber,
    bank_code: bankCode,
    currency: currency ?? "NGN",
  });
}

// Initiate a Paystack transfer
async function psInitiateTransfer({
  amount,
  recipientCode,
  reason,
  reference,
}) {
  return ps("POST", "/transfer", {
    source: "balance",
    amount: Math.round(amount * 100), // kobo
    recipient: recipientCode,
    reason,
    reference,
  });
}

async function psGetBanks() {
  return ps(
    "GET",
    "/bank?currency=NGN&pay_with_bank_transfer=true&perPage=200",
  );
}

async function psVerifyAccount(accountNumber, bankCode) {
  return ps(
    "GET",
    `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
  );
}

// Enable Paystack OTP for transfers (only needed if not already enabled in dashboard)
async function psEnableTransfers(otp) {
  return ps("POST", "/transfer/enable_otp_finalize", { otp });
}

// ─────────────────────────────────────────────────────────────────────────────
// § 4  ROUTING LOGIC
// ─────────────────────────────────────────────────────────────────────────────

function shouldUsePaystack(currency) {
  return PAYSTACK_CURRENCIES.has((currency ?? "").toUpperCase());
}

function getWithdrawalProvider(countryCode, method) {
  if (method === "crypto") return "crypto";
  if (PAYSTACK_COUNTRIES.has((countryCode ?? "").toUpperCase()))
    return "paystack";
  return "flutterwave";
}

function computeBookingTotal(booking) {
  const rate = booking.agreedRate || 0;
  const unit = booking.estimatedUnit || "hours";
  const hours = booking.estimatedHours;
  const value = booking.estimatedValue
    ? parseFloat(booking.estimatedValue)
    : null;

  let qty = 1;
  if (value && unit !== "custom") {
    qty = value;
  } else if (hours) {
    if (unit === "hours") qty = hours;
    else if (unit === "days") qty = Math.round(hours / 8);
    else if (unit === "weeks") qty = Math.round(hours / 40);
    else if (unit === "months") qty = Math.round(hours / 160);
    else if (unit === "years") qty = Math.round(hours / 1920);
  }

  const subtotal = parseFloat((rate * qty).toFixed(2));
  const platformFee = parseFloat((subtotal * 0.05).toFixed(2));
  const total = parseFloat((subtotal + platformFee).toFixed(2));

  return { subtotal, platformFee, workerPayout: subtotal, total };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5  HIRER — INITIATE BOOKING PAYMENT  (smart routing)
// POST /api/payments/initiate/:bookingId
// ─────────────────────────────────────────────────────────────────────────────
export const initiateBookingPayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const hirerId = req.user.id;
  const { referralAmount = 0 } = req.body; // 👈 read from request

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      hirer: { select: { email: true, firstName: true, lastName: true } },
    },
  });

  if (!booking)
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  if (booking.hirerId !== hirerId)
    return res.status(403).json({ success: false, message: "Forbidden" });
  if (booking.status !== "ACCEPTED")
    return res.status(400).json({
      success: false,
      message: "Booking must be ACCEPTED before payment",
    });

  const latestPayment = await prisma.payment.findFirst({
    where: { bookingId },
    orderBy: { createdAt: "desc" },
  });
  if (latestPayment?.status === "HELD")
    return res
      .status(400)
      .json({ success: false, message: "Payment is already in escrow" });
  if (latestPayment?.status === "RELEASED")
    return res
      .status(400)
      .json({ success: false, message: "Payment has already been released" });

  const currency = (booking.currency ?? "USD").toUpperCase();

  // ── Compute full job value (rate × qty) ─────────────────────────────
  const { subtotal, platformFee, workerPayout, total } =
    computeBookingTotal(booking);

  // ── Apply referral amount from frontend ─────────────────────────────
  const totalAmount = parseFloat(
    Math.max(0, total - referralAmount).toFixed(2),
  );

  const txRef = uniqueRef("PAY");
  const hirerName = `${booking.hirer.firstName} ${booking.hirer.lastName}`;
  const hirerEmail = booking.hirer.email;

  if (shouldUsePaystack(currency)) {
    const callbackUrl = `${CLIENT_URL}/bookings/${bookingId}?payment=ps_ok&reference=${txRef}`;
    const psRes = await psInitializePayment({
      email: hirerEmail,
      amount: totalAmount,
      reference: txRef,
      currency,
      bookingId,
      callbackUrl,
    });

    if (psRes.status !== true) {
      return res
        .status(502)
        .json({ success: false, message: psRes.message ?? "Paystack error" });
    }

    await prisma.payment.create({
      data: {
        bookingId,
        userId: hirerId,
        amount: totalAmount,
        currency,
        platformFee,
        workerPayout,
        status: "PENDING",
        provider: "paystack",
        providerRef: txRef,
        referralDeduct: referralAmount, // 👈 store for audit
      },
    });

    return res.status(200).json({
      success: true,
      message: "Paystack payment initiated",
      data: {
        provider: "paystack",
        paymentUrl: psRes.data.authorization_url,
        reference: txRef,
        amount: totalAmount,
        currency,
        referralDiscount: referralAmount,
      },
    });
  }

  const redirectUrl = `${CLIENT_URL}/bookings/${bookingId}?payment=flw_ok&tx_ref=${txRef}`;
  const flwRes = await flwInitiatePayment({
    txRef,
    amount: totalAmount,
    currency,
    email: hirerEmail,
    name: hirerName,
    bookingId,
    redirectUrl,
  });

  if (flwRes.status !== "success") {
    return res
      .status(502)
      .json({ success: false, message: flwRes.message ?? "Flutterwave error" });
  }

  await prisma.payment.create({
    data: {
      bookingId,
      userId: hirerId,
      amount: totalAmount,
      currency,
      platformFee,
      workerPayout,
      status: "PENDING",
      provider: "flutterwave",
      providerRef: txRef,
      referralDeduct: referralAmount,
    },
  });

  return res.status(200).json({
    success: true,
    message: "Flutterwave payment initiated",
    data: {
      provider: "flutterwave",
      paymentUrl: flwRes.data.link,
      txRef,
      amount: totalAmount,
      currency,
      referralDiscount: referralAmount,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 6  FLUTTERWAVE REDIRECT CALLBACK
// GET /api/payments/verify/flutterwave?tx_ref=...&transaction_id=...&status=...
// ─────────────────────────────────────────────────────────────────────────────
export const verifyFlutterwave = asyncHandler(async (req, res) => {
  const { tx_ref, transaction_id, status } = req.query;

  if (status === "cancelled") {
    return res
      .status(400)
      .json({ success: false, message: "Payment cancelled by user" });
  }

  if (!tx_ref && !transaction_id) {
    return res
      .status(400)
      .json({ success: false, message: "tx_ref or transaction_id required" });
  }

  let txData;
  if (transaction_id) {
    const result = await flwVerifyTransaction(transaction_id);
    txData = result.status === "success" ? result.data : null;
  } else {
    txData = await flwVerifyByTxRef(tx_ref);
  }

  if (!txData || txData.status !== "successful") {
    return res
      .status(400)
      .json({ success: false, message: "Payment not successful" });
  }

  const existing = await prisma.payment.findFirst({
    where: { providerRef: tx_ref ?? txData.tx_ref },
  });
  if (!existing)
    return res
      .status(404)
      .json({ success: false, message: "Payment record not found" });
  if (existing.status === "HELD") {
    return res.status(200).json({
      success: true,
      message: "Payment already verified",
      data: { bookingId: existing.bookingId, status: "HELD" },
    });
  }

  await prisma.payment.update({
    where: { id: existing.id },
    data: { status: "HELD" },
  });
  await prisma.booking.update({
    where: { id: existing.bookingId },
    data: { status: "ACCEPTED" },
  });
  await _notifyPaymentHeld(existing.bookingId);

  return res.status(200).json({
    success: true,
    message: "Payment verified and held in escrow",
    data: { bookingId: existing.bookingId, status: "HELD" },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 7  PAYSTACK REDIRECT CALLBACK
// GET /api/payments/verify/paystack?reference=...
// ─────────────────────────────────────────────────────────────────────────────
export const verifyPaystack = asyncHandler(async (req, res) => {
  const { reference } = req.query;
  if (!reference)
    return res
      .status(400)
      .json({ success: false, message: "Reference required" });

  const result = await psVerifyTransaction(reference);
  if (result.status !== true || result.data?.status !== "success") {
    return res
      .status(400)
      .json({ success: false, message: "Payment not successful" });
  }

  const existing = await prisma.payment.findFirst({
    where: { providerRef: reference },
  });
  if (!existing)
    return res
      .status(404)
      .json({ success: false, message: "Payment record not found" });
  if (existing.status === "HELD") {
    return res.status(200).json({
      success: true,
      message: "Already verified",
      data: { bookingId: existing.bookingId },
    });
  }

  await prisma.payment.update({
    where: { id: existing.id },
    data: { status: "HELD" },
  });
  await prisma.booking.update({
    where: { id: existing.bookingId },
    data: { status: "ACCEPTED" },
  });
  await _notifyPaymentHeld(existing.bookingId);

  return res.status(200).json({
    success: true,
    message: "Payment verified and held in escrow",
    data: { bookingId: existing.bookingId, status: "HELD" },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 8  WEBHOOKS
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/payments/webhook/flutterwave
export const flutterwaveWebhook = asyncHandler(async (req, res) => {
  // Verify signature
  const hash = req.headers["verif-hash"];
  if (hash !== process.env.FLW_WEBHOOK_HASH) {
    return res.status(401).json({ success: false, message: "Unauthorised" });
  }

  const payload = req.body;
  const { event, data } = payload;

  // ── Charge (payment) events ──────────────────────────────────────────────
  if (event === "charge.completed" && data?.status === "successful") {
    const txRef = data.tx_ref;
    const payment = await prisma.payment.findFirst({
      where: { providerRef: txRef },
    });
    if (payment && payment.status !== "HELD") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "HELD" },
      });
      await prisma.booking.update({
        where: { id: payment.bookingId },
        data: { status: "ACCEPTED" },
      });
      await _notifyPaymentHeld(payment.bookingId);
    }
  }

  // ── Transfer (payout) events ─────────────────────────────────────────────
  if (event === "transfer.completed") {
    const ref = data.reference;
    const withdrawal = await prisma.withdrawal.findFirst({
      where: { reference: ref },
    });
    if (withdrawal) {
      await prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: data.status === "SUCCESSFUL" ? "COMPLETED" : "FAILED",
          completedAt: data.status === "SUCCESSFUL" ? new Date() : undefined,
        },
      });
      await prisma.notification.create({
        data: {
          userId: withdrawal.workerId,
          title:
            data.status === "SUCCESSFUL"
              ? "Withdrawal Successful 💸"
              : "Withdrawal Failed",
          body:
            data.status === "SUCCESSFUL"
              ? `Your withdrawal of ${withdrawal.currency} ${withdrawal.amount} has been sent.`
              : "Your withdrawal could not be processed. Contact support.",
          type: "WITHDRAWAL_UPDATE",
          data: { withdrawalId: withdrawal.id, status: data.status },
        },
      });
    }
  }

  res.status(200).json({ received: true });
});

// POST /api/payments/webhook/paystack
export const paystackWebhook = asyncHandler(async (req, res) => {
  // Verify signature
  const expected = crypto
    .createHmac("sha512", PS_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex");
  if (expected !== req.headers["x-paystack-signature"]) {
    return res.status(401).json({ success: false, message: "Unauthorised" });
  }

  const { event, data } = req.body;

  if (event === "charge.success") {
    const ref = data.reference;
    const payment = await prisma.payment.findFirst({
      where: { providerRef: ref },
    });
    if (payment && payment.status !== "HELD") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "HELD" },
      });
      await prisma.booking.update({
        where: { id: payment.bookingId },
        data: { status: "ACCEPTED" },
      });
      await _notifyPaymentHeld(payment.bookingId);
    }
  }

  if (event === "transfer.success" || event === "transfer.failed") {
    const ref = data.reference;
    const withdrawal = await prisma.withdrawal.findFirst({
      where: { reference: ref },
    });
    if (withdrawal) {
      const succeeded = event === "transfer.success";
      await prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: succeeded ? "COMPLETED" : "FAILED",
          completedAt: succeeded ? new Date() : undefined,
        },
      });
      await prisma.notification.create({
        data: {
          userId: withdrawal.workerId,
          title: succeeded ? "Withdrawal Successful 💸" : "Withdrawal Failed",
          body: succeeded
            ? `Your withdrawal of ${withdrawal.currency} ${withdrawal.amount} has been processed.`
            : "Your withdrawal failed. Please contact support.",
          type: "WITHDRAWAL_UPDATE",
        },
      });
    }
  }

  res.status(200).json({ received: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 9  HIRER — RELEASE ESCROW
// POST /api/payments/release/:bookingId
// ─────────────────────────────────────────────────────────────────────────────
export const releasePayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const hirerId = req.user.id;

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking)
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  if (booking.hirerId !== hirerId)
    return res.status(403).json({ success: false, message: "Forbidden" });

  const payment = await prisma.payment.findFirst({
    where: { bookingId, status: "HELD" },
    orderBy: { createdAt: "desc" },
  });
  if (!payment)
    return res
      .status(400)
      .json({ success: false, message: "No payment in escrow" });

  const [updatedPayment] = await Promise.all([
    prisma.payment.update({
      where: { id: payment.id },
      data: { status: "RELEASED", escrowReleasedAt: new Date() },
    }),
    prisma.booking.update({
      where: { id: bookingId },
      data: { status: "COMPLETED", completedAt: new Date() },
    }),
    prisma.workerProfile.update({
      where: { userId: booking.workerId },
      data: { completedJobs: { increment: 1 } },
    }),
    _convertReferral(booking.workerId, payment.amount).catch((err) =>
      console.error("convertReferral (release) error:", err),
    ),
  ]);

  await prisma.notification.create({
    data: {
      userId: booking.workerId,
      title: "Payment Released 🎉",
      body: `Payment for "${booking.title}" has been released to you.`,
      type: "PAYMENT_RELEASED",
      data: { bookingId },
    },
  });

  return res.status(200).json({
    success: true,
    message: "Payment released to worker",
    data: updatedPayment,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 10  REFUND
// POST /api/payments/refund/:bookingId
// ─────────────────────────────────────────────────────────────────────────────
export const refundPayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking)
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  if (req.user.role !== "ADMIN" && booking.hirerId !== req.user.id)
    return res.status(403).json({ success: false, message: "Forbidden" });

  const payment = await prisma.payment.findFirst({
    where: { bookingId, status: { in: ["HELD", "RELEASED"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!payment)
    return res
      .status(400)
      .json({ success: false, message: "No refundable payment found" });

  const updatedPayment = await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "REFUNDED", refundedAt: new Date() },
  });
  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "CANCELLED" },
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: booking.hirerId,
        title: "Refund Issued 💰",
        body: "Your payment has been refunded.",
        type: "PAYMENT_REFUNDED",
        data: { bookingId },
      },
      {
        userId: booking.workerId,
        title: "Booking Cancelled",
        body: "The booking was cancelled and the hirer was refunded.",
        type: "BOOKING_CANCELLED",
        data: { bookingId },
      },
    ],
  });

  return res
    .status(200)
    .json({ success: true, message: "Refund processed", data: updatedPayment });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 11  WORKER — REQUEST WITHDRAWAL
// POST /api/payments/withdraw
//
// Body (bank transfer):
//   { amount, currency, method: "bank_transfer",
//     bankCode, bankName, accountNumber, accountName, country }
//
// Body (mobile money):
//   { amount, currency, method: "mobile_money",
//     mobileNumber, mobileName, mobileProvider, country }
//
// Body (crypto):
//   { amount, currency, method: "crypto",
//     cryptoAddress, cryptoCurrency, cryptoNetwork }
// ─────────────────────────────────────────────────────────────────────────────
export const requestWithdrawal = asyncHandler(async (req, res) => {
  const workerId = req.user.id;
  const {
    pin, // ← NEW: 4-digit withdrawal PIN
    amount,
    currency = "NGN",
    method = "bank_transfer",
    // Bank transfer
    bankCode,
    bankName,
    accountNumber,
    accountName,
    // Mobile money
    mobileNumber,
    mobileName,
    mobileProvider,
    // Crypto
    cryptoAddress,
    cryptoCurrency,
    cryptoNetwork,
    // Country for routing
    country = "NG",
  } = req.body;

  // ── 1. Validate amount ────────────────────────────────────────────────────
  if (!amount || parseFloat(amount) <= 0) {
    return res
      .status(400)
      .json({ success: false, message: "Valid amount required" });
  }

  // ── 2. PIN check ──────────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { id: workerId },
    select: {
      id: true,
      withdrawalPin: true,
      withdrawalPinSet: true,
      withdrawalPinAttempts: true,
      withdrawalPinLockedUntil: true,
    },
  });

  // Enforce PIN is set before any withdrawal
  if (!user.withdrawalPinSet) {
    return res.status(403).json({
      success: false,
      message:
        "You must set a 4-digit withdrawal PIN before withdrawing. POST /api/payments/pin/set",
    });
  }

  if (!pin) {
    return res.status(400).json({
      success: false,
      message: "Withdrawal PIN is required",
    });
  }

  const pinCheck = await _verifyPin(user, pin);

  if (!pinCheck.ok) {
    if (pinCheck.reason === "locked") {
      return res.status(429).json({
        success: false,
        message: `Too many wrong PIN attempts. Try again in ${pinCheck.mins} minute(s).`,
      });
    }
    if (pinCheck.reason === "no_pin") {
      return res.status(403).json({
        success: false,
        message: "No withdrawal PIN set. POST /api/payments/pin/set first.",
      });
    }
    return res.status(401).json({
      success: false,
      message:
        pinCheck.remaining > 0
          ? `Incorrect PIN. ${pinCheck.remaining} attempt(s) remaining before lockout.`
          : "Too many wrong attempts. Account locked for 30 minutes.",
      attemptsRemaining: pinCheck.remaining,
      locked: pinCheck.locked,
    });
  }

  // ── 3. Check available balance ────────────────────────────────────────────
  const [earnedAgg, withdrawnAgg] = await Promise.all([
    prisma.payment.aggregate({
      where: { booking: { workerId }, status: "RELEASED" },
      _sum: { workerPayout: true },
    }),
    prisma.withdrawal.aggregate({
      where: { workerId, status: { in: ["PENDING", "PROCESSING"] } },
      _sum: { amount: true },
    }),
  ]);

  const totalEarned = earnedAgg._sum.workerPayout ?? 0;
  const pendingPayouts = withdrawnAgg._sum.amount ?? 0;
  const available = totalEarned - pendingPayouts;

  if (parseFloat(amount) > available) {
    return res.status(400).json({
      success: false,
      message: `Insufficient balance. Available: ${available.toFixed(2)} ${currency}`,
    });
  }

  // ── 4. Build destination ──────────────────────────────────────────────────
  let destination = "";
  let methodMeta = {};

  if (method === "bank_transfer") {
    if (!accountNumber || !bankCode) {
      return res.status(400).json({
        success: false,
        message: "Bank code and account number required",
      });
    }
    destination = accountNumber;
    methodMeta = { bankCode, bankName, accountNumber, accountName, country };
  } else if (method === "mobile_money") {
    if (!mobileNumber || !mobileProvider) {
      return res.status(400).json({
        success: false,
        message: "Mobile number and provider required",
      });
    }
    destination = mobileNumber;
    methodMeta = { mobileNumber, mobileName, mobileProvider, country };
  } else if (method === "crypto") {
    if (!cryptoAddress || !cryptoCurrency) {
      return res.status(400).json({
        success: false,
        message: "Crypto address and currency required",
      });
    }
    destination = cryptoAddress;
    methodMeta = {
      cryptoAddress,
      cryptoCurrency: cryptoCurrency.toUpperCase(),
      cryptoNetwork: cryptoNetwork ?? "BSC",
    };
  } else {
    return res.status(400).json({
      success: false,
      message: "Invalid method. Use: bank_transfer | mobile_money | crypto",
    });
  }

  const reference = uniqueRef("WD");

  const withdrawal = await prisma.withdrawal.create({
    data: {
      workerId,
      amount: parseFloat(amount),
      currency: currency.toUpperCase(),
      method,
      destination,
      reference,
      status: "PENDING",
      notes: JSON.stringify({
        ...methodMeta,
        requestedAt: new Date().toISOString(),
      }),
    },
  });

  // Notify admins
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      title: "Withdrawal Request 💸",
      body: `Worker requested ${currency.toUpperCase()} ${amount} via ${method.replace("_", " ")} — Ref: ${reference}`,
      type: "WITHDRAWAL_REQUESTED",
      data: { withdrawalId: withdrawal.id, workerId, amount, currency, method },
    })),
  });

  return res.status(201).json({
    success: true,
    message:
      "Withdrawal request submitted. Processing within 1–3 business days.",
    data: { withdrawal },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 12  ADMIN — APPROVE WITHDRAWAL (auto-triggers real payout)
// PATCH /api/admin/withdrawals/:withdrawalId/approve
// ─────────────────────────────────────────────────────────────────────────────
export const approveWithdrawalPayout = asyncHandler(async (req, res) => {
  const { withdrawalId } = req.params;
  const { notes } = req.body;

  const withdrawal = await prisma.withdrawal.findUnique({
    where: { id: withdrawalId },
    include: { worker: true },
  });
  if (!withdrawal)
    return res
      .status(404)
      .json({ success: false, message: "Withdrawal not found" });
  if (withdrawal.status !== "PENDING")
    return res
      .status(400)
      .json({ success: false, message: "Withdrawal is not pending" });

  const meta = _parseMeta(withdrawal.notes);
  const method = withdrawal.method;
  const currency = withdrawal.currency;
  const provider = getWithdrawalProvider(meta.country ?? "NG", method);

  // ── Apply withdrawal fee config (Phase 1 = 0%, worker gets 100%) ─────────
  const { fee: withdrawalFee, netAmount: amount } =
    FEE_CONFIG.computeWithdrawal(parseFloat(withdrawal.amount));

  let transferRef = uniqueRef("TXF");
  let providerData = {};

  try {
    // ── PAYSTACK (NGN bank transfer) ────────────────────────────────────────
    if (provider === "paystack" && method === "bank_transfer") {
      // 1. Create recipient
      const recipientRes = await psCreateRecipient({
        name:
          meta.accountName ??
          `${withdrawal.worker.firstName} ${withdrawal.worker.lastName}`,
        accountNumber: meta.accountNumber,
        bankCode: meta.bankCode,
        currency,
      });

      if (recipientRes.status !== true)
        throw new Error(
          recipientRes.message ?? "Failed to create Paystack recipient",
        );

      const recipientCode = recipientRes.data.recipient_code;

      // 2. Initiate transfer
      const transferRes = await psInitiateTransfer({
        amount,
        recipientCode,
        reason: notes ?? "SkilledProz earnings payout",
        reference: transferRef,
      });

      if (transferRes.status !== true)
        throw new Error(transferRes.message ?? "Paystack transfer failed");

      providerData = {
        provider: "paystack",
        transferCode: transferRes.data.transfer_code,
      };
    }

    // ── FLUTTERWAVE (bank transfer — non-NGN or non-NG) ─────────────────────
    else if (provider === "flutterwave" && method === "bank_transfer") {
      // International transfers need extra meta
      const isInternational = ![
        "NG",
        "GH",
        "KE",
        "ZA",
        "TZ",
        "UG",
        "RW",
        "SN",
        "CI",
        "CM",
      ].includes((meta.country ?? "NG").toUpperCase());

      const flwMeta = isInternational
        ? [
            {
              AccountNumber: meta.accountNumber,
              RoutingNumber: meta.routingNumber ?? "",
              SWIFT: meta.swiftCode ?? "",
              BankName: meta.bankName ?? "",
              BankAddress: meta.bankAddress ?? "",
              BankCity: meta.bankCity ?? "",
              BankCountry: meta.country ?? "",
              BeneficiaryName: meta.accountName ?? withdrawal.worker.firstName,
            },
          ]
        : undefined;

      const transferRes = await flwTransfer({
        accountBank: meta.bankCode,
        accountNumber: meta.accountNumber,
        amount,
        currency,
        narration: notes ?? "SkilledProz earnings payout",
        reference: transferRef,
        meta: flwMeta,
      });

      if (transferRes.status !== "success")
        throw new Error(transferRes.message ?? "Flutterwave transfer failed");

      providerData = {
        provider: "flutterwave",
        transferId: transferRes.data.id,
      };
    }

    // ── FLUTTERWAVE (mobile money) ──────────────────────────────────────────
    else if (provider === "flutterwave" && method === "mobile_money") {
      const transferRes = await flwMobileTransfer({
        accountNumber: meta.mobileNumber,
        amount,
        currency,
        narration: notes ?? "SkilledProz earnings payout",
        reference: transferRef,
      });

      if (transferRes.status !== "success")
        throw new Error(transferRes.message ?? "Mobile money transfer failed");

      providerData = {
        provider: "flutterwave",
        transferId: transferRes.data.id,
      };
    }

    // ── CRYPTO — mark as processing, admin completes off-chain ─────────────
    else if (method === "crypto") {
      // Crypto is manually processed (or via a crypto gateway)
      providerData = {
        provider: "crypto",
        cryptoAddress: meta.cryptoAddress,
        cryptoCurrency: meta.cryptoCurrency,
        cryptoNetwork: meta.cryptoNetwork,
        note: "Admin must send crypto manually and update to COMPLETED",
      };
    }

    // ── Update withdrawal to PROCESSING ─────────────────────────────────────
    await prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: {
        status: method === "crypto" ? "PROCESSING" : "PROCESSING",
        processedAt: new Date(),
        notes: JSON.stringify({
          ...meta,
          ...providerData,
          approvedAt: new Date().toISOString(),
          adminNotes: notes,
          withdrawalFee,
          netPayout: amount,
        }),
      },
    });

    await prisma.notification.create({
      data: {
        userId: withdrawal.workerId,
        title: "Withdrawal Processing 🚀",
        body:
          method === "crypto"
            ? `Your crypto withdrawal is being processed. Address: ${meta.cryptoAddress}`
            : `Your withdrawal of ${currency} ${withdrawal.amount}${withdrawalFee > 0 ? ` (net: ${currency} ${amount} after ${currency} ${withdrawalFee} fee)` : " (no fee deducted)"} is being sent to your ${method === "mobile_money" ? "mobile" : "bank"} account.`,
        type: "WITHDRAWAL_PROCESSING",
        data: { withdrawalId, method, amount, currency },
      },
    });

    return res.status(200).json({
      success: true,
      message:
        method === "crypto"
          ? "Crypto withdrawal marked as processing. Complete the on-chain transfer."
          : "Payout initiated successfully",
      data: { withdrawalId, transferRef, ...providerData },
    });
  } catch (err) {
    // Mark as failed if provider errored
    await prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: {
        notes: JSON.stringify({
          ...meta,
          error: err.message,
          failedAt: new Date().toISOString(),
        }),
      },
    });
    return res
      .status(502)
      .json({ success: false, message: `Payout failed: ${err.message}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// § 13  WORKER — GET WITHDRAWALS + LIVE BALANCE
// GET /api/payments/withdrawals
// ─────────────────────────────────────────────────────────────────────────────
export const getWithdrawals = asyncHandler(async (req, res) => {
  const workerId = req.user.id;
  const { page = 1, limit = 15 } = req.query;
  const { skip, take } = paginate(page, limit);

  const [earnedAgg, escrowAgg, pendingAgg, withdrawals, total] =
    await Promise.all([
      prisma.payment.aggregate({
        where: { booking: { workerId }, status: "RELEASED" },
        _sum: { workerPayout: true },
      }),
      prisma.payment.aggregate({
        where: { booking: { workerId }, status: "HELD" },
        _sum: { workerPayout: true },
      }),
      prisma.withdrawal.aggregate({
        where: { workerId, status: { in: ["PENDING", "PROCESSING"] } },
        _sum: { amount: true },
      }),
      prisma.withdrawal.findMany({
        where: { workerId },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.withdrawal.count({ where: { workerId } }),
    ]);

  const totalEarned = earnedAgg._sum.workerPayout ?? 0;
  const inEscrow = escrowAgg._sum.workerPayout ?? 0;
  const pendingPayout = pendingAgg._sum.amount ?? 0;
  const available = Math.max(0, totalEarned - pendingPayout);

  // Parse notes back for display
  const parsed = withdrawals.map((w) => ({
    ...w,
    meta: _parseMeta(w.notes),
  }));

  return res.status(200).json({
    success: true,
    data: {
      balance: {
        available,
        totalEarned,
        inEscrow,
        pendingPayout,
        // Fee config — frontend renders dynamically from these, never hardcodes
        withdrawalFeeRate: FEE_CONFIG.WITHDRAWAL_FEE_RATE, // 0 in Phase 1
        withdrawalFeeCap: FEE_CONFIG.WITHDRAWAL_FEE_CAP,
        workerFeeRate: FEE_CONFIG.WORKER_FEE_RATE, // 0 in Phase 1
        hirerFeeRate: FEE_CONFIG.HIRER_FEE_RATE, // 0.05
        feePhase: FEE_CONFIG.phase,
      },
      withdrawals: parsed,
      total,
      page: Number(page),
      pages: Math.ceil(total / take),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 14  WORKER — EARNINGS
// GET /api/payments/earnings
// ─────────────────────────────────────────────────────────────────────────────
export const getWorkerEarnings = asyncHandler(async (req, res) => {
  const workerId = req.user.id;
  const { from, to, currency, page = 1, limit = 20 } = req.query;
  const { skip, take } = paginate(page, limit);

  const where = {
    booking: { workerId },
    status: "RELEASED",
    ...(currency && currency !== "ALL"
      ? { currency: currency.toUpperCase() }
      : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  };

  const [payments, total, aggregate, usedCurrencies] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        booking: {
          select: {
            title: true,
            scheduledAt: true,
            currency: true,
            category: { select: { name: true, icon: true } },
            hirer: {
              select: { firstName: true, lastName: true, avatar: true },
            },
          },
        },
      },
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({
      where,
      _sum: { workerPayout: true, amount: true, platformFee: true },
    }),
    prisma.payment.findMany({
      where: { booking: { workerId }, status: "RELEASED" },
      select: { currency: true },
      distinct: ["currency"],
    }),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      payments,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / take),
      summary: {
        totalEarned: aggregate._sum.workerPayout ?? 0,
        totalJobValue: aggregate._sum.amount ?? 0,
        totalFees: aggregate._sum.platformFee ?? 0,
      },
      availableCurrencies: usedCurrencies.map((c) => c.currency),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 15  HIRER — PAYMENT HISTORY
// GET /api/payments/hirer
// ─────────────────────────────────────────────────────────────────────────────
export const getHirerPayments = asyncHandler(async (req, res) => {
  const hirerId = req.user.id;
  const { status, currency, page = 1, limit = 10 } = req.query;
  const { skip, take } = paginate(page, limit);

  const where = {
    booking: { hirerId },
    ...(status && status !== "ALL" ? { status } : {}),
    ...(currency && currency !== "ALL"
      ? { currency: currency.toUpperCase() }
      : {}),
  };

  const [
    payments,
    total,
    totalSpentAgg,
    inEscrowAgg,
    refundedAgg,
    usedCurrencies,
  ] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        booking: {
          select: {
            id: true,
            title: true,
            status: true,
            scheduledAt: true,
            completedAt: true,
            currency: true,
            category: { select: { name: true } },
            worker: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                avatar: true,
              },
            },
            hirer: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({
      where: { booking: { hirerId }, status: "RELEASED" },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { booking: { hirerId }, status: "HELD" },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { booking: { hirerId }, status: "REFUNDED" },
      _sum: { amount: true },
    }),
    prisma.payment.findMany({
      where: { booking: { hirerId } },
      select: { currency: true },
      distinct: ["currency"],
    }),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      payments,
      total,
      page: Number(page),
      pages: Math.ceil(total / take),
      summary: {
        totalSpent: totalSpentAgg._sum.amount ?? 0,
        inEscrow: inEscrowAgg._sum.amount ?? 0,
        totalRefunds: refundedAgg._sum.amount ?? 0,
      },
      availableCurrencies: usedCurrencies.map((c) => c.currency),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 16  UTILITY — GET BANKS BY COUNTRY
// GET /api/payments/banks?country=NG
// ─────────────────────────────────────────────────────────────────────────────
export const getBanksByCountry = asyncHandler(async (req, res) => {
  const { country = "NG" } = req.query;
  const code = country.toUpperCase();

  let banks = [];

  if (code === "NG") {
    // Paystack has the most comprehensive Nigerian bank list
    const psRes = await psGetBanks();
    if (psRes.status === true && Array.isArray(psRes.data)) {
      banks = psRes.data.map((b) => ({
        name: b.name,
        code: b.code,
        country: "NG",
        currency: "NGN",
        provider: "paystack",
      }));
    }
  } else {
    // Use Flutterwave for all other countries
    const flwRes = await flwGetBanks(code);
    if (flwRes.status === "success" && Array.isArray(flwRes.data)) {
      banks = flwRes.data.map((b) => ({
        name: b.name,
        code: b.code,
        country: code,
        currency: b.currency,
        provider: "flutterwave",
      }));
    }
  }

  return res
    .status(200)
    .json({ success: true, data: { country: code, banks } });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 17  UTILITY — VERIFY BANK ACCOUNT
// POST /api/payments/verify-account
// Body: { accountNumber, bankCode, country }
// ─────────────────────────────────────────────────────────────────────────────
export const verifyBankAccount = asyncHandler(async (req, res) => {
  const { accountNumber, bankCode, country = "NG" } = req.body;

  if (!accountNumber || !bankCode)
    return res.status(400).json({
      success: false,
      message: "Account number and bank code required",
    });

  let accountName = null;

  if (country.toUpperCase() === "NG") {
    const psRes = await psVerifyAccount(accountNumber, bankCode);
    if (psRes.status === true && psRes.data?.account_name) {
      accountName = psRes.data.account_name;
    } else {
      // Fallback to Flutterwave
      const flwRes = await flwVerifyAccount(accountNumber, bankCode);
      if (flwRes.status === "success") accountName = flwRes.data?.account_name;
    }
  } else {
    const flwRes = await flwVerifyAccount(accountNumber, bankCode);
    if (flwRes.status === "success") accountName = flwRes.data?.account_name;
  }

  if (!accountName)
    return res.status(404).json({
      success: false,
      message: "Account not found or could not be verified",
    });

  return res
    .status(200)
    .json({ success: true, data: { accountNumber, bankCode, accountName } });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 18  MANUAL — BANK TRANSFER (hirer sends manually, admin verifies)
// ─────────────────────────────────────────────────────────────────────────────
export const initiateBankTransfer = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { referralAmount = 0 } = req.body; // 👈 read from request

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking)
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  if (booking.hirerId !== req.user.id)
    return res.status(403).json({ success: false, message: "Forbidden" });
  if (booking.status !== "ACCEPTED")
    return res
      .status(400)
      .json({ success: false, message: "Booking must be ACCEPTED" });

  const latestPayment = await prisma.payment.findFirst({
    where: { bookingId },
    orderBy: { createdAt: "desc" },
  });
  if (["HELD", "RELEASED"].includes(latestPayment?.status))
    return res
      .status(400)
      .json({ success: false, message: "Payment already completed" });

  // ── Compute full job value ────────────────────────────────────────────
  const { subtotal, platformFee, workerPayout, total } =
    computeBookingTotal(booking);

  // ── Apply referral amount from frontend ─────────────────────────────
  const totalCharged = parseFloat(
    Math.max(0, total - referralAmount).toFixed(2),
  );

  const reference = uniqueRef("BT");

  return res.status(200).json({
    success: true,
    message: "Send the exact amount below, then click 'I have transferred'.",
    data: {
      reference,
      platformFee,
      workerPayout,
      referralDiscount: referralAmount,
      totalToSend: totalCharged,
      totalGross: total,
      bankDetails: {
        bankName: process.env.PLATFORM_BANK_NAME ?? "First Bank",
        accountNumber: process.env.PLATFORM_ACCOUNT_NUMBER ?? "0123456789",
        accountName: process.env.PLATFORM_ACCOUNT_NAME ?? "SkilledProz Ltd",
        amount: totalCharged,
        currency: booking.currency,
        narration: `SkilledProz booking ${bookingId} — Ref: ${reference}`,
      },
    },
  });
});

export const confirmBankTransfer = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { proofUrl: proofUrlBody, senderName, bankName } = req.body;
  const reference = req.body.reference || uniqueRef("BT");
  const proofUrl = req.file?.path || proofUrlBody || null;

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking)
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  if (booking.hirerId !== req.user.id)
    return res.status(403).json({ success: false, message: "Forbidden" });

  // Block only if payment already succeeded
  const latestPayment = await prisma.payment.findFirst({
    where: { bookingId },
    orderBy: { createdAt: "desc" },
  });
  if (["HELD", "RELEASED"].includes(latestPayment?.status))
    return res
      .status(400)
      .json({ success: false, message: "Payment already completed" });

  // Always create a NEW payment record — preserves full retry history
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
  const chargedAmount = parseFloat(
    (totalToSend - referralDiscountBank).toFixed(2),
  );

  const payment = await prisma.payment.create({
    data: {
      bookingId,
      userId: req.user.id,
      amount: chargedAmount,
      currency: booking.currency,
      platformFee,
      workerPayout,
      status: "PENDING",
      provider: "bank_transfer",
      providerRef: reference,
      bankTransferProof: proofUrl ?? null,
      accountName: senderName ?? null,
      bankName: bankName ?? null,
    },
  });

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      title: "Bank Transfer Submitted 🏦",
      body: `Hirer confirmed bank transfer for booking ${bookingId}. Ref: ${reference}`,
      type: "BANK_TRANSFER_PROOF",
      data: { bookingId, paymentId: payment.id, proofUrl, reference },
    })),
  });

  return res.status(201).json({
    success: true,
    message: "Transfer confirmed. We'll verify and activate within 1–2 hours.",
    data: { payment },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 19  MANUAL — CRYPTO PAYMENT
// ─────────────────────────────────────────────────────────────────────────────
const CRYPTO_WALLETS = {
  USDC: {
    network: "BSC (BEP20)",
    address: process.env.CRYPTO_WALLET_USDC ?? "0xPLACEHOLDER",
  },
  USDT: {
    network: "BSC (BEP20)",
    address: process.env.CRYPTO_WALLET_USDT ?? "0xPLACEHOLDER",
  },
  BTC: {
    network: "Bitcoin",
    address: process.env.CRYPTO_WALLET_BTC ?? "bc1qPLACEHOLDER",
  },
  ETH: {
    network: "BSC (BEP20)",
    address: process.env.CRYPTO_WALLET_ETH ?? "0xPLACEHOLDER",
  },
};

export const initiateCryptoPayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { cryptoCurrency = "USDC", referralAmount = 0 } = req.body; // 👈 read referralAmount

  const wallet = CRYPTO_WALLETS[cryptoCurrency.toUpperCase()];
  if (!wallet)
    return res.status(400).json({
      success: false,
      message: `Unsupported crypto: ${cryptoCurrency}`,
    });

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!booking)
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  if (booking.hirerId !== req.user.id)
    return res.status(403).json({ success: false, message: "Forbidden" });
  if (["HELD", "RELEASED"].includes(booking.payments?.[0]?.status))
    return res
      .status(400)
      .json({ success: false, message: "Payment already completed" });
  if (booking.status !== "ACCEPTED")
    return res
      .status(400)
      .json({ success: false, message: "Booking must be ACCEPTED" });

  // ── Compute full job value ────────────────────────────────────────────
  const { subtotal, platformFee, workerPayout, total } =
    computeBookingTotal(booking);

  // ── Apply referral amount from frontend ─────────────────────────────
  const totalChargedCrypto = parseFloat(
    Math.max(0, total - referralAmount).toFixed(2),
  );

  const reference = uniqueRef("CRYPTO");

  return res.status(200).json({
    success: true,
    message: "Send the exact amount below, then click 'I have transferred'.",
    data: {
      reference,
      platformFee,
      workerPayout,
      referralDiscount: referralAmount,
      totalToSend: totalChargedCrypto,
      totalGross: total,
      cryptoDetails: {
        currency: cryptoCurrency.toUpperCase(),
        network: wallet.network,
        wallet: wallet.address,
        amount: total,
        note: `Include reference ${reference} in transaction memo`,
      },
    },
  });
});

export const confirmCryptoPayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { txHash, cryptoAmount, cryptoCurrency } = req.body;
  const reference = req.body.reference || uniqueRef("CRYPTO");
  const proofUrl = req.file?.path || null;

  if (!txHash)
    return res
      .status(400)
      .json({ success: false, message: "Transaction hash required" });

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking)
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  if (booking.hirerId !== req.user.id)
    return res.status(403).json({ success: false, message: "Forbidden" });

  // Block only if payment already succeeded
  const latestPayment = await prisma.payment.findFirst({
    where: { bookingId },
    orderBy: { createdAt: "desc" },
  });
  if (["HELD", "RELEASED"].includes(latestPayment?.status))
    return res
      .status(400)
      .json({ success: false, message: "Payment already completed" });

  const wallet =
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
      amount: chargedAmountCrypto,
      currency: booking.currency,
      platformFee,
      workerPayout,
      status: "PENDING",
      provider: "crypto",
      providerRef: reference,
      cryptoNetwork: wallet.network,
      cryptoWallet: wallet.address,
      cryptoCurrency: (cryptoCurrency ?? "USDC").toUpperCase(),
      cryptoTxHash: txHash,
      cryptoAmount: cryptoAmount ? parseFloat(cryptoAmount) : null,
      bankTransferProof: proofUrl, // screenshot stored here
    },
  });

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      title: "Crypto TX Submitted ₿",
      body: `Hirer submitted crypto tx for booking ${bookingId}. Hash: ${txHash}`,
      type: "CRYPTO_TX_SUBMITTED",
      data: { bookingId, txHash, cryptoCurrency, cryptoAmount, reference },
    })),
  });

  return res.status(201).json({
    success: true,
    message: "Transaction submitted. Verification within 30 minutes.",
    data: { payment },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 20  ADMIN — ALL PAYMENTS
// GET /api/payments/
// ─────────────────────────────────────────────────────────────────────────────
export const getAllPayments = asyncHandler(async (req, res) => {
  const { status, provider, currency, page = 1, limit = 20 } = req.query;
  const { skip, take } = paginate(page, limit);

  const where = {
    ...(status && { status }),
    ...(provider && { provider }),
    ...(currency && currency !== "ALL"
      ? { currency: currency.toUpperCase() }
      : {}),
  };

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        booking: {
          include: {
            hirer: { select: { firstName: true, lastName: true, email: true } },
            worker: {
              select: { firstName: true, lastName: true, email: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.payment.count({ where }),
  ]);

  return res.status(200).json({
    success: true,
    data: payments,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / take),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 21  SINGLE BOOKING PAYMENT
// GET /api/payments/:bookingId
// ─────────────────────────────────────────────────────────────────────────────
export const getPayment = asyncHandler(async (req, res) => {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.bookingId },
  });
  if (!booking)
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  if (
    booking.hirerId !== req.user.id &&
    booking.workerId !== req.user.id &&
    req.user.role !== "ADMIN"
  )
    return res.status(403).json({ success: false, message: "Forbidden" });

  // Return most recent non-failed payment; fallback to most recent overall
  const payment = await prisma.payment.findFirst({
    where: { bookingId: req.params.bookingId },
    orderBy: [
      { status: "desc" }, // RELEASED > HELD > PENDING > FAILED
      { createdAt: "desc" },
    ],
  });

  return res.status(200).json({ success: true, data: payment });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 22  INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────
async function _notifyPaymentHeld(bookingId) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { workerId: true, hirerId: true, title: true },
  });
  if (!booking) return;
  await prisma.notification.createMany({
    data: [
      {
        userId: booking.workerId,
        title: "Payment Received 💳",
        body: `Payment for "${booking.title}" is held in escrow. You can now check in.`,
        type: "PAYMENT_HELD",
        data: { bookingId },
      },
      {
        userId: booking.hirerId,
        title: "Payment Confirmed ✅",
        body: `Your payment for "${booking.title}" is secured in escrow.`,
        type: "PAYMENT_HELD",
        data: { bookingId },
      },
    ],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// WITHDRAWAL PIN — additions to payment.controller.js
// ─────────────────────────────────────────────────────────────────────────────
// Add this import at the top of payment.controller.js (alongside existing imports):
//
//   import bcrypt from "bcryptjs";
//
// Then add the four exports below anywhere before the final export block.
// Also replace requestWithdrawal with the new version at the bottom.
// ─────────────────────────────────────────────────────────────────────────────

// ── Internal helper — verifies PIN and handles lockout ────────────────────────
async function _verifyPin(user, pin) {
  // Not set yet
  if (!user.withdrawalPinSet || !user.withdrawalPin) {
    return { ok: false, reason: "no_pin" };
  }

  // Locked out?
  if (
    user.withdrawalPinLockedUntil &&
    new Date() < user.withdrawalPinLockedUntil
  ) {
    const mins = Math.ceil(
      (user.withdrawalPinLockedUntil - Date.now()) / 60000,
    );
    return { ok: false, reason: "locked", mins };
  }

  const match = await bcrypt.compare(String(pin), user.withdrawalPin);

  if (!match) {
    const attempts = user.withdrawalPinAttempts + 1;
    const lockedUntil =
      attempts >= PIN_MAX_ATTEMPTS
        ? new Date(Date.now() + PIN_LOCKOUT_MINS * 60000)
        : null;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        withdrawalPinAttempts: attempts,
        withdrawalPinLockedUntil: lockedUntil,
      },
    });

    const remaining = PIN_MAX_ATTEMPTS - attempts;
    return {
      ok: false,
      reason: "wrong_pin",
      remaining: Math.max(0, remaining),
      locked: attempts >= PIN_MAX_ATTEMPTS,
    };
  }

  // Correct — reset attempts
  await prisma.user.update({
    where: { id: user.id },
    data: { withdrawalPinAttempts: 0, withdrawalPinLockedUntil: null },
  });

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// § A  SET WITHDRAWAL PIN (first time)
// POST /api/payments/pin/set
// Body: { pin: "1234" }
// ─────────────────────────────────────────────────────────────────────────────
export const setWithdrawalPin = asyncHandler(async (req, res) => {
  const { pin } = req.body;

  if (!pin || !PIN_DIGITS_RE.test(String(pin))) {
    return res.status(400).json({
      success: false,
      message: "PIN must be exactly 4 digits",
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, withdrawalPinSet: true },
  });

  if (user.withdrawalPinSet) {
    return res.status(400).json({
      success: false,
      message: "PIN already set. Use /pin/change to update it.",
    });
  }

  const hashed = await bcrypt.hash(String(pin), 10);

  await prisma.user.update({
    where: { id: req.user.id },
    data: {
      withdrawalPin: hashed,
      withdrawalPinSet: true,
      withdrawalPinAttempts: 0,
      withdrawalPinLockedUntil: null,
    },
  });

  return res.status(200).json({
    success: true,
    message: "Withdrawal PIN set successfully.",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § B  CHANGE WITHDRAWAL PIN
// POST /api/payments/pin/change
// Body: { currentPin: "1234", newPin: "5678" }
// ─────────────────────────────────────────────────────────────────────────────
export const changeWithdrawalPin = asyncHandler(async (req, res) => {
  const { currentPin, newPin } = req.body;

  if (!newPin || !PIN_DIGITS_RE.test(String(newPin))) {
    return res.status(400).json({
      success: false,
      message: "New PIN must be exactly 4 digits",
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      withdrawalPin: true,
      withdrawalPinSet: true,
      withdrawalPinAttempts: true,
      withdrawalPinLockedUntil: true,
    },
  });

  if (!user.withdrawalPinSet) {
    return res.status(400).json({
      success: false,
      message: "No PIN set yet. Use /pin/set first.",
    });
  }

  const check = await _verifyPin(user, currentPin);
  if (!check.ok) {
    if (check.reason === "locked") {
      return res.status(429).json({
        success: false,
        message: `Too many wrong attempts. Try again in ${check.mins} minute(s).`,
      });
    }
    return res.status(401).json({
      success: false,
      message:
        check.remaining > 0
          ? `Incorrect PIN. ${check.remaining} attempt(s) remaining.`
          : "Account locked for 30 minutes due to too many wrong attempts.",
    });
  }

  if (String(currentPin) === String(newPin)) {
    return res.status(400).json({
      success: false,
      message: "New PIN must be different from current PIN.",
    });
  }

  const hashed = await bcrypt.hash(String(newPin), 10);

  await prisma.user.update({
    where: { id: req.user.id },
    data: {
      withdrawalPin: hashed,
      withdrawalPinAttempts: 0,
      withdrawalPinLockedUntil: null,
    },
  });

  return res.status(200).json({
    success: true,
    message: "Withdrawal PIN changed successfully.",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § C  CHECK PIN STATUS
// GET /api/payments/pin/status
// Returns whether the worker has a PIN set (does NOT expose the PIN)
// ─────────────────────────────────────────────────────────────────────────────
export const getWithdrawalPinStatus = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      withdrawalPinSet: true,
      withdrawalPinAttempts: true,
      withdrawalPinLockedUntil: true,
    },
  });

  const isLocked =
    !!user.withdrawalPinLockedUntil &&
    new Date() < user.withdrawalPinLockedUntil;

  return res.status(200).json({
    success: true,
    data: {
      pinSet: user.withdrawalPinSet,
      isLocked,
      attemptsRemaining: isLocked
        ? 0
        : Math.max(0, PIN_MAX_ATTEMPTS - user.withdrawalPinAttempts),
      lockedUntil: isLocked ? user.withdrawalPinLockedUntil : null,
    },
  });
});

function _parseMeta(notes) {
  try {
    return notes ? JSON.parse(notes) : {};
  } catch {
    return {};
  }
}
