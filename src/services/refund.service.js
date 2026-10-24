// src/services/refund.service.js
import prisma from "../config/database.js";
import { createNotification } from "./notification.service.js";
import { v4 as uuidv4 } from "uuid";
import { FEE_CONFIG } from "../config/fees.js";

// ── Constants ──────────────────────────────────────────────────────────
const REFUND_TIME_LIMIT_HOURS = 48;
const PLATFORM_FEE_PERCENT = FEE_CONFIG.HIRER_FEE_RATE;
const AUTO_APPROVE_THRESHOLD_HOURS = 48;
const AUTO_APPROVE_MAX_AMOUNT = 50000;
const AUTO_APPROVE_SETTING_KEY = "refund_auto_approve";

const PS_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PS_BASE = "https://api.paystack.co";
const FLW_SECRET = process.env.FLUTTERWAVE_SECRET_KEY;
const FLW_BASE = "https://api.flutterwave.com/v3";

// ── Provider refund helper ─────────────────────────────────────────────
// Issues a refund through the original payment provider. Throws on failure
// so processRefund can roll back before touching the wallet or worker side.
//
// Paystack: accepts `reference` (your PAY-xxx) in place of `transaction`.
//           Amount in kobo.
// Flutterwave: requires the numeric transaction ID (payment.providerTxId),
//              which is persisted during verifyFlutterwave / webhook.
//              Amount in major units (not kobo).
async function issueProviderRefund(payment, refundAmount, refundReference) {
  if (!refundAmount || refundAmount <= 0) {
    return { skipped: true, reason: "zero_amount" };
  }

  const provider = (payment.provider || "").toLowerCase();
  const PS_SECRET = process.env.PAYSTACK_SECRET_KEY;
  const FLW_SECRET = process.env.FLUTTERWAVE_SECRET_KEY;

  // ── Paystack ────────────────────────────────────────────────────────
  if (provider === "paystack") {
    if (!PS_SECRET) {
      throw new Error("PAYSTACK_SECRET_KEY not configured");
    }

    const body = {
      reference: payment.providerRef, // PAY-xxx
      amount: Math.round(Number(refundAmount) * 100), // kobo
    };
    if (refundReference) body.merchant_note = refundReference;

    const res = await fetch("https://api.paystack.co/refund", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PS_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (data.status !== true) {
      throw new Error(`Paystack refund failed: ${data.message || "unknown"}`);
    }

    return {
      provider: "paystack",
      providerRefundId: data.data?.id ? String(data.data.id) : null,
      status: data.data?.status || "processing",
    };
  }

  // ── Flutterwave ─────────────────────────────────────────────────────
  if (provider === "flutterwave") {
    if (!FLW_SECRET) {
      throw new Error("FLUTTERWAVE_SECRET_KEY not configured");
    }

    const txId = payment.providerTxId;
    if (!txId) {
      throw new Error(
        `Flutterwave refund requires providerTxId on payment ${payment.id} — ` +
          `not stored. This payment was likely captured before the schema change. ` +
          `Issue the refund manually in the Flutterwave dashboard.`,
      );
    }

    const res = await fetch(
      `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(txId)}/refund`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FLW_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: Number(refundAmount),
          comments: refundReference || "SkilledProz refund",
        }),
      },
    );
    const data = await res.json();

    if (data.status !== "success") {
      throw new Error(
        `Flutterwave refund failed: ${data.message || "unknown"}`,
      );
    }

    return {
      provider: "flutterwave",
      providerRefundId: data.data?.id ? String(data.data.id) : null,
      status: data.data?.status || "processing",
    };
  }

  // ── Manual methods (wallet, bank_transfer, crypto) ──────────────────
  return { skipped: true, reason: `manual_provider_${provider || "unknown"}` };
}

// ── Check if refund is within time limit ────────────────────────────
export const isRefundEligible = (booking) => {
  if (booking.status !== "COMPLETED") return false;
  const completedAt = booking.completedAt || booking.updatedAt;
  const hoursSinceCompletion =
    (Date.now() - new Date(completedAt).getTime()) / (1000 * 60 * 60);
  return hoursSinceCompletion <= REFUND_TIME_LIMIT_HOURS;
};

// ── Calculate refund amounts ────────────────────────────────────────
//
// Escrow-aware: whatever has already been released to the worker is
// NON-REFUNDABLE.
//
// Fee-aware: the platform service fee is ALSO non-refundable by default
// (per ToS §7). It was already incurred with Paystack/Flutterwave for
// the original transaction. Pass `{ refundPlatformFee: true }` from
// dispute resolution to opt in — that path represents a refund caused
// by worker fault, where the hirer should not bear the fee.
export const calculateRefundAmounts = (
  payment,
  refundType,
  percentage = null,
  { refundPlatformFee = false } = {},
) => {
  const currency = payment.currency || "NGN";
  const originalAmount = Number(payment.amount) || 0;
  const platformFee =
    Number(payment.platformFee) ||
    parseFloat((originalAmount * PLATFORM_FEE_PERCENT).toFixed(2));
  const fullWorkerPayout =
    Number(payment.workerPayout) ||
    parseFloat((originalAmount - platformFee).toFixed(2));

  // ── Escrow-aware: released amount is off-limits ─────────────────────
  const releasedAmount = Number(payment.releasedAmount) || 0;
  const refundableWorkerPayout = parseFloat(
    Math.max(0, fullWorkerPayout - releasedAmount).toFixed(2),
  );

  // ── Platform fee is NON-REFUNDABLE by default (ToS §7) ──────────────
  // Only dispute resolution paths opt in via `refundPlatformFee: true`.
  const maxPlatformFeeRefundable = refundPlatformFee
    ? parseFloat(Math.max(0, platformFee).toFixed(2))
    : 0;

  const maxRefundableTotal = parseFloat(
    (refundableWorkerPayout + maxPlatformFeeRefundable).toFixed(2),
  );

  let refundAmount = 0;
  let platformFeeRefunded = 0;
  let workerAmountDeducted = 0;
  let finalPercentage = 0;

  switch (refundType) {
    case "FULL":
      refundAmount = maxRefundableTotal;
      platformFeeRefunded = maxPlatformFeeRefundable;
      workerAmountDeducted = refundableWorkerPayout;
      finalPercentage =
        originalAmount > 0
          ? parseFloat(((refundAmount / originalAmount) * 100).toFixed(2))
          : 0;
      break;

    case "PARTIAL": {
      const pct = percentage || 50;
      finalPercentage = pct;

      const rawTotal = (maxRefundableTotal * pct) / 100;
      const rawFee = (maxPlatformFeeRefundable * pct) / 100;
      const rawWorker = (refundableWorkerPayout * pct) / 100;

      refundAmount = parseFloat(
        Math.min(rawTotal, maxRefundableTotal).toFixed(2),
      );
      platformFeeRefunded = parseFloat(
        Math.min(rawFee, maxPlatformFeeRefundable).toFixed(2),
      );
      workerAmountDeducted = parseFloat(
        Math.min(rawWorker, refundableWorkerPayout).toFixed(2),
      );
      break;
    }

    case "CUSTOM_AMOUNT":
      finalPercentage =
        originalAmount > 0 ? (refundAmount / originalAmount) * 100 : 0;
      break;

    case "DISPUTE":
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
    workerPayout: fullWorkerPayout,
    refundableWorkerPayout,
    releasedAmount,
    maxRefundableTotal,
  };
};

// ── Guard: refunds cannot exceed the remaining escrow ──────────────
function assertRefundableWithinEscrow(payment, requestedAmount, context) {
  const originalAmount = Number(payment.amount) || 0;
  const releasedAmount = Number(payment.releasedAmount) || 0;
  const maxRefundable = parseFloat(
    Math.max(0, originalAmount - releasedAmount).toFixed(2),
  );

  if (requestedAmount > maxRefundable) {
    throw new Error(
      `${context}: cannot refund ${requestedAmount} ${payment.currency} — ` +
        `only ${maxRefundable} remains in escrow (${releasedAmount} already released to the worker).`,
    );
  }
}

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
  if (refund.status !== "PENDING") return false;
  if (!["FULL", "PARTIAL"].includes(refund.refundType)) return false;
  if (refund.amount > settings.maxAmount) return false;

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

    await prisma.refund.update({
      where: { id: refundId },
      data: {
        status: "APPROVED",
        adminNotes: "Auto-approved by system",
      },
    });

    await processRefund(refundId);

    await createNotification({
      userId: refund.hirerId,
      title: "Refund Auto-Approved",
      body: `Your refund of ${refund.currency} ${refund.amount.toLocaleString()} for booking "${refund.booking?.title}" has been auto-approved and is being processed.`,
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
//
// This is the critical piece. Order of operations:
//   1. Mark refund PROCESSING
//   2. Call the provider refund API (Paystack/Flutterwave) — the money
//      actually leaves your provider balance here. If this throws, we
//      abort and mark FAILED so nothing else is mutated.
//   3. On success, credit the hirer's wallet (for their records and for
//      any subsequent withdrawal). This is the audit trail; the cash
//      movement already happened in step 2.
//   4. Handle the worker side (debit earnings or create debt)
//   5. Flip payment → REFUNDED, refund → COMPLETED
//   6. Notify both parties
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
    // 1. Mark PROCESSING (prevents concurrent processing)
    await prisma.refund.update({
      where: { id: refundId },
      data: { status: "PROCESSING" },
    });

    // 2. Call the provider refund FIRST. Irreversible step — if this
    //    throws, we abort without touching wallet or worker state.
    const providerResult = await issueProviderRefund(
      refund.payment,
      refund.amount,
      refund.reference,
    );

    // 3. Credit the hirer's wallet (audit trail + on-platform balance
    //    that the hirer can withdraw from).
    let hirerWallet = await prisma.hirerWallet.findFirst({
      where: {
        hirerId: refund.hirerId,
        currency: refund.currency || "NGN",
      },
    });

    if (!hirerWallet) {
      hirerWallet = await prisma.hirerWallet.create({
        data: {
          hirerId: refund.hirerId,
          currency: refund.currency || "NGN",
          balance: 0,
        },
      });
    }

    await prisma.hirerWallet.update({
      where: { id: hirerWallet.id },
      data: {
        balance: { increment: refund.amount },
        totalRefunded: { increment: refund.amount },
      },
    });

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
          providerRefundId: providerResult.providerRefundId || null,
          provider: providerResult.provider || null,
          providerSkipped: !!providerResult.skipped,
          providerSkipReason: providerResult.reason || null,
        },
      },
    });

    // 4. Handle the worker's side (debt-aware)
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
          // ── CASE D: Worker already withdrew — create a debt ─────────
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

          await prisma.workerProfile.update({
            where: { id: workerProfile.id },
            data: {
              debtBalance: { increment: amountToClawBack },
              debtCreatedAt:
                workerProfile.debtBalance === 0 ? new Date() : undefined,
              debtReason: "Outstanding dispute refund debt",
            },
          });

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
        } else {
          // ── CASE A/B/C: Worker still holds the funds — debit earnings ─
          await prisma.workerProfile.update({
            where: { id: workerProfile.id },
            data: {
              totalEarnings: { decrement: amountToClawBack },
            },
          });
        }
      }
    }

    // 5. Payment → REFUNDED
    await prisma.payment.update({
      where: { id: refund.paymentId },
      data: {
        status: "REFUNDED",
        refundedAt: new Date(),
      },
    });

    // 6. Refund → COMPLETED
    await prisma.refund.update({
      where: { id: refundId },
      data: {
        status: "COMPLETED",
        processedAt: new Date(),
        meta: {
          ...(refund.meta || {}),
          providerRefund: {
            provider: providerResult.provider || null,
            providerRefundId: providerResult.providerRefundId || null,
            providerStatus: providerResult.status || null,
            skipped: !!providerResult.skipped,
            reason: providerResult.reason || null,
            processedAt: new Date().toISOString(),
          },
        },
      },
    });

    // 7. Booking counters
    await prisma.booking
      .update({
        where: { id: refund.bookingId },
        data: {
          refundCount: { increment: 1 },
          totalRefunded: { increment: refund.amount },
        },
      })
      .catch(() => {});

    // 8. Notifications
    const feeNote =
      refund.platformFeeRefunded > 0
        ? ` (includes platform fee refund of ${refund.currency} ${refund.platformFeeRefunded.toLocaleString()})`
        : ` (platform fee of ${refund.currency} ${Number(refund.payment.platformFee || 0).toLocaleString()} is non-refundable per our terms)`;

    await createNotification({
      userId: refund.hirerId,
      title: "Refund Processed",
      body: `${refund.currency} ${refund.amount.toLocaleString()} has been refunded to your wallet${feeNote}.`,
      type: "REFUND_COMPLETED",
      data: { bookingId: refund.bookingId, refundId: refund.id },
      icon: "FaMoneyBillWave",
    });

    if (refund.workerId && refund.workerAmountDeducted > 0) {
      await createNotification({
        userId: refund.workerId,
        title: "Refund Processed",
        body: `${refund.currency} ${refund.workerAmountDeducted.toLocaleString()} has been deducted from your earnings for booking "${refund.booking.title}".`,
        type: "REFUND_DEDUCTED",
        data: { bookingId: refund.bookingId, refundId: refund.id },
        icon: "FaExclamationTriangle",
      });
    }

    return { success: true, refund, providerResult };
  } catch (error) {
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
//
// Reversal is only supported for the wallet-credit side of the refund.
// If the provider refund (Paystack/Flutterwave) already went out, that
// money is gone — you'd need to re-charge the hirer to recover it, which
// is out of scope. We log a warning in that case so the admin knows.
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

  const providerRefundMeta = refund.meta?.providerRefund;
  const providerRefundWasIssued =
    providerRefundMeta && !providerRefundMeta.skipped;

  if (providerRefundWasIssued) {
    console.warn(
      `[reverseRefund] Refund ${refund.id} had a provider refund issued (${providerRefundMeta.provider}/${providerRefundMeta.providerRefundId}). ` +
        `Reversal will only undo the internal wallet bookkeeping — the provider refund itself cannot be recalled automatically.`,
    );
  }

  try {
    // 1. Debit Hirer's wallet
    const hirerWallet = await prisma.hirerWallet.findFirst({
      where: {
        hirerId: refund.hirerId,
        currency: refund.currency || "NGN",
      },
    });

    if (hirerWallet) {
      await prisma.hirerWallet.update({
        where: { id: hirerWallet.id },
        data: {
          balance: { decrement: refund.amount },
          totalRefunded: { decrement: refund.amount },
        },
      });

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
            providerRefundNotRecalled: providerRefundWasIssued,
          },
        },
      });
    }

    // 2. Credit Worker's earnings back
    if (refund.workerId) {
      const debtsFromThisRefund = await prisma.workerDebt.findMany({
        where: { refundId: refund.id, status: "OUTSTANDING" },
      });

      for (const debt of debtsFromThisRefund) {
        await prisma.workerProfile.update({
          where: { userId: refund.workerId },
          data: { debtBalance: { decrement: debt.amount } },
        });

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

      await prisma.workerProfile
        .update({
          where: { userId: refund.workerId },
          data: {
            totalEarnings: { increment: refund.workerAmountDeducted },
          },
        })
        .catch(() => {});
    }

    // 3. Payment → RELEASED
    await prisma.payment.update({
      where: { id: refund.paymentId },
      data: {
        status: "RELEASED",
        escrowReleasedAt: new Date(),
      },
    });

    // 4. Refund → REVERSED
    await prisma.refund.update({
      where: { id: refundId },
      data: {
        status: "REVERSED",
        adminId: adminId,
        adminNotes: `Reversed by admin ${adminId}`,
      },
    });

    // 5. Notifications
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
//
// Disputes resolved in the hirer's favour refund the platform fee too,
// because the worker failed — the hirer shouldn't pay for the platform's
// selection or the worker's failure.
export const createRefundFromDispute = async (
  dispute,
  payment,
  adminId,
  options = {},
) => {
  const {
    percentage = 100,
    adminNotes = "",
    refundPlatformFee = true, // disputes refund the fee by default
  } = options;

  if (!dispute || !payment) {
    throw new Error(
      "createRefundFromDispute: dispute and payment are required",
    );
  }

  if (typeof percentage !== "number" || percentage < 1 || percentage > 100) {
    throw new Error("createRefundFromDispute: percentage must be 1–100");
  }

  const calculated = calculateRefundAmounts(
    payment,
    percentage === 100 ? "FULL" : "PARTIAL",
    percentage === 100 ? null : percentage,
    { refundPlatformFee },
  );

  assertRefundableWithinEscrow(
    payment,
    calculated.refundAmount,
    "createRefundFromDispute",
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
      status: "APPROVED",
      disputeId: dispute.id,
      meta: {
        source: "DISPUTE",
        disputeId: dispute.id,
        disputeRaisedBy: dispute.raisedById,
        disputeRaisedByRole: dispute.raisedByRole,
        originalAmount: calculated.originalAmount,
        platformFee: calculated.platformFee,
        workerPayout: calculated.workerPayout,
        refundableWorkerPayout: calculated.refundableWorkerPayout,
        releasedAmount: calculated.releasedAmount,
        refundedPlatformFee: refundPlatformFee,
      },
    },
  });

  return refund;
};

// ── Create a Refund from an admin-initiated refund ──────────────────────
//
// Admin/hirer-initiated refunds (voluntary cancellation, legacy
// /refund/:bookingId endpoint) retain the platform fee by default —
// the fee was already incurred with the provider for the original charge.
export const createRefundFromAdmin = async (
  booking,
  payment,
  adminOrHirerId,
  options = {},
) => {
  const {
    percentage = 100,
    reason = "Admin-initiated refund",
    refundPlatformFee = false, // voluntary refunds keep the fee
  } = options;

  if (!booking || !payment) {
    throw new Error("createRefundFromAdmin: booking and payment are required");
  }

  const calculated = calculateRefundAmounts(
    payment,
    percentage === 100 ? "FULL" : "PARTIAL",
    percentage === 100 ? null : percentage,
    { refundPlatformFee },
  );

  assertRefundableWithinEscrow(
    payment,
    calculated.refundAmount,
    "createRefundFromAdmin",
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
        refundableWorkerPayout: calculated.refundableWorkerPayout,
        releasedAmount: calculated.releasedAmount,
        refundedPlatformFee: refundPlatformFee,
        initiatedBy: adminOrHirerId,
      },
    },
  });

  return refund;
};
