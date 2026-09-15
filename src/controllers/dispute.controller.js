// src/controllers/dispute.controller.js
import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { createNotification } from "../services/notification.service.js";
import {
  createRefundFromDispute,
  processRefund,
} from "../services/refund.service.js";
import { releaseEscrow } from "../services/payment.service.js";
import { logAdminAction } from "../utils/auditLog.js";
import { paginate } from "../utils/helpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// § 1  RAISE DISPUTE — POST /api/disputes/raise
// Body: { bookingId, reason, description }  + optional multipart evidence
// ─────────────────────────────────────────────────────────────────────────────
export const raiseDispute = async (req, res) => {
  try {
    const { bookingId, reason, description } = req.body;

    if (!bookingId || !reason || !description) {
      return sendError(
        res,
        "Booking ID, reason and description are required",
        400,
      );
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        hirer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        worker: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        disputes: {
          where: { status: "PENDING_REVIEW" },
          select: { id: true },
        },
      },
    });

    if (!booking) return sendError(res, "Booking not found", 404);

    const isHirer = booking.hirerId === req.user.id;
    const isWorker = booking.workerId === req.user.id;
    if (!isHirer && !isWorker) return sendError(res, "Forbidden", 403);

    // Can only dispute bookings in an active or completed state
    const disputableStatuses = ["ACCEPTED", "IN_PROGRESS", "COMPLETED"];
    if (!disputableStatuses.includes(booking.status)) {
      return sendError(
        res,
        `Cannot dispute a booking with status: ${booking.status}`,
        400,
      );
    }

    // No duplicate active dispute on the same booking
    if (booking.disputes.length > 0) {
      return sendError(
        res,
        "This booking already has an active dispute under review",
        409,
      );
    }

    // ── Evidence uploads (Cloudinary URLs from multer) ─────────────────────
    const evidenceUrls = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        evidenceUrls.push(file.path);
      }
    }

    const raisedByRole = isHirer ? "HIRER" : "WORKER";
    const againstId = isHirer ? booking.workerId : booking.hirerId;

    // ── Create Dispute + update Booking status in a transaction ────────────
    const [dispute] = await prisma.$transaction([
      prisma.dispute.create({
        data: {
          bookingId: booking.id,
          raisedById: req.user.id,
          raisedByRole,
          againstId,
          reason,
          description,
          evidence: evidenceUrls,
          status: "PENDING_REVIEW",
          previousBookingStatus: booking.status,
        },
      }),
      prisma.booking.update({
        where: { id: booking.id },
        data: {
          status: "DISPUTED",
          // Mirror legacy fields on Booking for backwards compat with any
          // existing dashboards that read from the booking row.
          disputeReason: reason,
          disputeDescription: description,
          disputeEvidence: evidenceUrls,
        },
      }),
    ]);

    // ── Notify the other party ─────────────────────────────────────────────
    const raisedBy = isHirer ? booking.hirer : booking.worker;
    await createNotification({
      userId: againstId,
      title: "Dispute raised",
      body: `${raisedBy.firstName} ${raisedBy.lastName} raised a dispute on "${booking.title}". Our team will review within 24–48 hours.`,
      type: "DISPUTE_RAISED",
      data: { disputeId: dispute.id, bookingId: booking.id, reason },
      icon: "FaGavel",
    }).catch(() => {});

    // ── Notify all admins ──────────────────────────────────────────────────
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    await Promise.all(
      admins.map((admin) =>
        createNotification({
          userId: admin.id,
          title: "New dispute filed",
          body: `Dispute on "${booking.title}" — Reason: ${reason}`,
          type: "DISPUTE_RAISED",
          data: {
            disputeId: dispute.id,
            bookingId: booking.id,
            raisedById: req.user.id,
            reason,
          },
          icon: "FaGavel",
        }).catch(() => {}),
      ),
    );

    return sendResponse(res, {
      status: 201,
      message:
        "Dispute raised successfully. Our team will review within 24–48 hours.",
      data: {
        dispute: {
          id: dispute.id,
          bookingId: booking.id,
          title: booking.title,
          status: dispute.status,
          reason,
          description,
          evidence: evidenceUrls,
          raisedById: req.user.id,
          raisedByRole,
          againstId,
          createdAt: dispute.createdAt,
        },
      },
    });
  } catch (err) {
    console.error("raiseDispute error:", err);
    return sendError(res, "Failed to raise dispute");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 2  GET MY DISPUTES — GET /api/disputes/my
// Returns all disputes raised by or against the current user
// ─────────────────────────────────────────────────────────────────────────────
export const getMyDisputes = async (req, res) => {
  try {
    const disputes = await prisma.dispute.findMany({
      where: {
        OR: [{ raisedById: req.user.id }, { againstId: req.user.id }],
      },
      include: {
        booking: {
          select: {
            id: true,
            title: true,
            status: true,
            agreedRate: true,
            currency: true,
            address: true,
            scheduledAt: true,
            estimatedUnit: true,
            estimatedValue: true,
            jobType: true,
            locationType: true,
            category: { select: { id: true, name: true, icon: true } },
          },
        },
        raisedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
          },
        },
        against: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
          },
        },
        resolvedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        refund: {
          select: {
            id: true,
            reference: true,
            amount: true,
            currency: true,
            status: true,
            refundType: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Shape the response so the frontend can keep its existing display fields
    // (id = bookingId for the old UI that used booking.id as the dispute id).
    const shaped = disputes.map((d) => ({
      id: d.booking.id, // legacy field for /disputes/:bookingId/cancel etc.
      disputeId: d.id,
      bookingId: d.booking.id,
      title: d.booking.title,
      status: mapDisputeStatusToLegacy(d.status),
      rawStatus: d.status,
      disputeReason: d.reason,
      disputeDescription: d.description,
      disputeEvidence: d.evidence,
      resolution: d.resolution,
      resolvedAt: d.resolvedAt,
      adminNotes: d.adminNotes,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      // Flattened booking fields the frontend expects
      agreedRate: d.booking.agreedRate,
      currency: d.booking.currency,
      address: d.booking.address,
      scheduledAt: d.booking.scheduledAt,
      estimatedUnit: d.booking.estimatedUnit,
      estimatedValue: d.booking.estimatedValue,
      jobType: d.booking.jobType,
      locationType: d.booking.locationType,
      category: d.booking.category,
      hirer: d.raisedByRole === "HIRER" ? d.raisedBy : d.against,
      worker: d.raisedByRole === "WORKER" ? d.raisedBy : d.against,
      raisedBy: d.raisedBy,
      against: d.against,
      raisedByRole: d.raisedByRole,
      resolvedBy: d.resolvedBy,
      refund: d.refund,
    }));

    return sendResponse(res, {
      data: { disputes: shaped, total: shaped.length },
    });
  } catch (err) {
    console.error("getMyDisputes error:", err);
    return sendError(res, "Failed to fetch disputes");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 3  GET DISPUTE DETAIL — GET /api/disputes/:bookingId
// Looks up by bookingId for backwards compat with the frontend
// ─────────────────────────────────────────────────────────────────────────────
export const getDisputeDetail = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const dispute = await prisma.dispute.findFirst({
      where: { bookingId },
      orderBy: { createdAt: "desc" },
      include: {
        booking: {
          include: {
            category: true,
            payments: { orderBy: { createdAt: "desc" }, take: 1 },
            reviews: true,
            conversation: {
              include: {
                messages: {
                  orderBy: { createdAt: "asc" },
                  include: {
                    sender: {
                      select: { id: true, firstName: true, lastName: true },
                    },
                  },
                },
              },
            },
          },
        },
        raisedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            email: true,
            phone: true,
            role: true,
          },
        },
        against: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            email: true,
            phone: true,
            role: true,
          },
        },
        resolvedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        refund: true,
      },
    });

    if (!dispute) return sendError(res, "Dispute not found", 404);

    const isInvolved =
      dispute.raisedById === req.user.id ||
      dispute.againstId === req.user.id ||
      req.user.role === "ADMIN";

    if (!isInvolved) return sendError(res, "Forbidden", 403);

    // Flatten the shape: the frontend treats the response as the booking row
    // with extra dispute fields. Keep both worlds happy.
    const shaped = {
      // Dispute canonical fields
      disputeId: dispute.id,
      disputeReason: dispute.reason,
      disputeDescription: dispute.description,
      disputeEvidence: dispute.evidence,
      status: mapDisputeStatusToLegacy(dispute.status),
      rawStatus: dispute.status,
      resolution: dispute.resolution,
      resolvedAt: dispute.resolvedAt,
      adminNotes: dispute.adminNotes,
      raisedByRole: dispute.raisedByRole,
      // Flattened booking payload
      ...dispute.booking,
      // Legacy aliases
      id: dispute.booking.id,
      bookingId: dispute.booking.id,
      hirer:
        dispute.raisedByRole === "HIRER" ? dispute.raisedBy : dispute.against,
      worker:
        dispute.raisedByRole === "WORKER" ? dispute.raisedBy : dispute.against,
      raisedBy: dispute.raisedBy,
      against: dispute.against,
      resolvedBy: dispute.resolvedBy,
      refund: dispute.refund,
    };

    return sendResponse(res, { data: { dispute: shaped } });
  } catch (err) {
    console.error("getDisputeDetail error:", err);
    return sendError(res, "Failed to fetch dispute");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 4  RESOLVE DISPUTE — PATCH /api/disputes/admin/:id/resolve
// Body: { resolution: "REFUND" | "RELEASE", refundPercentage?, adminNotes? }
//
// On REFUND  → creates a Refund row + calls processRefund (money moves)
// On RELEASE → calls releaseEscrow (payment released to worker)
// ─────────────────────────────────────────────────────────────────────────────
export const resolveDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution, refundPercentage = 100, adminNotes } = req.body;

    if (!resolution) {
      return sendError(res, "Resolution is required (REFUND or RELEASE)", 400);
    }

    if (!["REFUND", "RELEASE"].includes(resolution)) {
      return sendError(res, "Resolution must be REFUND or RELEASE", 400);
    }

    if (
      resolution === "REFUND" &&
      (typeof refundPercentage !== "number" ||
        refundPercentage < 1 ||
        refundPercentage > 100)
    ) {
      return sendError(res, "refundPercentage must be a number 1–100", 400);
    }

    const dispute = await prisma.dispute.findUnique({
      where: { id },
      include: {
        booking: {
          include: {
            payments: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
    });

    if (!dispute) return sendError(res, "Dispute not found", 404);
    if (dispute.status !== "PENDING_REVIEW") {
      return sendError(
        res,
        `Dispute is already ${dispute.status.toLowerCase()}`,
        400,
      );
    }

    const booking = dispute.booking;
    const payment = booking.payments?.[0];

    let refund = null;
    let releaseResult = null;
    let newBookingStatus = booking.status;

    // ── REFUND resolution ──────────────────────────────────────────────────
    if (resolution === "REFUND") {
      if (!payment) {
        return sendError(
          res,
          "No payment found on this booking — cannot refund",
          400,
        );
      }

      // Guard: don't double-refund
      const existingRefund = await prisma.refund.findFirst({
        where: {
          paymentId: payment.id,
          status: { notIn: ["REJECTED", "FAILED"] },
        },
      });
      if (existingRefund) {
        return sendError(res, "A refund already exists for this payment", 400);
      }

      try {
        refund = await createRefundFromDispute(dispute, payment, req.user.id, {
          percentage: refundPercentage,
          adminNotes,
        });
      } catch (err) {
        console.error("createRefundFromDispute error:", err.message);
        return sendError(res, `Failed to create refund: ${err.message}`, 500);
      }

      // Process the refund — this actually moves the money
      try {
        await processRefund(refund.id);
      } catch (err) {
        console.error("processRefund error:", err.message);
        // Refund row exists but processing failed — mark dispute as refunded
        // anyway, admin can retry the refund from the admin panel.
      }

      // Update booking to CANCELLED (refund means hirer got money back)
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: "CANCELLED" },
      });
      newBookingStatus = "CANCELLED";
    }

    // ── RELEASE resolution ────────────────────────────────────────────────
    if (resolution === "RELEASE") {
      if (!payment) {
        return sendError(
          res,
          "No payment found on this booking — cannot release",
          400,
        );
      }

      if (payment.status !== "HELD") {
        return sendError(
          res,
          `Payment is ${payment.status}, cannot release (expected HELD)`,
          400,
        );
      }

      try {
        releaseResult = await releaseEscrow(payment.id, {
          triggeredBy: req.user.id,
          triggeredByRole: "ADMIN",
        });
        newBookingStatus = "COMPLETED";
      } catch (err) {
        console.error("releaseEscrow error:", err.message);
        return sendError(res, `Failed to release escrow: ${err.message}`, 500);
      }
    }

    // ── Update the Dispute row ─────────────────────────────────────────────
    // NOTE: Prisma doesn't accept the FK scalar (`resolvedById`, `refundId`)
    // directly on `update` — the relation form must be used instead.
    const updatedDispute = await prisma.dispute.update({
      where: { id: dispute.id },
      data: {
        status:
          resolution === "REFUND" ? "RESOLVED_REFUND" : "RESOLVED_RELEASE",
        resolution,
        resolvedBy: req.user.id ? { connect: { id: req.user.id } } : undefined,
        resolvedAt: new Date(),
        adminNotes: adminNotes || null,
        refund: refund?.id ? { connect: { id: refund.id } } : undefined,
      },
    });

    // ── Audit log ──────────────────────────────────────────────────────────
    await logAdminAction({
      req,
      adminId: req.user.id,
      action:
        resolution === "REFUND"
          ? "DISPUTE_RESOLVED_REFUND"
          : "DISPUTE_RESOLVED_RELEASE",
      targetType: "DISPUTE",
      targetId: dispute.id,
      description: `Resolved dispute on booking "${booking.title}" — ${resolution}${
        resolution === "REFUND" ? ` (${refundPercentage}%)` : ""
      }`,
      meta: {
        bookingId: booking.id,
        resolution,
        refundPercentage: resolution === "REFUND" ? refundPercentage : null,
        refundId: refund?.id || null,
        adminNotes,
      },
    }).catch((err) => console.error("logAdminAction error:", err.message));

    // ── Notify both parties ────────────────────────────────────────────────
    const hirerMsg =
      resolution === "REFUND"
        ? `The dispute has been resolved in your favour. ${
            refundPercentage === 100
              ? "A full refund"
              : `A ${refundPercentage}% refund`
          } has been processed.`
        : "The dispute has been resolved. Payment has been released to the worker.";

    const workerMsg =
      resolution === "RELEASE"
        ? "The dispute has been resolved in your favour. Payment has been released to you."
        : "The dispute has been resolved. The hirer has been refunded.";

    await Promise.all([
      createNotification({
        userId: booking.hirerId,
        title: "Dispute resolved",
        body: hirerMsg,
        type: "DISPUTE_RESOLVED",
        data: {
          disputeId: dispute.id,
          bookingId: booking.id,
          resolution,
          refundId: refund?.id || null,
        },
        icon: "FaCheckCircle",
      }).catch(() => {}),
      createNotification({
        userId: booking.workerId,
        title: "Dispute resolved",
        body: workerMsg,
        type: "DISPUTE_RESOLVED",
        data: {
          disputeId: dispute.id,
          bookingId: booking.id,
          resolution,
        },
        icon: "FaCheckCircle",
      }).catch(() => {}),
    ]);

    return sendResponse(res, {
      message: `Dispute resolved — ${resolution}`,
      data: {
        disputeId: updatedDispute.id,
        bookingId: booking.id,
        resolution,
        newBookingStatus,
        refund: refund
          ? {
              id: refund.id,
              reference: refund.reference,
              amount: refund.amount,
              currency: refund.currency,
              status: refund.status,
            }
          : null,
        payment: releaseResult?.payment || null,
        adminNotes,
        resolvedAt: updatedDispute.resolvedAt,
        resolvedBy: req.user.id,
      },
    });
  } catch (err) {
    console.error("resolveDispute error:", err);
    return sendError(res, "Failed to resolve dispute");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 5  CANCEL DISPUTE — PATCH /api/disputes/:bookingId/cancel
// Only the raiser can cancel. Booking reverts to previousBookingStatus.
// ─────────────────────────────────────────────────────────────────────────────
export const cancelDispute = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const dispute = await prisma.dispute.findFirst({
      where: { bookingId, status: "PENDING_REVIEW" },
      orderBy: { createdAt: "desc" },
    });

    if (!dispute) {
      return sendError(res, "No active dispute on this booking", 404);
    }

    // Only the raiser can cancel their own dispute
    if (dispute.raisedById !== req.user.id) {
      return sendError(
        res,
        "Only the user who raised the dispute can cancel it",
        403,
      );
    }

    const previousStatus = dispute.previousBookingStatus || "COMPLETED";

    // Restore the booking status + clear legacy dispute fields
    await prisma.$transaction([
      prisma.dispute.update({
        where: { id: dispute.id },
        data: { status: "CANCELLED" },
      }),
      prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: previousStatus,
          disputeReason: null,
          disputeDescription: null,
          disputeEvidence: [],
        },
      }),
    ]);

    // Notify the other party
    await createNotification({
      userId: dispute.againstId,
      title: "Dispute cancelled",
      body: "The dispute on your booking has been cancelled by the other party.",
      type: "DISPUTE_CANCELLED",
      data: { disputeId: dispute.id, bookingId },
      icon: "FaCheckCircle",
    }).catch(() => {});

    return sendResponse(res, {
      message: `Dispute cancelled. Booking restored to ${previousStatus.toLowerCase()}.`,
      data: {
        disputeId: dispute.id,
        bookingId,
        bookingStatus: previousStatus,
        cancelledAt: new Date(),
      },
    });
  } catch (err) {
    console.error("cancelDispute error:", err);
    return sendError(res, "Failed to cancel dispute");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 6  GET ALL DISPUTES (Admin) — GET /api/disputes/admin/all
// ─────────────────────────────────────────────────────────────────────────────
export const getAllDisputes = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const { skip, take } = paginate(page, limit);

    const where = {};
    if (status && status !== "ALL") where.status = status;

    const [disputes, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        skip,
        take,
        include: {
          booking: {
            select: {
              id: true,
              title: true,
              status: true,
              agreedRate: true,
              currency: true,
              category: { select: { id: true, name: true, icon: true } },
            },
          },
          raisedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
              role: true,
            },
          },
          against: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
              role: true,
            },
          },
          resolvedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          refund: {
            select: {
              id: true,
              reference: true,
              amount: true,
              currency: true,
              status: true,
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

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// The old frontend used booking.status = "DISPUTED" for open disputes and
// "COMPLETED"/"CANCELLED" for resolved ones. Since we now have a proper
// Dispute model, we map the new statuses back to the legacy strings so the
// existing UI keeps working without changes.
function mapDisputeStatusToLegacy(disputeStatus) {
  switch (disputeStatus) {
    case "PENDING_REVIEW":
      return "DISPUTED";
    case "RESOLVED_REFUND":
      return "CANCELLED";
    case "RESOLVED_RELEASE":
      return "COMPLETED";
    case "CANCELLED":
      return "COMPLETED";
    default:
      return "DISPUTED";
  }
}
