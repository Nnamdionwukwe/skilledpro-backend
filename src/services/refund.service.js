// src/services/refund.service.js
import prisma from "../config/database.js";
import { createNotification } from "./notification.service.js";
import { v4 as uuidv4 } from "uuid";

// ── Constants ──────────────────────────────────────────────────────────
const REFUND_TIME_LIMIT_HOURS = 48;
const PLATFORM_FEE_PERCENT = 0.05;
const AUTO_APPROVE_THRESHOLD_HOURS = 48; // auto-approve after this many hours
const AUTO_APPROVE_MAX_AMOUNT = 50000; // only auto-approve refunds below this amount (NGN)
const AUTO_APPROVE_SETTING_KEY = "refund_auto_approve";

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

    case "PARTIAL": {
      const pct = percentage || 50;
      finalPercentage = pct;
      refundAmount = (originalAmount * pct) / 100;
      platformFeeRefunded = (platformFee * pct) / 100;
      workerAmountDeducted = (workerPayout * pct) / 100;
      break;
    }

    case "CUSTOM_AMOUNT":
      finalPercentage = (refundAmount / originalAmount) * 100;
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

// ── Get auto-approval settings ──────────────────────────────────────
export const getAutoApproveSettings = async () => {
  try {
    const setting = await prisma.appSettings.findUnique({
      where: { key: AUTO_APPROVE_SETTING_KEY },
    });
    return {
      enabled: setting?.value === "true",
      thresholdHours:
        parseInt(setting?.meta?.thresholdHours) || AUTO_APPROVE_THRESHOLD_HOURS,
      maxAmount:
        parseFloat(setting?.meta?.maxAmount) || AUTO_APPROVE_MAX_AMOUNT,
    };
  } catch (err) {
    console.error("getAutoApproveSettings error:", err);
    return {
      enabled: false,
      thresholdHours: AUTO_APPROVE_THRESHOLD_HOURS,
      maxAmount: AUTO_APPROVE_MAX_AMOUNT,
    };
  }
};

// ── Decide whether a refund qualifies for auto-approval ────────────
const qualifiesForAutoApprove = (refund, settings) => {
  if (!settings.enabled) return false;

  // Refund must be PENDING
  if (refund.status !== "PENDING") return false;

  // Refund type must be FULL or PARTIAL (never CUSTOM_AMOUNT or DISPUTE)
  if (!["FULL", "PARTIAL"].includes(refund.refundType)) return false;

  // Amount must be under the max
  if (refund.amount > settings.maxAmount) return false;

  // Booking must be COMPLETED and within the time window
  const completedAt =
    refund.booking?.completedAt ||
    refund.booking?.updatedAt ||
    refund.createdAt;
  const hoursSince = (Date.now() - new Date(completedAt).getTime()) / 3600000;
  if (hoursSince > settings.thresholdHours) return false;

  return true;
};

// ── Auto-approve a refund if it qualifies ──────────────────────────
export const autoApproveRefund = async (refundId) => {
  try {
    const refund = await prisma.refund.findUnique({
      where: { id: refundId },
      include: { booking: true },
    });

    if (!refund) return { approved: false, reason: "Refund not found" };

    const settings = await getAutoApproveSettings();

    if (!qualifiesForAutoApprove(refund, settings)) {
      return { approved: false, reason: "Does not qualify for auto-approval" };
    }

    // Approve + process
    await prisma.refund.update({
      where: { id: refundId },
      data: {
        status: "APPROVED",
        adminNotes: "Auto-approved by system",
      },
    });

    // Process it fully (moves wallet funds)
    await processRefund(refundId);

    // Log for audit
    await createNotification({
      userId: refund.hirerId,
      title: "Refund Auto-Approved",
      body: `Your refund of ${refund.currency} ${refund.amount.toLocaleString()} for booking "${refund.booking?.title}" has been auto-approved and processed.`,
      type: "REFUND_APPROVED",
      data: { bookingId: refund.bookingId, refundId: refund.id },
      icon: "FaCheckCircle",
    });

    return { approved: true };
  } catch (err) {
    console.error("autoApproveRefund error:", err);
    return { approved: false, reason: err.message };
  }
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
    // 1. Update refund status to PROCESSING
    await prisma.refund.update({
      where: { id: refundId },
      data: { status: "PROCESSING" },
    });

    // 2. Credit Hirer's wallet (auto-create if missing)
    // NOTE: HirerWallet has a compound unique on (hirerId, currency), so
    // findUnique requires the compound key. Use findFirst to filter by hirerId.
    let hirerWallet = await prisma.hirerWallet.findFirst({
      where: { hirerId: refund.hirerId },
    });

    if (!hirerWallet) {
      // Auto-create wallet so the credit lands — silent skip would lose money
      hirerWallet = await prisma.hirerWallet.create({
        data: {
          hirerId: refund.hirerId,
          currency: refund.currency || "NGN",
          balance: 0,
        },
      });
    }

    if (hirerWallet) {
      await prisma.hirerWallet.update({
        where: { id: hirerWallet.id },
        data: {
          balance: { increment: refund.amount },
          totalRefunded: { increment: refund.amount },
        },
      });

      // 3. Create wallet transaction for Hirer
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
    }

    // 4. Handle the worker's side (debt-aware)
    // Two paths depending on whether the worker has already withdrawn:
    //  a) Worker hasn't withdrawn since release → debit earnings (they still hold funds)
    //  b) Worker has withdrawn since release  → create a debt (recovery via future earnings)
    if (refund.workerId) {
      const workerProfile = await prisma.workerProfile.findUnique({
        where: { userId: refund.workerId },
        select: { id: true, totalEarnings: true, debtBalance: true },
      });

      if (!workerProfile) {
        console.warn(
          `processRefund: no WorkerProfile for user ${refund.workerId} — skipping worker debit`,
        );
      } else {
        // Was the payment already released AND has the worker withdrawn since?
        const paymentReleasedAt = refund.payment?.escrowReleasedAt;
        let hasWithdrawnSinceRelease = false;

        if (refund.payment?.status === "RELEASED" && paymentReleasedAt) {
          const recentWithdrawal = await prisma.withdrawal.findFirst({
            where: {
              workerId: refund.workerId,
              status: "COMPLETED",
              completedAt: { gte: paymentReleasedAt },
            },
            select: { id: true, completedAt: true, amount: true },
          });
          hasWithdrawnSinceRelease = !!recentWithdrawal;
        }

        const amountToClawBack = refund.workerAmountDeducted || 0;

        if (hasWithdrawnSinceRelease) {
          // ── CASE D: Worker already withdrew — create a debt record ──────
          await prisma.workerDebt.create({
            data: {
              workerId: refund.workerId,
              workerProfileId: workerProfile.id,
              amount: amountToClawBack,
              currency: refund.currency || "NGN",
              reason: "DISPUTE_REFUND",
              reasonNote: `Refund ${refund.reference} on booking "${refund.booking?.title}" after withdrawal`,
              refundId: refund.id,
              status: "OUTSTANDING",
              meta: {
                bookingId: refund.bookingId,
                paymentId: refund.paymentId,
                originalRefundType: refund.refundType,
                paymentReleasedAt: paymentReleasedAt?.toISOString() || null,
              },
            },
          });

          // Update the worker's aggregate debt balance
          await prisma.workerProfile.update({
            where: { id: workerProfile.id },
            data: {
              debtBalance: { increment: amountToClawBack },
              debtCreatedAt:
                workerProfile.debtBalance === 0 ? new Date() : undefined,
              debtReason: "Outstanding dispute refund debt",
            },
          });

          // Notify the worker about the debt
          await createNotification({
            userId: refund.workerId,
            title: "Dispute resolved — debt created",
            body: `${refund.currency} ${amountToClawBack.toLocaleString()} is now owed to SkilledProz because the payment had already been withdrawn. It will be deducted from your next withdrawals.`,
            type: "WORKER_DEBT_CREATED",
            data: {
              refundId: refund.id,
              bookingId: refund.bookingId,
              amount: amountToClawBack,
            },
            icon: "FaExclamationTriangle",
          }).catch(() => {});

          console.log(
            `[processRefund] Created WorkerDebt of ${amountToClawBack} ${refund.currency} for worker ${refund.workerId}`,
          );
        } else {
          // ── CASE A/B/C: Worker still holds the funds — debit earnings ──
          await prisma.workerProfile.update({
            where: { id: workerProfile.id },
            data: {
              totalEarnings: { decrement: amountToClawBack },
            },
          });
        }
      }
    }

    // 5. Update payment status to REFUNDED
    await prisma.payment.update({
      where: { id: refund.paymentId },
      data: {
        status: "REFUNDED",
        refundedAt: new Date(),
      },
    });

    // 6. Update refund status to COMPLETED
    await prisma.refund.update({
      where: { id: refundId },
      data: {
        status: "COMPLETED",
        processedAt: new Date(),
      },
    });

    // 7. Update booking counters
    await prisma.booking
      .update({
        where: { id: refund.bookingId },
        data: {
          refundCount: { increment: 1 },
          totalRefunded: { increment: refund.amount },
        },
      })
      .catch(() => {
        // Booking might not have these fields — safe to skip
      });

    // 8. Send notifications
    await createNotification({
      userId: refund.hirerId,
      title: "Refund Processed",
      body: `${refund.currency} ${refund.amount.toLocaleString()} has been refunded to your wallet for booking "${refund.booking.title}".`,
      type: "REFUND_COMPLETED",
      data: { bookingId: refund.bookingId, refundId: refund.id },
      icon: "FaMoneyBillWave",
    });

    if (refund.workerId) {
      await createNotification({
        userId: refund.workerId,
        title: "Refund Processed",
        body: `${refund.currency} ${refund.workerAmountDeducted.toLocaleString()} has been deducted from your earnings for booking "${refund.booking.title}".`,
        type: "REFUND_DEDUCTED",
        data: { bookingId: refund.bookingId, refundId: refund.id },
        icon: "FaExclamationTriangle",
      });
    }

    return { success: true, refund };
  } catch (error) {
    // Mark refund as FAILED
    await prisma.refund
      .update({
        where: { id: refundId },
        data: {
          status: "FAILED",
          adminNotes: `Processing failed: ${error.message}`,
        },
      })
      .catch(() => {});
    throw error;
  }
};

// ── Reverse refund (restore funds to worker) ──────────────────────────
export const reverseRefund = async (refundId, adminId) => {
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
  if (refund.status !== "COMPLETED")
    throw new Error("Only completed refunds can be reversed");

  try {
    // 1. Debit Hirer's wallet (reverse the credit)
    // NOTE: HirerWallet has a compound unique on (hirerId, currency), so
    // findUnique requires the compound key. Use findFirst to filter by hirerId.
    const hirerWallet = await prisma.hirerWallet.findFirst({
      where: { hirerId: refund.hirerId },
    });

    if (hirerWallet) {
      await prisma.hirerWallet.update({
        where: { id: hirerWallet.id },
        data: {
          balance: { decrement: refund.amount },
          totalRefunded: { decrement: refund.amount },
        },
      });

      // 2. Create reverse transaction for Hirer
      await prisma.hirerTransaction.create({
        data: {
          walletId: hirerWallet.id,
          hirerId: refund.hirerId,
          type: "REFUND_REVERSAL",
          amount: -refund.amount,
          currency: refund.currency,
          fee: 0,
          netAmount: -refund.amount,
          reference: `REV-${refund.reference}`,
          status: "COMPLETED",
          description: `Refund reversal for booking ${refund.booking.title}`,
          meta: {
            bookingId: refund.bookingId,
            refundId: refund.id,
            reversedBy: adminId,
          },
        },
      });
    }

    // 3. Credit Worker's earnings back
    // If a WorkerDebt was created for this refund, mark it as CLEARED here
    // so the debt is cancelled out alongside the refund reversal.
    if (refund.workerId) {
      const debtsFromThisRefund = await prisma.workerDebt.findMany({
        where: { refundId: refund.id, status: "OUTSTANDING" },
      });

      for (const debt of debtsFromThisRefund) {
        // Reduce the worker's aggregate debt balance by the debt amount
        await prisma.workerProfile.update({
          where: { userId: refund.workerId },
          data: {
            debtBalance: { decrement: debt.amount },
          },
        });

        // Mark the debt as CLEARED (was already "recovered" via the reversal)
        await prisma.workerDebt.update({
          where: { id: debt.id },
          data: {
            status: "CLEARED",
            amountPaid: debt.amount,
            clearedAt: new Date(),
            meta: {
              ...(debt.meta || {}),
              clearedBy: "REFUND_REVERSAL",
              clearedByAdmin: adminId,
            },
          },
        });
      }

      // Also restore totalEarnings for the case where the worker hadn't withdrawn
      await prisma.workerProfile
        .update({
          where: { userId: refund.workerId },
          data: {
            totalEarnings: { increment: refund.workerAmountDeducted },
          },
        })
        .catch(() => {});
    }

    // 4. Update payment status back to RELEASED
    await prisma.payment.update({
      where: { id: refund.paymentId },
      data: {
        status: "RELEASED",
        escrowReleasedAt: new Date(),
      },
    });

    // 5. Update refund status to REVERSED
    await prisma.refund.update({
      where: { id: refundId },
      data: {
        status: "REVERSED",
        adminId: adminId,
        adminNotes: `Reversed by admin ${adminId}`,
      },
    });

    // 6. Notifications
    await createNotification({
      userId: refund.hirerId,
      title: "Refund Reversed",
      body: `${refund.currency} ${refund.amount.toLocaleString()} has been deducted from your wallet for booking "${refund.booking.title}".`,
      type: "REFUND_REVERSED",
      data: { bookingId: refund.bookingId, refundId: refund.id },
      icon: "FaExclamationTriangle",
    });

    if (refund.workerId) {
      await createNotification({
        userId: refund.workerId,
        title: "Refund Reversed",
        body: `${refund.currency} ${refund.workerAmountDeducted.toLocaleString()} has been restored to your earnings for booking "${refund.booking.title}".`,
        type: "REFUND_REVERSED",
        data: { bookingId: refund.bookingId, refundId: refund.id },
        icon: "FaCheckCircle",
      });
    }

    return { success: true, refund };
  } catch (error) {
    throw error;
  }
};

// ── Create a Refund from a resolved Dispute ───────────────────────────
// Called by dispute.controller.resolveDispute when admin resolves as REFUND.
// Creates the Refund record with status APPROVED (admin already decided)
// and returns it. The caller is responsible for calling processRefund().
//
// Params:
//   dispute   — the Dispute Prisma row (with booking populated)
//   payment   — the Payment Prisma row for this booking
//   adminId   — the admin user ID who resolved the dispute
//   options   — { percentage?: number (1–100, default 100), adminNotes?: string }
export const createRefundFromDispute = async (
  dispute,
  payment,
  adminId,
  options = {},
) => {
  const { percentage = 100, adminNotes = "" } = options;

  if (!dispute || !payment) {
    throw new Error(
      "createRefundFromDispute: dispute and payment are required",
    );
  }

  if (typeof percentage !== "number" || percentage < 1 || percentage > 100) {
    throw new Error("createRefundFromDispute: percentage must be 1–100");
  }

  // Calculate prorated amounts using the existing helper
  const calculated = calculateRefundAmounts(
    payment,
    percentage === 100 ? "FULL" : "PARTIAL",
    percentage === 100 ? null : percentage,
  );

  const refund = await prisma.refund.create({
    data: {
      reference: generateRefundReference(),
      bookingId: dispute.bookingId,
      paymentId: payment.id,
      hirerId: dispute.booking?.hirerId || payment.userId,
      workerId: dispute.booking?.workerId || null,
      adminId,
      amount: calculated.refundAmount,
      currency: calculated.currency,
      platformFeeRefunded: calculated.platformFeeRefunded,
      workerAmountDeducted: calculated.workerAmountDeducted,
      refundType: "DISPUTE",
      percentage: calculated.finalPercentage,
      reason:
        `Dispute resolved in favour of the hirer. Original reason: ${dispute.reason}` +
        (adminNotes ? ` | Admin notes: ${adminNotes}` : ""),
      adminNotes: adminNotes || "Created from dispute resolution",
      status: "APPROVED", // admin already approved by resolving the dispute
      disputeId: dispute.id,
      meta: {
        source: "DISPUTE",
        disputeId: dispute.id,
        disputeRaisedBy: dispute.raisedById,
        disputeRaisedByRole: dispute.raisedByRole,
        originalAmount: calculated.originalAmount,
        platformFee: calculated.platformFee,
        workerPayout: calculated.workerPayout,
      },
    },
  });

  return refund;
};

// ── Create a Refund from an admin-initiated refund (legacy payment route) ───
// Used by payment.controller.refundPayment when someone hits
// POST /api/payments/refund/:bookingId. Creates the Refund row and returns it.
// The caller is responsible for calling processRefund().
export const createRefundFromAdmin = async (
  booking,
  payment,
  adminOrHirerId,
  options = {},
) => {
  const { percentage = 100, reason = "Admin-initiated refund" } = options;

  if (!booking || !payment) {
    throw new Error("createRefundFromAdmin: booking and payment are required");
  }

  const calculated = calculateRefundAmounts(
    payment,
    percentage === 100 ? "FULL" : "PARTIAL",
    percentage === 100 ? null : percentage,
  );

  const refund = await prisma.refund.create({
    data: {
      reference: generateRefundReference(),
      bookingId: booking.id,
      paymentId: payment.id,
      hirerId: booking.hirerId,
      workerId: booking.workerId || null,
      adminId: adminOrHirerId,
      amount: calculated.refundAmount,
      currency: calculated.currency,
      platformFeeRefunded: calculated.platformFeeRefunded,
      workerAmountDeducted: calculated.workerAmountDeducted,
      refundType: percentage === 100 ? "FULL" : "PARTIAL",
      percentage: calculated.finalPercentage,
      reason,
      adminNotes: null,
      status: "APPROVED",
      meta: {
        source: "ADMIN",
        originalAmount: calculated.originalAmount,
        platformFee: calculated.platformFee,
        workerPayout: calculated.workerPayout,
        initiatedBy: adminOrHirerId,
      },
    },
  });

  return refund;
};
