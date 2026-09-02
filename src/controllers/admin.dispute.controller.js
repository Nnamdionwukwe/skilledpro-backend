// src/controllers/admin/admin.dispute.controller.js
import prisma from "../../config/database.js";
import { sendResponse, sendError } from "../../utils/response.js";
import { createNotification } from "../../services/notification.service.js";
import { logAdminAction } from "../../utils/auditLog.js";
import { processRefund } from "../../services/refund.service.js";

// ── Get All Disputes ──────────────────────────────────────────────────
export const getAllDisputes = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const { skip, take } = paginate(page, limit);

    const where = {};
    if (status) where.status = status;

    const [disputes, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        skip,
        take,
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
      prisma.dispute.count({ where }),
    ]);

    return sendResponse(res, {
      data: {
        disputes,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    console.error("getAllDisputes error:", err);
    return sendError(res, "Failed to fetch disputes");
  }
};

// ── Resolve Dispute ──────────────────────────────────────────────────
export const resolveDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution, decision, adminNotes } = req.body;

    if (!resolution || !decision) {
      return sendError(res, "Resolution and decision are required", 400);
    }

    const dispute = await prisma.dispute.findUnique({
      where: { id },
      include: {
        booking: {
          include: {
            hirer: true,
            worker: true,
          },
        },
      },
    });

    if (!dispute) return sendError(res, "Dispute not found", 404);

    let refund = null;
    let refundId = null;

    // If decision is to refund the hirer
    if (decision === "REFUND_HIRER") {
      // Create refund
      const payment = await prisma.payment.findFirst({
        where: { bookingId: dispute.bookingId },
      });

      if (payment) {
        refund = await prisma.refund.create({
          data: {
            bookingId: dispute.bookingId,
            paymentId: payment.id,
            hirerId: dispute.booking.hirerId,
            workerId: dispute.booking.workerId,
            amount: payment.amount,
            currency: payment.currency || "NGN",
            platformFeeRefunded: payment.platformFee || 0,
            workerAmountDeducted: payment.workerPayout || 0,
            refundType: "DISPUTE",
            reason: `Dispute resolution: ${resolution}`,
            status: "APPROVED",
            reference: `REF-${Date.now()}-${dispute.id.slice(0, 8)}`,
            adminId: req.user.id,
            meta: {
              disputeId: dispute.id,
              resolution: resolution,
            },
          },
        });

        refundId = refund.id;

        // Process the refund
        await processRefund(refund.id);
      }
    } else if (decision === "RELEASE_WORKER") {
      // Release funds to worker (update payment status)
      await prisma.payment.updateMany({
        where: { bookingId: dispute.bookingId },
        data: {
          status: "RELEASED",
          escrowReleasedAt: new Date(),
        },
      });
    }

    // Update dispute
    const updated = await prisma.dispute.update({
      where: { id },
      data: {
        status:
          decision === "REFUND_HIRER" ? "RESOLVED_HIRER" : "RESOLVED_WORKER",
        adminId: req.user.id,
        adminNotes: adminNotes || null,
        resolution: resolution,
        refundId: refundId,
        resolvedAt: new Date(),
      },
    });

    // Log admin action
    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "DISPUTE_RESOLVED",
      targetType: "DISPUTE",
      targetId: dispute.id,
      description: `Resolved dispute for booking ${dispute.booking.title}`,
      meta: { decision, resolution, refundId },
    });

    // Notify both parties
    await Promise.all([
      createNotification({
        userId: dispute.booking.hirerId,
        title: "Dispute Resolved",
        body: `The dispute for booking "${dispute.booking.title}" has been resolved. Decision: ${decision === "REFUND_HIRER" ? "Refund issued to you" : "Funds released to worker"}`,
        type: "DISPUTE_RESOLVED",
        data: { bookingId: dispute.bookingId, disputeId: dispute.id },
        icon: "FaCheckCircle",
      }),
      createNotification({
        userId: dispute.booking.workerId,
        title: "Dispute Resolved",
        body: `The dispute for booking "${dispute.booking.title}" has been resolved. Decision: ${decision === "RELEASE_WORKER" ? "Funds released to you" : "Refund issued to hirer"}`,
        type: "DISPUTE_RESOLVED",
        data: { bookingId: dispute.bookingId, disputeId: dispute.id },
        icon: "FaCheckCircle",
      }),
    ]);

    return sendResponse(res, {
      message: "Dispute resolved successfully",
      data: {
        dispute: updated,
        refund: refund,
      },
    });
  } catch (err) {
    console.error("resolveDispute error:", err);
    return sendError(res, "Failed to resolve dispute");
  }
};
