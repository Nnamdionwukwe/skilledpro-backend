// src/controllers/admin/admin.refund.controller.js
import prisma from "../../config/database.js";
import { sendResponse, sendError } from "../../utils/response.js";
import { paginate } from "../../utils/helpers.js";
import { processRefund } from "../../services/refund.service.js";
import { createNotification } from "../../services/notification.service.js";
import { logAdminAction } from "../../utils/auditLog.js";

// ── Get All Refunds (Admin) ────────────────────────────────────────
export const getAllRefunds = async (req, res) => {
  try {
    const { status, type, page = 1, limit = 50, fromDate, toDate } = req.query;
    const { skip, take } = paginate(page, limit);

    const where = {};
    if (status) where.status = status;
    if (type) where.refundType = type;
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
    }

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
        stats: await getRefundStats(),
      },
    });
  } catch (err) {
    console.error("getAllRefunds error:", err);
    return sendError(res, "Failed to fetch refunds");
  }
};

// ── Get Refund Stats ──────────────────────────────────────────────────
async function getRefundStats() {
  const stats = await prisma.$transaction([
    prisma.refund.count({ where: { status: "PENDING" } }),
    prisma.refund.count({ where: { status: "APPROVED" } }),
    prisma.refund.count({ where: { status: "PROCESSING" } }),
    prisma.refund.count({ where: { status: "COMPLETED" } }),
    prisma.refund.count({ where: { status: "REJECTED" } }),
    prisma.refund.count({ where: { status: "FAILED" } }),
    prisma.refund.aggregate({
      _sum: { amount: true },
    }),
  ]);

  return {
    pending: stats[0],
    approved: stats[1],
    processing: stats[2],
    completed: stats[3],
    rejected: stats[4],
    failed: stats[5],
    totalRefunded: stats[6]._sum.amount || 0,
  };
}

// ── Approve Refund (Admin) ──────────────────────────────────────────
export const approveRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const refund = await prisma.refund.findUnique({
      where: { id },
      include: {
        booking: true,
        hirer: true,
        worker: true,
      },
    });

    if (!refund) return sendError(res, "Refund not found", 404);

    if (refund.status !== "PENDING") {
      return sendError(
        res,
        `Refund is already ${refund.status.toLowerCase()}`,
        400,
      );
    }

    // Update refund status to APPROVED
    const updated = await prisma.refund.update({
      where: { id },
      data: {
        status: "APPROVED",
        adminId: req.user.id,
        adminNotes: notes || null,
      },
    });

    // Log admin action
    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "REFUND_APPROVED",
      targetType: "REFUND",
      targetId: refund.id,
      description: `Approved refund ${refund.reference} for booking ${refund.booking.title}`,
      meta: {
        amount: refund.amount,
        currency: refund.currency,
        refundType: refund.refundType,
      },
    });

    // Process the refund
    await processRefund(id);

    // Notify hirer
    await createNotification({
      userId: refund.hirerId,
      title: "Refund Approved",
      body: `Your refund of ${refund.currency} ${refund.amount.toLocaleString()} for booking "${refund.booking.title}" has been approved and is being processed.`,
      type: "REFUND_APPROVED",
      data: { bookingId: refund.bookingId, refundId: refund.id },
      icon: "FaCheckCircle",
    });

    return sendResponse(res, {
      message: "Refund approved and processed successfully",
      data: { refund: updated },
    });
  } catch (err) {
    console.error("approveRefund error:", err);
    return sendError(res, "Failed to approve refund");
  }
};

// ── Reject Refund (Admin) ──────────────────────────────────────────
export const rejectRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return sendError(res, "Rejection reason is required", 400);
    }

    const refund = await prisma.refund.findUnique({
      where: { id },
      include: {
        booking: true,
        hirer: true,
      },
    });

    if (!refund) return sendError(res, "Refund not found", 404);

    if (refund.status !== "PENDING") {
      return sendError(
        res,
        `Refund is already ${refund.status.toLowerCase()}`,
        400,
      );
    }

    const updated = await prisma.refund.update({
      where: { id },
      data: {
        status: "REJECTED",
        adminId: req.user.id,
        adminNotes: reason.trim(),
      },
    });

    // Log admin action
    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "REFUND_REJECTED",
      targetType: "REFUND",
      targetId: refund.id,
      description: `Rejected refund ${refund.reference} for booking ${refund.booking.title}`,
      meta: {
        amount: refund.amount,
        currency: refund.currency,
        reason: reason,
      },
    });

    // Notify hirer
    await createNotification({
      userId: refund.hirerId,
      title: "Refund Rejected",
      body: `Your refund request for booking "${refund.booking.title}" was rejected. Reason: ${reason}`,
      type: "REFUND_REJECTED",
      data: { bookingId: refund.bookingId, refundId: refund.id },
      icon: "FaTimesCircle",
    });

    return sendResponse(res, {
      message: "Refund rejected",
      data: { refund: updated },
    });
  } catch (err) {
    console.error("rejectRefund error:", err);
    return sendError(res, "Failed to reject refund");
  }
};

// ── Toggle Auto-Approval Settings ──────────────────────────────────
export const toggleAutoApproval = async (req, res) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      return sendError(res, "Enabled must be a boolean", 400);
    }

    const settings = await prisma.appSettings.upsert({
      where: { key: "refund_auto_approve" },
      update: { value: String(enabled) },
      create: {
        key: "refund_auto_approve",
        value: String(enabled),
        description: "Automatically approve refund requests within 48 hours",
      },
    });

    // Log admin action
    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "SETTINGS_CHANGED",
      targetType: "SYSTEM",
      description: `Auto-approval for refunds set to ${enabled ? "enabled" : "disabled"}`,
      meta: { setting: "refund_auto_approve", value: enabled },
    });

    return sendResponse(res, {
      message: `Auto-approval ${enabled ? "enabled" : "disabled"}`,
      data: { settings },
    });
  } catch (err) {
    console.error("toggleAutoApproval error:", err);
    return sendError(res, "Failed to update settings");
  }
};
