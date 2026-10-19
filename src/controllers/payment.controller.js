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

import {
  verifyWithdrawalPin,
  PIN_MAX_ATTEMPTS,
  PIN_DIGITS_RE,
} from "../services/pin.service.js";

import {
  releaseEscrow,
  releaseEscrowPartial,
} from "../services/payment.service.js";
import {
  createRefundFromAdmin,
  processRefund,
} from "../services/refund.service.js";

import { createNotification } from "../services/notification.service.js";

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

// ─────────────────────────────────────────────────────────────────────────────
// computeBookingTotal — single source of truth for pricing math.
//
// Job-post bookings (source === "JOB_POST"):
//   agreedRate IS the final amount the hirer picked from the job post.
//   → subtotal = agreedRate (no multiplication by duration)
//
// Negotiated bookings (isNegotiated === true):
//   agreedRate IS the negotiated total.
//   → subtotal = negotiatedRate
//
// Custom unit bookings (estimatedUnit === "custom"):
//   → subtotal = agreedRate × quantity
//
// Direct bookings (everything else):
//   → subtotal = agreedRate × qty   (qty derived from estimatedValue/hours)
//
// The platform fee is read from FEE_CONFIG so changing the fee in one
// place updates every consumer.
// ─────────────────────────────────────────────────────────────────────────────
function computeBookingTotal(booking) {
  const rate = Number(booking.agreedRate) || 0;
  const unit = booking.estimatedUnit || "hours";
  const hours = booking.estimatedHours;
  const value = booking.estimatedValue
    ? parseFloat(booking.estimatedValue)
    : null;
  const quantity = booking.quantity || 1;

  const isJobPostBooking = booking.source === "JOB_POST";
  const isNegotiated = !!(booking.isNegotiated && booking.negotiatedRate);

  let qty = 1;
  let subtotal = 0;

  if (isJobPostBooking) {
    subtotal = parseFloat(rate.toFixed(2));
    if (value && unit !== "custom") qty = value;
    else if (hours) qty = hours;
  } else if (isNegotiated) {
    subtotal =
      parseFloat(Number(booking.negotiatedRate).toFixed(2)) ||
      parseFloat(rate.toFixed(2));
    if (value && unit !== "custom") qty = value;
    else if (hours) qty = hours;
  } else if (unit === "custom") {
    const customQty = quantity || 1;
    subtotal = parseFloat((rate * customQty).toFixed(2));
    qty = customQty;
  } else {
    if (value && unit !== "custom") qty = value;
    else if (hours) {
      if (unit === "hours") qty = hours;
      else if (unit === "days") qty = Math.round(hours / 8);
      else if (unit === "weeks") qty = Math.round(hours / 40);
      else if (unit === "months") qty = Math.round(hours / 160);
      else if (unit === "years") qty = Math.round(hours / 1920);
    }
    subtotal = parseFloat((rate * qty).toFixed(2));
  }

  // Fee math — centralized in FEE_CONFIG so changing the fee rate in
  // one place updates every consumer (pricing, payments, invoices,
  // refunds, emails).
  const platformFee = FEE_CONFIG.computeHirerFee(subtotal);
  const total = FEE_CONFIG.computeGrossTotal(subtotal);

  return {
    subtotal,
    platformFee,
    workerPayout: subtotal,
    total,
    isJobPostBooking,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5  HIRER — INITIATE BOOKING PAYMENT  (smart routing)
// POST /api/payments/initiate/:bookingId
// ─────────────────────────────────────────────────────────────────────────────
export const initiateBookingPayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const hirerId = req.user.id;
  const { referralAmount = 0, callbackUrl: customCallbackUrl } = req.body;

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

  const { subtotal, platformFee, workerPayout, total, isJobPostBooking } =
    computeBookingTotal(booking);

  const totalAmount = parseFloat(
    Math.max(0, total - referralAmount).toFixed(2),
  );

  const txRef = uniqueRef("PAY");
  const hirerName = `${booking.hirer.firstName} ${booking.hirer.lastName}`;
  const hirerEmail = booking.hirer.email;

  // ✅ Define the final destination: the booking detail page
  const finalRedirectUrl =
    customCallbackUrl || `${CLIENT_URL}/bookings/${bookingId}`;

  if (shouldUsePaystack(currency)) {
    // ✅ Pass the absolute redirect URL to Paystack
    const psRes = await psInitializePayment({
      email: hirerEmail,
      amount: totalAmount,
      reference: txRef,
      currency,
      bookingId,
      callbackUrl: finalRedirectUrl,
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
        referralDeduct: referralAmount,
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
        isJobPostBooking,
      },
    });
  }

  // Flutterwave path
  const flwRes = await flwInitiatePayment({
    txRef,
    amount: totalAmount,
    currency,
    email: hirerEmail,
    name: hirerName,
    bookingId,
    redirectUrl: finalRedirectUrl,
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
      isJobPostBooking,
    },
  });
});

// src/controllers/payment.controller.js

// ... (keep all your imports and helper functions above) ...

// ─────────────────────────────────────────────────────────────────────────────
// § 7  PAYSTACK REDIRECT CALLBACK (improved)
// GET /api/payments/verify/paystack?reference=...
// ─────────────────────────────────────────────────────────────────────────────
export const verifyPaystack = asyncHandler(async (req, res) => {
  const { reference } = req.query;
  if (!reference) {
    return res
      .status(400)
      .json({ success: false, message: "Reference required" });
  }

  // 1. Verify with Paystack
  const result = await psVerifyTransaction(reference);
  if (result.status !== true || result.data?.status !== "success") {
    return res
      .status(400)
      .json({ success: false, message: "Payment not successful" });
  }

  // 2. Find the payment record
  const payment = await prisma.payment.findFirst({
    where: { providerRef: reference },
    include: { booking: true }, // ✅ Include booking to check source
  });
  if (!payment) {
    return res
      .status(404)
      .json({ success: false, message: "Payment record not found" });
  }
  if (payment.status === "HELD") {
    return res.status(200).json({
      success: true,
      message: "Already verified",
      data: { bookingId: payment.bookingId, status: "HELD" },
    });
  }

  // 3. Update in a transaction
  try {
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "HELD" },
      });

      await tx.booking.update({
        where: { id: payment.bookingId },
        data: { status: "ACCEPTED" },
      });

      // ✅ Check if this is a retained staff booking and update the cycle
      if (payment.booking?.source === "RETAINED_STAFF") {
        await tx.retainedPayrollCycle.updateMany({
          where: { bookingId: payment.bookingId },
          data: { status: "HELD", paidAt: new Date() },
        });
      }
    });

    await _notifyPaymentHeld(payment.bookingId).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "Payment verified and held in escrow",
      data: {
        bookingId: payment.bookingId,
        paymentStatus: "HELD",
        bookingStatus: "ACCEPTED",
      },
    });
  } catch (error) {
    console.error("Paystack verification transaction failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update payment and booking. Please contact support.",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// § 6  FLUTTERWAVE REDIRECT CALLBACK (improved)
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

  // 1. Verify with Flutterwave
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

  // 2. Find the payment record
  const payment = await prisma.payment.findFirst({
    where: { providerRef: tx_ref ?? txData.tx_ref },
    include: { booking: true }, // ✅ Include booking
  });
  if (!payment) {
    return res
      .status(404)
      .json({ success: false, message: "Payment record not found" });
  }
  if (payment.status === "HELD") {
    return res.status(200).json({
      success: true,
      message: "Already verified",
      data: { bookingId: payment.bookingId, status: "HELD" },
    });
  }

  // 3. Update in a transaction
  try {
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "HELD" },
      });

      await tx.booking.update({
        where: { id: payment.bookingId },
        data: { status: "ACCEPTED" },
      });

      // ✅ Update retained cycle if applicable
      if (payment.booking?.source === "RETAINED_STAFF") {
        await tx.retainedPayrollCycle.updateMany({
          where: { bookingId: payment.bookingId },
          data: { status: "HELD", paidAt: new Date() },
        });
      }
    });

    await _notifyPaymentHeld(payment.bookingId).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "Payment verified and held in escrow",
      data: {
        bookingId: payment.bookingId,
        paymentStatus: "HELD",
        bookingStatus: "ACCEPTED",
      },
    });
  } catch (error) {
    console.error("Flutterwave verification transaction failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update payment and booking. Please contact support.",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// § 8  WEBHOOKS
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// § 6  FLUTTERWAVE REDIRECT CALLBACK (improved)
// GET /api/payments/verify/flutterwave?tx_ref=...&transaction_id=...&status=...
// ─────────────────────────────────────────────────────────────────────────────
export const flutterwaveWebhook = asyncHandler(async (req, res) => {
  const hash = req.headers["verif-hash"];
  if (hash !== process.env.FLW_WEBHOOK_HASH) {
    return res.status(401).json({ success: false, message: "Unauthorised" });
  }

  const payload = req.body;
  const { event, data } = payload;

  if (event === "charge.completed" && data?.status === "successful") {
    const txRef = data.tx_ref;
    const payment = await prisma.payment.findFirst({
      where: { providerRef: txRef },
      include: { booking: true },
    });
    if (payment && payment.status !== "HELD") {
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "HELD" },
        });
        await tx.booking.update({
          where: { id: payment.bookingId },
          data: { status: "ACCEPTED" },
        });
        // ✅ Update retained cycle
        if (payment.booking?.source === "RETAINED_STAFF") {
          await tx.retainedPayrollCycle.updateMany({
            where: { bookingId: payment.bookingId },
            data: { status: "HELD", paidAt: new Date() },
          });
        }
      });
      await _notifyPaymentHeld(payment.bookingId);
    }
  }

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

export const paystackWebhook = asyncHandler(async (req, res) => {
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
      include: { booking: true },
    });
    if (payment && payment.status !== "HELD") {
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "HELD" },
        });
        await tx.booking.update({
          where: { id: payment.bookingId },
          data: { status: "ACCEPTED" },
        });
        // ✅ Update retained cycle
        if (payment.booking?.source === "RETAINED_STAFF") {
          await tx.retainedPayrollCycle.updateMany({
            where: { bookingId: payment.bookingId },
            data: { status: "HELD", paidAt: new Date() },
          });
        }
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
//
// POST /api/payments/release/:bookingId
//   Body: {}                            → release the entire remaining balance
//   Body: { amount: 5000, note: "..." } → release 5000 (partial)
//
// Either path delegates to releaseEscrowPartial, which:
//   • validates amount > 0 and ≤ remaining
//   • appends a PaymentRelease row
//   • bumps releasedAmount / releaseCount
//   • flips status → RELEASED only when 100% has been released
//
// The booking status is NEVER touched here. A partially-released booking
// stays IN_PROGRESS or COMPLETED depending on where the worker is.
// ─────────────────────────────────────────────────────────────────────────────
export const releasePayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const hirerId = req.user.id;
  const { amount, note } = req.body || {};

  // ── Authorize ────────────────────────────────────────────────────────────
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking)
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  if (booking.hirerId !== hirerId)
    return res.status(403).json({ success: false, message: "Forbidden" });

  // ── Find the HELD payment that still has unreleased balance ─────────────
  const payment = await prisma.payment.findFirst({
    where: {
      bookingId,
      status: "HELD",
    },
    orderBy: { createdAt: "desc" },
  });
  if (!payment)
    return res
      .status(400)
      .json({ success: false, message: "No payment in escrow" });

  const workerPayout = Number(payment.workerPayout) || 0;
  const alreadyReleased = Number(payment.releasedAmount) || 0;
  const remaining = parseFloat((workerPayout - alreadyReleased).toFixed(2));

  if (remaining <= 0) {
    return res.status(400).json({
      success: false,
      message: "This payment has already been fully released",
    });
  }

  // ── Resolve the release amount ──────────────────────────────────────────
  //   • no amount in body → release the entire remaining balance
  //   • amount in body    → validate and release that slice
  let releaseAmount;
  if (amount === undefined || amount === null || amount === "") {
    releaseAmount = remaining;
  } else {
    releaseAmount = Number(amount);
    if (!Number.isFinite(releaseAmount) || releaseAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a positive number",
      });
    }
    if (releaseAmount > remaining) {
      return res.status(400).json({
        success: false,
        message: `Amount exceeds remaining escrow (${remaining} ${payment.currency})`,
      });
    }
  }

  // ── Delegate to the service ─────────────────────────────────────────────
  try {
    const {
      payment: updatedPayment,
      release,
      isFinal,
    } = await releaseEscrowPartial(payment.id, releaseAmount, {
      triggeredBy: hirerId,
      triggeredByRole: "HIRER",
      note: typeof note === "string" && note.trim() ? note.trim() : null,
    });

    return res.status(200).json({
      success: true,
      message: isFinal
        ? "Full payment released to worker"
        : "Partial payment released to worker",
      data: {
        payment: updatedPayment,
        release,
        isFinal,
        remaining: parseFloat(
          (
            (Number(updatedPayment.workerPayout) || 0) -
            (Number(updatedPayment.releasedAmount) || 0)
          ).toFixed(2),
        ),
      },
    });
  } catch (err) {
    console.error("releasePayment error:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to release payment",
    });
  }
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

  // Guard: never create a duplicate refund for the same payment
  const existingRefund = await prisma.refund.findFirst({
    where: {
      paymentId: payment.id,
      status: { notIn: ["REJECTED", "FAILED"] },
    },
  });
  if (existingRefund) {
    return res.status(400).json({
      success: false,
      message: "A refund already exists for this payment",
    });
  }

  // ── Create the formal Refund row ─────────────────────────────────────────
  let refund;
  try {
    refund = await createRefundFromAdmin(booking, payment, req.user.id, {
      percentage: 100,
      reason:
        req.user.role === "ADMIN"
          ? "Admin-initiated refund"
          : "Hirer-requested refund via legacy route",
    });
  } catch (err) {
    console.error("refundPayment create error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }

  // ── Process the refund (moves money) ─────────────────────────────────────
  try {
    await processRefund(refund.id);
  } catch (err) {
    console.error("refundPayment process error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Refund record created but processing failed. Contact support.",
      data: { refundId: refund.id },
    });
  }

  // ── Reload refund to get final state ─────────────────────────────────────
  const finalRefund = await prisma.refund.findUnique({
    where: { id: refund.id },
  });

  return res.status(200).json({
    success: true,
    message: "Refund processed",
    data: { refund: finalRefund },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 11  WORKER — REQUEST WITHDRAWAL
// POST /api/payments/withdraw
//
// Partial-release aware: the worker's available balance is computed from
// Σ payment.releasedAmount (not workerPayout), across HELD + RELEASED
// payments. This matches getWithdrawals exactly, so a worker whose hirer
// has only partially released can still withdraw the released slice.
//
// Also filters pending withdrawals by the requested currency so a worker
// with pending NGN withdrawals can still withdraw USD, and vice versa.
// ─────────────────────────────────────────────────────────────────────────────
export const requestWithdrawal = asyncHandler(async (req, res) => {
  const workerId = req.user.id;
  const {
    pin,
    amount,
    currency = "NGN",
    method = "bank_transfer",
    bankCode,
    bankName,
    accountNumber,
    accountName,
    mobileNumber,
    mobileName,
    mobileProvider,
    cryptoAddress,
    cryptoCurrency,
    cryptoNetwork,
    country = "NG",
  } = req.body;

  if (!amount || parseFloat(amount) <= 0) {
    return res
      .status(400)
      .json({ success: false, message: "Valid amount required" });
  }

  const requestedCurrency = currency.toUpperCase();

  // ── PIN check ────────────────────────────────────────────────────────────
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

  const pinCheck = await verifyWithdrawalPin(user, pin);

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

  // ── Balance check — partial-release aware, currency-scoped ──────────────
  // Available (this currency) =
  //   Σ releasedAmount on this worker's HELD + RELEASED payments in this
  //   currency, minus pending withdrawals in this currency, minus the
  //   worker's outstanding debt (if any).
  const [releasedAgg, pendingAgg, workerProfile] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        booking: { workerId },
        status: { in: ["HELD", "RELEASED"] },
        currency: requestedCurrency,
      },
      _sum: { releasedAmount: true },
    }),
    prisma.withdrawal.aggregate({
      where: {
        workerId,
        currency: requestedCurrency,
        status: { in: ["PENDING", "PROCESSING"] },
      },
      _sum: { amount: true },
    }),
    prisma.workerProfile.findUnique({
      where: { userId: workerId },
      select: { id: true, debtBalance: true },
    }),
  ]);

  const totalReleased = releasedAgg._sum.releasedAmount ?? 0;
  const pendingPayouts = pendingAgg._sum.amount ?? 0;
  const outstandingDebt = workerProfile?.debtBalance || 0;

  // Debt is a platform-wide obligation, so we deduct it from whichever
  // currency the worker is trying to withdraw from.
  const available = Math.max(
    0,
    totalReleased - pendingPayouts - outstandingDebt,
  );

  if (parseFloat(amount) > available) {
    return res.status(400).json({
      success: false,
      message: `Insufficient balance. Available in ${requestedCurrency}: ${available.toFixed(2)}`,
    });
  }

  // ── Debt deduction ──────────────────────────────────────────────────────
  let debtDeducted = 0;
  let finalPayoutAmount = parseFloat(amount);

  if (outstandingDebt > 0) {
    debtDeducted = Math.min(finalPayoutAmount, outstandingDebt);
    finalPayoutAmount = finalPayoutAmount - debtDeducted;

    if (finalPayoutAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: `Your outstanding debt of ${requestedCurrency} ${outstandingDebt.toFixed(2)} exceeds this withdrawal amount. Please withdraw more, or contact support.`,
        data: {
          debtBalance: outstandingDebt,
          requestedAmount: parseFloat(amount),
        },
      });
    }
  }

  // ── Method-specific validation ──────────────────────────────────────────
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

  // ── Create the withdrawal ───────────────────────────────────────────────
  const reference = uniqueRef("WD");

  const withdrawal = await prisma.withdrawal.create({
    data: {
      workerId,
      amount: finalPayoutAmount,
      currency: requestedCurrency,
      method,
      destination,
      reference,
      status: "PENDING",
      details: {
        ...methodMeta,
        requestedAt: new Date().toISOString(),
        originalAmount: parseFloat(amount),
        debtDeducted: debtDeducted || 0,
        debtBalanceBefore: outstandingDebt || 0,
      },
    },
  });

  // ── Apply debt deduction (FIFO across outstanding debts) ────────────────
  if (debtDeducted > 0 && workerProfile) {
    await prisma.workerProfile.update({
      where: { id: workerProfile.id },
      data: { debtBalance: { decrement: debtDeducted } },
    });

    let remaining = debtDeducted;
    const outstandingDebts = await prisma.workerDebt.findMany({
      where: { workerId, status: "OUTSTANDING" },
      orderBy: { createdAt: "asc" },
    });

    for (const debt of outstandingDebts) {
      if (remaining <= 0) break;

      const owed = debt.amount - debt.amountPaid;
      const applied = Math.min(remaining, owed);
      const newPaid = debt.amountPaid + applied;
      const newStatus = newPaid >= debt.amount ? "CLEARED" : "OUTSTANDING";

      await prisma.workerDebt.update({
        where: { id: debt.id },
        data: {
          amountPaid: newPaid,
          status: newStatus,
          clearedAt: newStatus === "CLEARED" ? new Date() : undefined,
          meta: {
            ...(debt.meta || {}),
            lastDeductionAt: new Date().toISOString(),
            lastDeductionFrom: withdrawal.reference,
          },
        },
      });

      remaining -= applied;
    }

    console.log(
      `[requestWithdrawal] Deducted ${debtDeducted} ${requestedCurrency} of debt from worker ${workerId} via withdrawal ${reference}`,
    );

    await createNotification({
      userId: workerId,
      title: "Debt deducted from withdrawal",
      body: `${requestedCurrency} ${debtDeducted.toFixed(2)} was deducted from your withdrawal to pay down your outstanding balance.`,
      type: "WORKER_DEBT_DEDUCTED",
      data: {
        withdrawalId: withdrawal.id,
        reference,
        debtDeducted,
        remainingDebt: Math.max(0, outstandingDebt - debtDeducted),
      },
      icon: "FaExclamationTriangle",
    }).catch(() => {});
  }

  // ── Notify admins ───────────────────────────────────────────────────────
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      title: "Withdrawal Request 💸",
      body: `Worker requested ${requestedCurrency} ${finalPayoutAmount.toFixed(2)}${debtDeducted > 0 ? ` (debt deduction: ${requestedCurrency} ${debtDeducted.toFixed(2)})` : ""} via ${method.replace("_", " ")} — Ref: ${reference}`,
      type: "WITHDRAWAL_REQUESTED",
      data: {
        withdrawalId: withdrawal.id,
        workerId,
        amount: finalPayoutAmount,
        currency: requestedCurrency,
        method,
        debtDeducted,
      },
    })),
  });

  return res.status(201).json({
    success: true,
    message:
      debtDeducted > 0
        ? `Withdrawal of ${requestedCurrency} ${finalPayoutAmount.toFixed(2)} submitted. ${requestedCurrency} ${debtDeducted.toFixed(2)} was applied to your outstanding debt.`
        : "Withdrawal request submitted. Processing within 1–3 business days.",
    data: {
      withdrawal,
      debtDeducted: debtDeducted || 0,
      finalPayoutAmount,
      remainingDebt: Math.max(0, outstandingDebt - (debtDeducted || 0)),
    },
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

  const meta = _parseMeta(withdrawal.details);
  const method = withdrawal.method;
  const currency = withdrawal.currency;
  const provider = getWithdrawalProvider(meta.country ?? "NG", method);

  const { fee: withdrawalFee, netAmount: amount } =
    FEE_CONFIG.computeWithdrawal(parseFloat(withdrawal.amount));

  let transferRef = uniqueRef("TXF");
  let providerData = {};

  try {
    if (provider === "paystack" && method === "bank_transfer") {
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
    } else if (provider === "flutterwave" && method === "bank_transfer") {
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
    } else if (provider === "flutterwave" && method === "mobile_money") {
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
    } else if (method === "crypto") {
      providerData = {
        provider: "crypto",
        cryptoAddress: meta.cryptoAddress,
        cryptoCurrency: meta.cryptoCurrency,
        cryptoNetwork: meta.cryptoNetwork,
        note: "Admin must send crypto manually and update to COMPLETED",
      };
    }

    await prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: {
        status: method === "crypto" ? "PROCESSING" : "PROCESSING",
        processedAt: new Date(),
        details: {
          ...meta,
          ...providerData,
          approvedAt: new Date().toISOString(),
          adminNotes: notes,
          withdrawalFee,
          netPayout: amount,
        },
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
    await prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: {
        details: {
          ...meta,
          error: err.message,
          failedAt: new Date().toISOString(),
        },
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
//
// Partial-release aware:
//   • Available balance = Σ payment.releasedAmount − Σ pending withdrawals
//     - releasedAmount is 0 for untouched HELD payments
//     - = workerPayout for fully-released payments
//     - = a partial slice for partially-released payments
//   • In escrow         = Σ (workerPayout − releasedAmount) on HELD payments
//   • Total earned      = Σ releasedAmount (everything the worker has
//                         actually received, partial or full)
//
// This means a 25% release immediately credits the worker's available
// balance — no waiting for the hirer to hit 100%.
// ─────────────────────────────────────────────────────────────────────────────
export const getWithdrawals = asyncHandler(async (req, res) => {
  const workerId = req.user.id;
  const { page = 1, limit = 15 } = req.query;
  const { skip, take } = paginate(page, limit);

  const [
    earnedAgg,
    heldPayments,
    pendingAgg,
    withdrawals,
    total,
    workerProfile,
    perCurrencyReleased,
    perCurrencyPending,
    currencyList,
  ] = await Promise.all([
    // ── Released-to-worker total (uses releasedAmount, not workerPayout) ──
    prisma.payment.aggregate({
      where: {
        booking: { workerId },
        status: { in: ["HELD", "RELEASED"] },
      },
      _sum: { releasedAmount: true },
    }),

    // ── Fetch HELD payments so we can compute escrow in JS ──
    // (Prisma can't subtract two columns in aggregate, and we're avoiding
    //  raw SQL. The number of HELD payments per worker is small.)
    prisma.payment.findMany({
      where: {
        booking: { workerId },
        status: "HELD",
      },
      select: { workerPayout: true, releasedAmount: true, currency: true },
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

    prisma.workerProfile.findUnique({
      where: { userId: workerId },
      select: {
        debtBalance: true,
        debtCreatedAt: true,
        debtForgivenAt: true,
        debtReason: true,
      },
    }),

    // ── Per-currency released (uses releasedAmount) ──
    prisma.payment.groupBy({
      by: ["currency"],
      where: {
        booking: { workerId },
        status: { in: ["HELD", "RELEASED"] },
      },
      _sum: { releasedAmount: true },
    }),

    prisma.withdrawal.groupBy({
      by: ["currency"],
      where: { workerId, status: { in: ["PENDING", "PROCESSING"] } },
      _sum: { amount: true },
    }),

    prisma.payment.findMany({
      where: {
        booking: { workerId },
        status: { in: ["RELEASED", "HELD"] },
      },
      select: { currency: true },
      distinct: ["currency"],
    }),
  ]);

  // ── Compute total + per-currency escrow from the HELD payments ─────────
  let inEscrow = 0;
  const escrowByCurrency = {};
  for (const p of heldPayments) {
    const remaining = Math.max(
      0,
      (Number(p.workerPayout) || 0) - (Number(p.releasedAmount) || 0),
    );
    inEscrow += remaining;
    if (remaining > 0) {
      escrowByCurrency[p.currency] =
        (escrowByCurrency[p.currency] || 0) + remaining;
    }
  }
  inEscrow = parseFloat(inEscrow.toFixed(2));

  const totalEarned = earnedAgg._sum.releasedAmount ?? 0;
  const pendingPayout = pendingAgg._sum.amount ?? 0;
  const outstandingDebt = workerProfile?.debtBalance ?? 0;

  const available = Math.max(0, totalEarned - pendingPayout - outstandingDebt);

  const balancesByCurrency = {};
  const allCurrencies = new Set([
    ...currencyList.map((c) => c.currency),
    ...Object.keys(escrowByCurrency),
  ]);

  for (const cur of allCurrencies) {
    const released =
      perCurrencyReleased.find((r) => r.currency === cur)?._sum
        .releasedAmount ?? 0;
    const held = escrowByCurrency[cur] ?? 0;
    const pending =
      perCurrencyPending.find((r) => r.currency === cur)?._sum.amount ?? 0;

    // Skip currencies with no money anywhere — keeps the wallet grid tidy.
    const hasAnything = released > 0 || held > 0 || pending > 0;
    if (!hasAnything) continue;

    balancesByCurrency[cur] = {
      currency: cur,
      available: Math.max(0, released - pending),
      totalEarned: released,
      inEscrow: parseFloat(held.toFixed(2)),
      pendingPayout: pending,
    };
  }

  const parsed = withdrawals.map((w) => ({
    ...w,
    meta: _parseMeta(w.details),
  }));

  return res.status(200).json({
    success: true,
    data: {
      balance: {
        available,
        totalEarned,
        inEscrow,
        pendingPayout,
        debtBalance: outstandingDebt,
        debtCreatedAt: workerProfile?.debtCreatedAt ?? null,
        debtReason: workerProfile?.debtReason ?? null,
        withdrawalFeeRate: FEE_CONFIG.WITHDRAWAL_FEE_RATE,
        withdrawalFeeCap: FEE_CONFIG.WITHDRAWAL_FEE_CAP,
        workerFeeRate: FEE_CONFIG.WORKER_FEE_RATE,
        hirerFeeRate: FEE_CONFIG.HIRER_FEE_RATE,
        feePhase: FEE_CONFIG.phase,
      },
      balancesByCurrency,
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
//
// Partial-release aware: any payment with releasedAmount > 0 appears here.
// The row carries `earned` (= releasedAmount) and `remaining`
// (= workerPayout − releasedAmount) so the frontend doesn't have to
// recompute them, plus the full `releases` array for per-release detail.
// ─────────────────────────────────────────────────────────────────────────────
export const getWorkerEarnings = asyncHandler(async (req, res) => {
  const workerId = req.user.id;
  const { from, to, currency, page = 1, limit = 20 } = req.query;
  const { skip, take } = paginate(page, limit);

  // A payment is "earned from" if the worker has received any released
  // funds from it — partial or full.
  const where = {
    booking: { workerId },
    status: { in: ["HELD", "RELEASED"] },
    releasedAmount: { gt: 0 },
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
        releases: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            amount: true,
            currency: true,
            note: true,
            createdAt: true,
            remainingBefore: true,
            remainingAfter: true,
          },
        },
      },
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({
      where,
      _sum: {
        releasedAmount: true, // what the worker actually earned
        workerPayout: true, // what the worker was promised
        amount: true, // what the hirer was charged
        platformFee: true,
      },
    }),
    prisma.payment.findMany({
      where: {
        booking: { workerId },
        status: { in: ["HELD", "RELEASED"] },
        releasedAmount: { gt: 0 },
      },
      select: { currency: true },
      distinct: ["currency"],
    }),
  ]);

  // Enrich each row with derived values so the frontend stays simple.
  const enriched = payments.map((p) => {
    const workerPayout = Number(p.workerPayout) || 0;
    const released = Number(p.releasedAmount) || 0;
    return {
      ...p,
      earned: released,
      remaining: parseFloat(Math.max(0, workerPayout - released).toFixed(2)),
      isFullyReleased: released >= workerPayout && workerPayout > 0,
      releaseCount: p.releases?.length || 0,
    };
  });

  return res.status(200).json({
    success: true,
    data: {
      payments: enriched,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / take),
      summary: {
        totalEarned: aggregate._sum.releasedAmount ?? 0,
        totalPromised: aggregate._sum.workerPayout ?? 0,
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
  const { referralAmount = 0 } = req.body;

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

  // ── Compute full job value (job-post aware) ───────────────────────────
  const { subtotal, platformFee, workerPayout, total, isJobPostBooking } =
    computeBookingTotal(booking);

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
      isJobPostBooking,
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
  const {
    proofUrl: proofUrlBody,
    senderName,
    bankName,
    referralAmount = 0,
  } = req.body;
  const reference = req.body.reference || uniqueRef("BT");
  const proofUrl = req.file?.path || proofUrlBody || null;

  console.log(
    `🔍 confirmBankTransfer: bookingId=${bookingId}, userId=${req.user.id}, referralAmount=${referralAmount}`,
  );

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking)
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  if (booking.hirerId !== req.user.id)
    return res.status(403).json({ success: false, message: "Forbidden" });

  const latestPayment = await prisma.payment.findFirst({
    where: { bookingId },
    orderBy: { createdAt: "desc" },
  });
  if (["HELD", "RELEASED"].includes(latestPayment?.status))
    return res
      .status(400)
      .json({ success: false, message: "Payment already completed" });

  const { subtotal, platformFee, workerPayout, total, isJobPostBooking } =
    computeBookingTotal(booking);
  console.log(
    `📊 computeBookingTotal: subtotal=${subtotal}, total=${total}, platformFee=${platformFee}, workerPayout=${workerPayout}, isJobPostBooking=${isJobPostBooking}`,
  );

  const chargedAmount = parseFloat(
    Math.max(0, total - referralAmount).toFixed(2),
  );
  console.log(`💰 chargedAmount (total - referralAmount): ${chargedAmount}`);

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
      referralDeduct: referralAmount,
    },
  });
  console.log(
    `✅ Payment created with referralDeduct=${payment.referralDeduct}`,
  );

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
  const { cryptoCurrency = "USDC", referralAmount = 0 } = req.body;

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

  const { subtotal, platformFee, workerPayout, total, isJobPostBooking } =
    computeBookingTotal(booking);

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
      isJobPostBooking,
      cryptoDetails: {
        currency: cryptoCurrency.toUpperCase(),
        network: wallet.network,
        wallet: wallet.address,
        amount: totalChargedCrypto,
        note: `Include reference ${reference} in transaction memo`,
      },
    },
  });
});

export const confirmCryptoPayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { txHash, cryptoAmount, cryptoCurrency, referralAmount = 0 } = req.body;
  const reference = req.body.reference || uniqueRef("CRYPTO");
  const proofUrl = req.file?.path || null;

  if (!txHash)
    return res
      .status(400)
      .json({ success: false, message: "Transaction hash required" });

  console.log(
    `🔍 confirmCryptoPayment: bookingId=${bookingId}, userId=${req.user.id}, referralAmount=${referralAmount}`,
  );

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking)
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  if (booking.hirerId !== req.user.id)
    return res.status(403).json({ success: false, message: "Forbidden" });

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

  const { subtotal, platformFee, workerPayout, total, isJobPostBooking } =
    computeBookingTotal(booking);
  console.log(
    `📊 computeBookingTotal: subtotal=${subtotal}, total=${total}, platformFee=${platformFee}, workerPayout=${workerPayout}, isJobPostBooking=${isJobPostBooking}`,
  );

  const chargedAmount = parseFloat(
    Math.max(0, total - referralAmount).toFixed(2),
  );
  console.log(`💰 chargedAmount (total - referralAmount): ${chargedAmount}`);

  const payment = await prisma.payment.create({
    data: {
      bookingId,
      userId: req.user.id,
      amount: chargedAmount,
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
      bankTransferProof: proofUrl,
      referralDeduct: referralAmount,
    },
  });
  console.log(
    `✅ Payment created with referralDeduct=${payment.referralDeduct}`,
  );

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
//
// Returns the current payment row for a booking, along with the full
// release history so the frontend can show:
//   • how much has been released so far (releasedAmount)
//   • how much is still in escrow (workerPayout - releasedAmount)
//   • each partial release as a line item (who, when, how much, note)
//
// The `releasedAmount` / `releaseCount` fields are on the payment row.
// `releases` is populated from the new PaymentRelease table.
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

  const payment = await prisma.payment.findFirst({
    where: { bookingId: req.params.bookingId },
    orderBy: [{ status: "desc" }, { createdAt: "desc" }],
    include: {
      releases: {
        orderBy: { createdAt: "desc" },
        include: {
          releasedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      },
    },
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

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

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

  if (!currentPin) {
    return res.status(400).json({
      success: false,
      message: "Current PIN is required",
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

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  if (!user.withdrawalPinSet) {
    return res.status(400).json({
      success: false,
      message: "No PIN set yet. Use /pin/set first.",
    });
  }

  const check = await verifyWithdrawalPin(user, currentPin);
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

// ─────────────────────────────────────────────────────────────────────────────
// PAY FROM WALLET
// ─────────────────────────────────────────────────────────────────────────────
export const payFromWallet = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const hirerId = req.user.id;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { hirer: true },
  });

  if (!booking)
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  if (booking.hirerId !== hirerId)
    return res.status(403).json({ success: false, message: "Forbidden" });

  const { subtotal, platformFee, workerPayout, total } =
    computeBookingTotal(booking);
  const currency = booking.currency;

  const wallet = await prisma.hirerWallet.findUnique({
    where: { hirerId_currency: { hirerId, currency } },
  });

  if (!wallet || wallet.balance < total) {
    return res.status(400).json({
      success: false,
      message: `Insufficient wallet balance. You need ${currency} ${total.toLocaleString()}`,
    });
  }

  const reference = uniqueRef("WALLET");

  await prisma.$transaction(async (tx) => {
    const newBalance = wallet.balance - total;
    await tx.hirerWallet.update({
      where: { id: wallet.id },
      data: {
        balance: newBalance,
        totalSpent: wallet.totalSpent + total,
        lastTransactionAt: new Date(),
      },
    });

    const hirerTx = await tx.hirerTransaction.create({
      data: {
        walletId: wallet.id,
        hirerId,
        type: "PAYMENT",
        amount: total,
        currency,
        fee: 0,
        netAmount: total,
        reference,
        status: "COMPLETED",
        description: `Payment for booking ${bookingId}`,
        balanceBefore: wallet.balance,
        balanceAfter: newBalance,
        completedAt: new Date(),
      },
    });

    await tx.payment.create({
      data: {
        bookingId,
        userId: hirerId,
        amount: total,
        currency,
        platformFee,
        workerPayout,
        status: "HELD",
        provider: "wallet",
        providerRef: reference,
        walletPaymentId: hirerTx.id,
      },
    });

    await tx.booking.update({
      where: { id: bookingId },
      data: { status: "ACCEPTED" },
    });

    // ✅ Update retained cycle
    if (booking.source === "RETAINED_STAFF") {
      await tx.retainedPayrollCycle.updateMany({
        where: { bookingId },
        data: { status: "HELD", paidAt: new Date() },
      });
    }
  });

  await _notifyPaymentHeld(bookingId).catch(() => {});

  return res.status(200).json({
    success: true,
    message: "Payment successful from wallet",
    data: { reference, bookingId },
  });
});

function _parseMeta(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
