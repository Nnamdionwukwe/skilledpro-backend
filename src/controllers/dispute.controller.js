import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { sendRealTimeNotification } from "./notification.controller.js";

// POST /api/disputes - Raise a dispute on a booking
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
        payment: true,
      },
    });

    if (!booking) return sendError(res, "Booking not found", 404);

    // Only hirer or worker involved in the booking can raise a dispute
    const isHirer = booking.hirerId === req.user.id;
    const isWorker = booking.workerId === req.user.id;
    if (!isHirer && !isWorker) return sendError(res, "Forbidden", 403);

    // Can only dispute bookings that are in progress or completed
    const disputeable = ["IN_PROGRESS", "COMPLETED", "ACCEPTED"];
    if (!disputeable.includes(booking.status)) {
      return sendError(
        res,
        `Cannot dispute a booking with status: ${booking.status}`,
        400,
      );
    }

    if (booking.status === "DISPUTED") {
      return sendError(res, "This booking is already under dispute", 409);
    }

    // Update booking status to DISPUTED
    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: "DISPUTED" },
    });

    // Freeze payment if exists
    if (booking.payment && booking.payment.status === "HELD") {
      await prisma.payment.update({
        where: { bookingId },
        data: { status: "HELD" }, // Keep held, admin will release or refund
      });
    }

    // Notify the other party
    const otherPartyId = isHirer ? booking.workerId : booking.hirerId;
    const raisedBy = isHirer ? booking.hirer : booking.worker;

    await sendRealTimeNotification({
      userId: otherPartyId,
      title: "Dispute Raised ⚠️",
      body: `${raisedBy.firstName} ${raisedBy.lastName} has raised a dispute on booking: "${booking.title}".`,
      type: "DISPUTE_RAISED",
      data: { bookingId: booking.id, reason },
    });

    // Notify admin (find all admins)
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    for (const admin of admins) {
      await sendRealTimeNotification({
        userId: admin.id,
        title: "New Dispute Filed ⚠️",
        body: `Dispute raised on booking "${booking.title}" — Reason: ${reason}`,
        type: "DISPUTE_RAISED",
        data: { bookingId: booking.id, raisedBy: req.user.id, reason },
      });
    }

    return sendResponse(res, {
      status: 201,
      message:
        "Dispute raised successfully. Our team will review within 24–48 hours.",
      data: {
        dispute: {
          bookingId: booking.id,
          title: booking.title,
          status: updated.status,
          reason,
          description,
          raisedBy: req.user.id,
          raisedAt: new Date(),
        },
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to raise dispute");
  }
};

// GET /api/disputes/my - Get disputes raised by or against current user
export const getMyDisputes = async (req, res) => {
  try {
    const disputes = await prisma.booking.findMany({
      where: {
        status: "DISPUTED",
        OR: [{ hirerId: req.user.id }, { workerId: req.user.id }],
      },
      include: {
        hirer: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
        worker: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
        category: true,
        payment: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    return sendResponse(res, {
      data: { disputes, total: disputes.length },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch disputes");
  }
};

// GET /api/disputes/:bookingId - Get dispute detail for a booking
export const getDisputeDetail = async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.bookingId },
      include: {
        hirer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            email: true,
            phone: true,
          },
        },
        worker: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            email: true,
            phone: true,
          },
        },
        category: true,
        payment: true,
        review: true,
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
    });

    if (!booking) return sendError(res, "Booking not found", 404);

    // Must be involved or admin
    const isInvolved =
      booking.hirerId === req.user.id ||
      booking.workerId === req.user.id ||
      req.user.role === "ADMIN";

    if (!isInvolved) return sendError(res, "Forbidden", 403);

    return sendResponse(res, { data: { dispute: booking } });
  } catch (err) {
    return sendError(res, "Failed to fetch dispute");
  }
};

// PATCH /api/disputes/:bookingId/resolve - Admin resolves a dispute
export const resolveDispute = async (req, res) => {
  try {
    const { resolution, refundHirer, releaseToWorker, adminNotes } = req.body;

    if (!resolution) {
      return sendError(res, "Resolution is required (REFUND or RELEASE)", 400);
    }

    if (!["REFUND", "RELEASE"].includes(resolution)) {
      return sendError(res, "Resolution must be REFUND or RELEASE", 400);
    }

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.bookingId },
      include: { payment: true },
    });

    if (!booking) return sendError(res, "Booking not found", 404);
    if (booking.status !== "DISPUTED") {
      return sendError(res, "Booking is not under dispute", 400);
    }

    const newBookingStatus =
      resolution === "REFUND" ? "CANCELLED" : "COMPLETED";
    const newPaymentStatus = resolution === "REFUND" ? "REFUNDED" : "RELEASED";

    // Update booking
    await prisma.booking.update({
      where: { id: req.params.bookingId },
      data: { status: newBookingStatus },
    });

    // Update payment
    if (booking.payment) {
      await prisma.payment.update({
        where: { bookingId: req.params.bookingId },
        data: {
          status: newPaymentStatus,
          ...(resolution === "REFUND" && { refundedAt: new Date() }),
          ...(resolution === "RELEASE" && { escrowReleasedAt: new Date() }),
        },
      });
    }

    const hirerMsg =
      resolution === "REFUND"
        ? "The dispute has been resolved in your favour. A refund will be processed shortly."
        : "The dispute has been resolved. Payment has been released to the worker.";

    const workerMsg =
      resolution === "RELEASE"
        ? "The dispute has been resolved in your favour. Payment has been released to you."
        : "The dispute has been resolved. The hirer has been refunded.";

    // Notify both parties
    await sendRealTimeNotification({
      userId: booking.hirerId,
      title: "Dispute Resolved ✅",
      body: hirerMsg,
      type: "DISPUTE_RESOLVED",
      data: { bookingId: booking.id, resolution, adminNotes },
    });

    await sendRealTimeNotification({
      userId: booking.workerId,
      title: "Dispute Resolved ✅",
      body: workerMsg,
      type: "DISPUTE_RESOLVED",
      data: { bookingId: booking.id, resolution, adminNotes },
    });

    return sendResponse(res, {
      message: `Dispute resolved — ${resolution}`,
      data: {
        bookingId: booking.id,
        resolution,
        newBookingStatus,
        newPaymentStatus,
        adminNotes,
        resolvedAt: new Date(),
        resolvedBy: req.user.id,
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to resolve dispute");
  }
};

// PATCH /api/disputes/:bookingId/cancel - User cancels their own dispute (if no admin action yet)
export const cancelDispute = async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.bookingId },
    });

    if (!booking) return sendError(res, "Booking not found", 404);
    if (booking.status !== "DISPUTED")
      return sendError(res, "No active dispute on this booking", 400);

    const isInvolved =
      booking.hirerId === req.user.id || booking.workerId === req.user.id;
    if (!isInvolved) return sendError(res, "Forbidden", 403);

    // Revert to COMPLETED (assume job was done if dispute cancelled)
    await prisma.booking.update({
      where: { id: req.params.bookingId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    const otherPartyId =
      booking.hirerId === req.user.id ? booking.workerId : booking.hirerId;
    await sendRealTimeNotification({
      userId: otherPartyId,
      title: "Dispute Cancelled",
      body: "The dispute on your booking has been cancelled by the other party.",
      type: "DISPUTE_CANCELLED",
      data: { bookingId: booking.id },
    });

    return sendResponse(res, {
      message: "Dispute cancelled. Booking marked as completed.",
    });
  } catch (err) {
    return sendError(res, "Failed to cancel dispute");
  }
};

// GET /api/disputes (Admin) — all disputes with filters
export const getAllDisputes = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [disputes, total] = await Promise.all([
      prisma.booking.findMany({
        where: { status: "DISPUTED" },
        skip,
        take: parseInt(limit),
        include: {
          hirer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            },
          },
          worker: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            },
          },
          category: true,
          payment: true,
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.booking.count({ where: { status: "DISPUTED" } }),
    ]);

    return sendResponse(res, {
      data: {
        disputes,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch disputes");
  }
};
