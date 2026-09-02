// src/services/refund.service.js
import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { createNotification } from "./notification.service.js";
import { v4 as uuidv4 } from "uuid";

// ── Constants ──────────────────────────────────────────────────────────
const REFUND_TIME_LIMIT_HOURS = 48;
const PLATFORM_FEE_PERCENT = 0.1; // 10%

// ── Check if refund is within time limit ────────────────────────────
export const isRefundEligible = (booking) => {
  if (booking.status !== "COMPLETED") return false;

  const completedAt = booking.completedAt || booking.updatedAt;
  const hoursSinceCompletion =
    (Date.now() - new Date(completedAt).getTime()) / (1000 * 60 * 60);

  return hoursSinceCompletion <= REFUND_TIME_LIMIT_HOURS;
};

// ── Calculate refund amounts ────────────────────────────────────────
export const calculateRefundAmounts = (
  payment,
  refundType,
  percentage = null,
) => {
  const currency = payment.currency || "NGN";
  const originalAmount = payment.amount;
  const platformFee =
    payment.platformFee || originalAmount * PLATFORM_FEE_PERCENT;
  const workerPayout = payment.workerPayout || originalAmount - platformFee;

  let refundAmount = 0;
  let platformFeeRefunded = 0;
  let workerAmountDeducted = 0;
  let finalPercentage = 0;

  switch (refundType) {
    case "FULL":
      refundAmount = originalAmount;
      platformFeeRefunded = platformFee;
      workerAmountDeducted = workerPayout;
      finalPercentage = 100;
      break;

    case "PARTIAL":
      const pct = percentage || 50;
      finalPercentage = pct;
      refundAmount = (originalAmount * pct) / 100;
      platformFeeRefunded = (platformFee * pct) / 100;
      workerAmountDeducted = (workerPayout * pct) / 100;
      break;

    case "CUSTOM_AMOUNT":
      finalPercentage = (refundAmount / originalAmount) * 100;
      // Custom amount logic handled separately
      break;

    case "DISPUTE":
      // Admin decides the amount
      break;
  }

  return {
    refundAmount,
    platformFeeRefunded,
    workerAmountDeducted,
    finalPercentage,
    currency,
    originalAmount,
    platformFee,
    workerPayout,
  };
};

// ── Generate refund reference ──────────────────────────────────────
export const generateRefundReference = () => {
  return `REF-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;
};

// ── Process refund ──────────────────────────────────────────────────
export const processRefund = async (refundId) => {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: {
      booking: true,
      payment: true,
      hirer: true,
      worker: true,
    },
  });

  if (!refund) throw new Error("Refund not found");
  if (refund.status !== "APPROVED") throw new Error("Refund not approved");

  try {
    // 1. Update refund status
    await prisma.refund.update({
      where: { id: refundId },
      data: { status: "PROCESSING" },
    });

    // 2. Credit Hirer's wallet
    const hirerWallet = await prisma.hirerWallet.findUnique({
      where: { hirerId: refund.hirerId },
    });

    if (hirerWallet) {
      await prisma.hirerWallet.update({
        where: { id: hirerWallet.id },
        data: {
          balance: { increment: refund.amount },
          refundsReceived: { increment: refund.amount },
        },
      });
    }

    // 3. Debit Worker's wallet (if they have balance)
    const worker = await prisma.user.findUnique({
      where: { id: refund.workerId },
      include: { workerProfile: true },
    });

    if (worker) {
      // Check worker's wallet balance
      const workerWallet = await prisma.workerWallet?.findUnique({
        where: { workerId: refund.workerId },
      });

      if (workerWallet) {
        await prisma.workerWallet.update({
          where: { id: workerWallet.id },
          data: {
            balance: { decrement: refund.workerAmountDeducted },
            pendingBalance: { decrement: refund.workerAmountDeducted },
          },
        });
      }
    }

    // 4. Create wallet transaction for Hirer
    await prisma.hirerTransaction.create({
      data: {
        walletId: hirerWallet.id,
        hirerId: refund.hirerId,
        type: "REFUND",
        amount: refund.amount,
        currency: refund.currency,
        fee: 0,
        netAmount: refund.amount,
        reference: refund.reference,
        status: "COMPLETED",
        description: `Refund for booking ${refund.booking.title}`,
        meta: {
          bookingId: refund.bookingId,
          paymentId: refund.paymentId,
          refundType: refund.refundType,
          refundId: refund.id,
        },
      },
    });

    // 5. Update refund status to COMPLETED
    await prisma.refund.update({
      where: { id: refundId },
      data: {
        status: "COMPLETED",
        processedAt: new Date(),
      },
    });

    // 6. Update booking
    await prisma.booking.update({
      where: { id: refund.bookingId },
      data: {
        refundCount: { increment: 1 },
        totalRefunded: { increment: refund.amount },
      },
    });

    // 7. Send notifications
    await createNotification({
      userId: refund.hirerId,
      title: "Refund Processed",
      body: `${refund.currency} ${refund.amount.toLocaleString()} has been refunded to your wallet for booking "${refund.booking.title}".`,
      type: "REFUND_COMPLETED",
      data: { bookingId: refund.bookingId, refundId: refund.id },
      icon: "FaMoneyBillWave",
    });

    await createNotification({
      userId: refund.workerId,
      title: "Refund Processed",
      body: `${refund.currency} ${refund.workerAmountDeducted.toLocaleString()} has been deducted from your wallet for booking "${refund.booking.title}".`,
      type: "REFUND_DEDUCTED",
      data: { bookingId: refund.bookingId, refundId: refund.id },
      icon: "FaExclamationTriangle",
    });

    return { success: true, refund };
  } catch (error) {
    // Mark refund as FAILED
    await prisma.refund.update({
      where: { id: refundId },
      data: {
        status: "FAILED",
        adminNotes: `Processing failed: ${error.message}`,
      },
    });
    throw error;
  }
};

// ── Auto-approve refund (if enabled) ──────────────────────────────
export const autoApproveRefund = async (refundId) => {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: {
      booking: true,
      payment: true,
    },
  });

  if (!refund) throw new Error("Refund not found");
  if (refund.status !== "PENDING") return refund;

  // Check if auto-approval is enabled in settings
  const settings = await prisma.appSettings.findFirst({
    where: { key: "refund_auto_approve" },
  });

  const isAutoApprove = settings?.value === "true";

  if (!isAutoApprove) return refund;

  // Check if within time limit
  const eligible = isRefundEligible(refund.booking);
  if (!eligible) {
    await prisma.refund.update({
      where: { id: refundId },
      data: {
        status: "REJECTED",
        adminNotes: "Refund requested outside 48-hour window",
      },
    });
    return refund;
  }

  // Auto-approve
  await prisma.refund.update({
    where: { id: refundId },
    data: {
      status: "APPROVED",
      isAutomatic: true,
      autoApprovedAt: new Date(),
    },
  });

  // Process the refund
  await processRefund(refundId);

  return refund;
};
