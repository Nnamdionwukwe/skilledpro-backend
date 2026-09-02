// src/controllers/refund.controller.js
import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { paginate } from "../utils/helpers.js";
import {
  isRefundEligible,
  calculateRefundAmounts,
  generateRefundReference,
  processRefund,
  autoApproveRefund,
} from "../services/refund.service.js";
import { createNotification } from "../services/notification.service.js";

// ── Request Refund ──────────────────────────────────────────────────
export const requestRefund = async (req, res) => {
  try {
    const { bookingId, paymentId, refundType, percentage, amount, reason } =
      req.body;

    // Validate required fields
    if (!bookingId || !paymentId || !refundType || !reason) {
      return sendError(
        res,
        "Missing required fields: bookingId, paymentId, refundType, reason",
        400,
      );
    }

    // Check if booking exists
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        hirer: true,
        worker: true,
      },
    });

    if (!booking) return sendError(res, "Booking not found", 404);

    // Check if user is the hirer
    if (booking.hirerId !== req.user.id) {
      return sendError(res, "Only the hirer can request a refund", 403);
    }

    // Check if refund is eligible
    if (!isRefundEligible(booking)) {
      return sendError(
        res,
        "Refund window has expired (48 hours after completion)",
        400,
      );
    }

    // Check if payment exists
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) return sendError(res, "Payment not found", 404);

    // Check if refund already exists for this payment
    const existingRefund = await prisma.refund.findFirst({
      where: {
        paymentId: paymentId,
        status: { notIn: ["REJECTED", "FAILED"] },
      },
    });

    if (existingRefund) {
      return sendError(res, "A refund already exists for this payment", 400);
    }

    // Calculate refund amounts
    let refundAmount = amount || 0;
    let calculatedAmounts = {};

    if (refundType === "FULL") {
      calculatedAmounts = calculateRefundAmounts(payment, "FULL");
      refundAmount = calculatedAmounts.refundAmount;
    } else if (refundType === "PARTIAL") {
      const pct = percentage || 50;
      calculatedAmounts = calculateRefundAmounts(payment, "PARTIAL", pct);
      refundAmount = calculatedAmounts.refundAmount;
    } else if (refundType === "CUSTOM_AMOUNT") {
      if (!amount || amount <= 0) {
        return sendError(
          res,
          "Custom amount is required for CUSTOM_AMOUNT refunds",
          400,
        );
      }
      const customPct = (amount / payment.amount) * 100;
      calculatedAmounts = calculateRefundAmounts(payment, "PARTIAL", customPct);
      refundAmount = amount;
    }

    // Create refund record
    const refund = await prisma.refund.create({
      data: {
        bookingId,
        paymentId,
        hirerId: booking.hirerId,
        workerId: booking.workerId,
        amount: refundAmount,
        currency: payment.currency || "NGN",
        platformFeeRefunded: calculatedAmounts.platformFeeRefunded || 0,
        workerAmountDeducted: calculatedAmounts.workerAmountDeducted || 0,
        refundType: refundType,
        percentage: calculatedAmounts.finalPercentage || null,
        reason: reason.trim(),
        status: "PENDING",
        reference: generateRefundReference(),
        meta: {
          originalAmount: payment.amount,
          platformFee: payment.platformFee,
          workerPayout: payment.workerPayout,
          requestedAt: new Date().toISOString(),
        },
      },
    });

    // Auto-approve if enabled
    await autoApproveRefund(refund.id);

    // Notify admin
    await createNotification({
      userId: "admin",
      title: "New Refund Request",
      body: `${booking.hirer.firstName} ${booking.hirer.lastName} requested a refund for booking "${booking.title}"`,
      type: "REFUND_REQUESTED",
      data: { bookingId, refundId: refund.id },
      icon: "FaMoneyBillWave",
    });

    return sendResponse(res, {
      status: 201,
      message: "Refund requested successfully",
      data: { refund },
    });
  } catch (err) {
    console.error("requestRefund error:", err);
    return sendError(res, "Failed to request refund");
  }
};

// ── Get User Refunds ──────────────────────────────────────────────────
export const getMyRefunds = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const { skip, take } = paginate(page, limit);

    const where = {
      OR: [{ hirerId: req.user.id }, { workerId: req.user.id }],
    };

    if (status) where.status = status;

    const [refunds, total] = await Promise.all([
      prisma.refund.findMany({
        where,
        skip,
        take,
        include: {
          booking: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
          payment: {
            select: {
              id: true,
              provider: true,
              providerRef: true,
            },
          },
          admin: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.refund.count({ where }),
    ]);

    return sendResponse(res, {
      data: {
        refunds,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    console.error("getMyRefunds error:", err);
    return sendError(res, "Failed to fetch refunds");
  }
};

// ── Get Refund Details ──────────────────────────────────────────────────
export const getRefundDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const refund = await prisma.refund.findUnique({
      where: { id },
      include: {
        booking: {
          include: {
            hirer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            worker: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            category: true,
          },
        },
        payment: true,
        admin: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!refund) return sendError(res, "Refund not found", 404);

    // Check permission
    if (
      refund.hirerId !== req.user.id &&
      refund.workerId !== req.user.id &&
      req.user.role !== "ADMIN"
    ) {
      return sendError(res, "Forbidden", 403);
    }

    return sendResponse(res, { data: { refund } });
  } catch (err) {
    console.error("getRefundDetails error:", err);
    return sendError(res, "Failed to fetch refund details");
  }
};
