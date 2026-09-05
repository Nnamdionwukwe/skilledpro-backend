// src/controllers/admin.refund.controller.js
import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { paginate } from "../utils/helpers.js";
import {
  processRefund,
  reverseRefund as reverseRefundService,
} from "../services/refund.service.js";
import { createNotification } from "../services/notification.service.js";
import { logAdminAction } from "../utils/auditLog.js";

// ── Get All Refunds (Admin) ────────────────────────────────────────
export const getAllRefunds = async (req, res) => {
  try {
    const {
      status,
      type,
      page = 1,
      limit = 50,
      fromDate,
      toDate,
      search,
    } = req.query;
    const { skip, take } = paginate(page, limit);

    const where = {};
    if (status) where.status = status;
    if (type) where.refundType = type;
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
    }
    if (search) {
      where.OR = [
        { reference: { contains: search, mode: "insensitive" } },
        { booking: { title: { contains: search, mode: "insensitive" } } },
        { hirer: { firstName: { contains: search, mode: "insensitive" } } },
        { hirer: { lastName: { contains: search, mode: "insensitive" } } },
        { worker: { firstName: { contains: search, mode: "insensitive" } } },
        { worker: { lastName: { contains: search, mode: "insensitive" } } },
      ];
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

    const stats = await getRefundStatsData();

    return sendResponse(res, {
      data: {
        refunds,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
        stats,
      },
    });
  } catch (err) {
    console.error("getAllRefunds error:", err);
    return sendError(res, "Failed to fetch refunds");
  }
};

// ── Get Refund Stats Data (internal) ──────────────────────────────────
async function getRefundStatsData() {
  const stats = await prisma.$transaction([
    prisma.refund.count({ where: { status: "PENDING" } }),
    prisma.refund.count({ where: { status: "APPROVED" } }),
    prisma.refund.count({ where: { status: "PROCESSING" } }),
    prisma.refund.count({ where: { status: "COMPLETED" } }),
    prisma.refund.count({ where: { status: "REJECTED" } }),
    prisma.refund.count({ where: { status: "FAILED" } }),
    prisma.refund.count({ where: { status: "DISPUTED" } }),
    prisma.refund.count({ where: { status: "REVERSED" } }),
    prisma.refund.aggregate({
      _sum: { amount: true },
    }),
    prisma.refund.aggregate({
      where: { status: "PENDING" },
      _sum: { amount: true },
    }),
    prisma.refund.aggregate({
      where: { status: "COMPLETED" },
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
    disputed: stats[6],
    reversed: stats[7],
    totalRefunded: stats[8]._sum.amount || 0,
    pendingAmount: stats[9]._sum.amount || 0,
    completedAmount: stats[10]._sum.amount || 0,
  };
}

// ── Get Refund Stats (Route) ──────────────────────────────────────
export const getRefundStats = async (req, res) => {
  try {
    const stats = await getRefundStatsData();
    return sendResponse(res, { data: { stats } });
  } catch (err) {
    console.error("getRefundStats error:", err);
    return sendError(res, "Failed to fetch refund stats");
  }
};

// ── Get Refund Details (Admin) ──────────────────────────────────────
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
                phone: true,
              },
            },
            worker: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
            category: true,
          },
        },
        payment: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        hirer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        worker: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
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

    return sendResponse(res, { data: { refund } });
  } catch (err) {
    console.error("getRefundDetails error:", err);
    return sendError(res, "Failed to fetch refund details");
  }
};

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

    const updated = await prisma.refund.update({
      where: { id },
      data: {
        status: "APPROVED",
        adminId: req.user.id,
        adminNotes: notes || null,
      },
    });

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

    await processRefund(id);

    await createNotification({
      userId: refund.hirerId,
      title: "Refund Approved ✅",
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

    await createNotification({
      userId: refund.hirerId,
      title: "Refund Rejected ❌",
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

// ── Reverse Refund (Admin) ──────────────────────────────────────────
export const reverseRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const refund = await prisma.refund.findUnique({
      where: { id },
      include: {
        booking: true,
        hirer: true,
        worker: true,
      },
    });

    if (!refund) return sendError(res, "Refund not found", 404);

    if (refund.status !== "COMPLETED") {
      return sendError(
        res,
        `Refund is ${refund.status.toLowerCase()}, only completed refunds can be reversed`,
        400,
      );
    }

    const result = await reverseRefundService(id, req.user.id);

    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "REFUND_REVERSED",
      targetType: "REFUND",
      targetId: refund.id,
      description: `Reversed refund ${refund.reference} for booking ${refund.booking.title}`,
      meta: {
        amount: refund.amount,
        currency: refund.currency,
        reason: reason || "Admin reversal",
      },
    });

    await Promise.all([
      createNotification({
        userId: refund.hirerId,
        title: "Refund Reversed 🔄",
        body: `Your refund of ${refund.currency} ${refund.amount.toLocaleString()} for booking "${refund.booking.title}" has been reversed.`,
        type: "REFUND_REVERSED",
        data: { bookingId: refund.bookingId, refundId: refund.id },
        icon: "FaExclamationTriangle",
      }),
      createNotification({
        userId: refund.workerId,
        title: "Refund Reversed 🔄",
        body: `The refund deduction of ${refund.currency} ${refund.workerAmountDeducted.toLocaleString()} for booking "${refund.booking.title}" has been reversed.`,
        type: "REFUND_REVERSED",
        data: { bookingId: refund.bookingId, refundId: refund.id },
        icon: "FaCheckCircle",
      }),
    ]);

    return sendResponse(res, {
      message: "Refund reversed successfully",
      data: { refund: result.refund },
    });
  } catch (err) {
    console.error("reverseRefund error:", err);
    return sendError(res, "Failed to reverse refund");
  }
};

// ── Bulk Approve Refunds (Admin) ────────────────────────────────────
export const bulkApproveRefunds = async (req, res) => {
  try {
    const { refundIds, notes } = req.body;

    if (!refundIds || !Array.isArray(refundIds) || refundIds.length === 0) {
      return sendError(res, "Refund IDs array is required", 400);
    }

    const results = {
      approved: [],
      failed: [],
    };

    for (const refundId of refundIds) {
      try {
        const refund = await prisma.refund.findUnique({
          where: { id: refundId },
          include: { booking: true },
        });

        if (!refund || refund.status !== "PENDING") {
          results.failed.push({
            id: refundId,
            reason: "Not pending or not found",
          });
          continue;
        }

        await prisma.refund.update({
          where: { id: refundId },
          data: {
            status: "APPROVED",
            adminId: req.user.id,
            adminNotes: notes || "Bulk approved",
          },
        });

        await processRefund(refundId);
        results.approved.push(refundId);
      } catch (err) {
        results.failed.push({ id: refundId, reason: err.message });
      }
    }

    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "REFUND_BULK_APPROVED",
      targetType: "REFUND",
      description: `Bulk approved ${results.approved.length} refunds`,
      meta: {
        approved: results.approved,
        failed: results.failed,
      },
    });

    return sendResponse(res, {
      message: `Bulk approve completed: ${results.approved.length} approved, ${results.failed.length} failed`,
      data: results,
    });
  } catch (err) {
    console.error("bulkApproveRefunds error:", err);
    return sendError(res, "Failed to bulk approve refunds");
  }
};

// ── Bulk Reject Refunds (Admin) ────────────────────────────────────
export const bulkRejectRefunds = async (req, res) => {
  try {
    const { refundIds, reason } = req.body;

    if (!refundIds || !Array.isArray(refundIds) || refundIds.length === 0) {
      return sendError(res, "Refund IDs array is required", 400);
    }

    if (!reason) {
      return sendError(res, "Rejection reason is required", 400);
    }

    const results = {
      rejected: [],
      failed: [],
    };

    for (const refundId of refundIds) {
      try {
        const refund = await prisma.refund.findUnique({
          where: { id: refundId },
          include: { booking: true, hirer: true },
        });

        if (!refund || refund.status !== "PENDING") {
          results.failed.push({
            id: refundId,
            reason: "Not pending or not found",
          });
          continue;
        }

        await prisma.refund.update({
          where: { id: refundId },
          data: {
            status: "REJECTED",
            adminId: req.user.id,
            adminNotes: reason.trim(),
          },
        });

        await createNotification({
          userId: refund.hirerId,
          title: "Refund Rejected ❌",
          body: `Your refund request for booking "${refund.booking.title}" was rejected. Reason: ${reason}`,
          type: "REFUND_REJECTED",
          data: { bookingId: refund.bookingId, refundId: refund.id },
          icon: "FaTimesCircle",
        });

        results.rejected.push(refundId);
      } catch (err) {
        results.failed.push({ id: refundId, reason: err.message });
      }
    }

    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "REFUND_BULK_REJECTED",
      targetType: "REFUND",
      description: `Bulk rejected ${results.rejected.length} refunds`,
      meta: {
        rejected: results.rejected,
        failed: results.failed,
      },
    });

    return sendResponse(res, {
      message: `Bulk reject completed: ${results.rejected.length} rejected, ${results.failed.length} failed`,
      data: results,
    });
  } catch (err) {
    console.error("bulkRejectRefunds error:", err);
    return sendError(res, "Failed to bulk reject refunds");
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

// ── Get Auto-Approval Status ────────────────────────────────────────
export const getAutoApprovalStatus = async (req, res) => {
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { key: "refund_auto_approve" },
    });

    return sendResponse(res, {
      data: {
        enabled: settings?.value === "true" || false,
        description:
          settings?.description ||
          "Automatically approve refund requests within 48 hours",
      },
    });
  } catch (err) {
    console.error("getAutoApprovalStatus error:", err);
    return sendError(res, "Failed to get auto-approval status");
  }
};
