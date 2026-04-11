// src/controllers/booking.controller.js
import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import {
  sendBookingRequestEmail,
  sendBookingConfirmedEmail,
  sendBookingCancelledEmail,
  sendJobCompletedEmail,
  sendReviewRequestEmail,
} from "../services/email.service.js";

// ── Create booking ────────────────────────────────────────────────────────────
export const createBooking = async (req, res) => {
  try {
    const {
      workerId,
      categoryId,
      title,
      description,
      address,
      latitude,
      longitude,
      scheduledAt,
      estimatedHours,
      estimatedUnit, // ← new
      estimatedValue, // ← new
      agreedRate,
      currency,
      notes,
    } = req.body;

    const booking = await prisma.booking.create({
      data: {
        hirerId: req.user.id,
        workerId,
        categoryId,
        title,
        description,
        address,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        scheduledAt: new Date(scheduledAt),
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
        estimatedUnit: estimatedUnit || "hours", // ← saved
        estimatedValue: estimatedValue || null, // ← saved
        agreedRate: parseFloat(agreedRate),
        currency: currency || "USD",
        notes,
      },
      include: {
        hirer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        worker: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        category: true,
      },
    });

    // ── Email worker ──────────────────────────────────────────────────────────
    await sendBookingRequestEmail({
      to: booking.worker.email,
      workerName: booking.worker.firstName,
      hirerName: `${booking.hirer.firstName} ${booking.hirer.lastName}`,
      booking: {
        id: booking.id,
        title: booking.title,
        category: booking.category?.name || "",
        scheduledAt: booking.scheduledAt,
        address: booking.address,
        agreedRate: booking.agreedRate,
        currency: booking.currency,
      },
    });

    return sendResponse(res, {
      status: 201,
      message: "Booking created",
      data: { booking },
    });
  } catch (err) {
    console.error("createBooking error:", err);
    return sendError(res, "Booking failed");
  }
};

// ── Get my bookings ───────────────────────────────────────────────────────────
export const getMyBookings = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (req.user.role === "HIRER") where.hirerId = req.user.id;
    else where.workerId = req.user.id;
    if (status) where.status = status;

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take: parseInt(limit),
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
        orderBy: { createdAt: "desc" },
      }),
      prisma.booking.count({ where }),
    ]);

    return sendResponse(res, {
      data: {
        bookings,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch bookings");
  }
};

// ── Get single booking ────────────────────────────────────────────────────────
export const getBooking = async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        hirer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            phone: true,
          },
        },
        worker: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            phone: true,
          },
        },
        category: true,
        payment: true,
        reviews: {
          include: {
            giver: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!booking) return sendError(res, "Booking not found", 404);
    if (booking.hirerId !== req.user.id && booking.workerId !== req.user.id) {
      return sendError(res, "Forbidden", 403);
    }

    return sendResponse(res, { data: { booking } });
  } catch (err) {
    console.error("getBooking error:", err.message);
    return sendError(res, "Failed to fetch booking");
  }
};

// ── Update booking status ─────────────────────────────────────────────────────
export const updateBookingStatus = async (req, res) => {
  try {
    const { status, cancelReason } = req.body;

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        hirer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        worker: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        category: true,
      },
    });

    if (!booking) return sendError(res, "Booking not found", 404);

    // ── Permission check ──────────────────────────────────────────────────────
    // Workers can now cancel too (PENDING or ACCEPTED only)
    const allowed = {
      WORKER: {
        PENDING: ["ACCEPTED", "REJECTED", "CANCELLED"],
        ACCEPTED: ["IN_PROGRESS", "CANCELLED"],
        IN_PROGRESS: ["COMPLETED"],
      },
      HIRER: {
        PENDING: ["CANCELLED"],
        ACCEPTED: ["CANCELLED"],
      },
      ADMIN: {
        PENDING: ["ACCEPTED", "REJECTED", "CANCELLED"],
        ACCEPTED: ["ACCEPTED", "IN_PROGRESS", "CANCELLED"],
        IN_PROGRESS: ["COMPLETED", "CANCELLED", "DISPUTED"],
        COMPLETED: ["DISPUTED"],
        DISPUTED: ["COMPLETED", "CANCELLED"],
      },
    };

    const permissionsForRole = allowed[req.user.role] || {};
    const permissionsForStatus = permissionsForRole[booking.status] || [];

    if (!permissionsForStatus.includes(status)) {
      return sendError(
        res,
        `${req.user.role} cannot change status from ${booking.status} to ${status}`,
        403,
      );
    }

    // ── Cancel requires a reason ──────────────────────────────────────────────
    if (status === "CANCELLED" && !cancelReason?.trim()) {
      return sendError(res, "A cancellation reason is required", 400);
    }

    const updated = await prisma.booking.update({
      where: { id: req.params.id },
      data: {
        status,
        cancelReason: status === "CANCELLED" ? cancelReason.trim() : null,
        completedAt: status === "COMPLETED" ? new Date() : undefined,
        checkInAt: status === "IN_PROGRESS" ? new Date() : undefined,
      },
    });

    // ── Email hooks ───────────────────────────────────────────────────────────
    if (status === "ACCEPTED") {
      await sendBookingConfirmedEmail({
        to: booking.hirer.email,
        hirerName: booking.hirer.firstName,
        workerName: `${booking.worker.firstName} ${booking.worker.lastName}`,
        booking: {
          id: booking.id,
          title: booking.title,
          scheduledAt: booking.scheduledAt,
          address: booking.address,
          agreedRate: booking.agreedRate,
          currency: booking.currency,
        },
      });
    }

    if (status === "CANCELLED") {
      await Promise.all([
        sendBookingCancelledEmail({
          to: booking.hirer.email,
          name: booking.hirer.firstName,
          booking: {
            id: booking.id,
            title: booking.title,
            scheduledAt: booking.scheduledAt,
          },
          reason: cancelReason,
        }),
        sendBookingCancelledEmail({
          to: booking.worker.email,
          name: booking.worker.firstName,
          booking: {
            id: booking.id,
            title: booking.title,
            scheduledAt: booking.scheduledAt,
          },
          reason: cancelReason,
        }),
      ]);

      // In-app notification to the other party
      const notifyUserId =
        req.user.id === booking.hirerId ? booking.workerId : booking.hirerId;

      const cancellerName =
        req.user.id === booking.hirerId
          ? `${booking.hirer.firstName} ${booking.hirer.lastName}`
          : `${booking.worker.firstName} ${booking.worker.lastName}`;

      await prisma.notification.create({
        data: {
          userId: notifyUserId,
          title: "Booking Cancelled",
          body: `${cancellerName} cancelled the booking "${booking.title}". Reason: ${cancelReason}`,
          type: "BOOKING_CANCELLED",
          data: { bookingId: booking.id, reason: cancelReason },
        },
      });
    }

    if (status === "COMPLETED") {
      await sendJobCompletedEmail({
        to: booking.hirer.email,
        hirerName: booking.hirer.firstName,
        workerName: `${booking.worker.firstName} ${booking.worker.lastName}`,
        booking: { id: booking.id, title: booking.title },
      });

      await Promise.all([
        sendReviewRequestEmail({
          to: booking.hirer.email,
          name: booking.hirer.firstName,
          otherPartyName: `${booking.worker.firstName} ${booking.worker.lastName}`,
          booking: { id: booking.id, title: booking.title },
        }),
        sendReviewRequestEmail({
          to: booking.worker.email,
          name: booking.worker.firstName,
          otherPartyName: `${booking.hirer.firstName} ${booking.hirer.lastName}`,
          booking: { id: booking.id, title: booking.title },
        }),
      ]);
    }

    return sendResponse(res, {
      message: `Booking ${status.toLowerCase()}`,
      data: { booking: updated },
    });
  } catch (err) {
    console.error("updateBookingStatus error:", err);
    return sendError(res, "Update failed");
  }
};

// ── Check In ──────────────────────────────────────────────────────────────────
export const checkIn = async (req, res) => {
  try {
    const { latitude, longitude } = req.body || {};

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        hirer: { select: { id: true, firstName: true } },
      },
    });

    if (!booking) return sendError(res, "Booking not found", 404);
    if (booking.workerId !== req.user.id)
      return sendError(res, "Forbidden", 403);
    if (booking.status !== "ACCEPTED")
      return sendError(res, "Booking must be ACCEPTED to check in", 400);

    const updated = await prisma.booking.update({
      where: { id: req.params.id },
      data: {
        checkInAt: new Date(),
        status: "IN_PROGRESS",
        checkInLat: latitude ? parseFloat(latitude) : null,
        checkInLng: longitude ? parseFloat(longitude) : null,
      },
    });

    // Notify hirer with worker GPS
    await prisma.notification.create({
      data: {
        userId: booking.hirerId,
        title: "Worker Checked In 🟢",
        body: "Your worker has arrived and the job is now in progress.",
        type: "BOOKING_CHECKIN",
        data: {
          bookingId: booking.id,
          lat: latitude ? parseFloat(latitude) : null,
          lng: longitude ? parseFloat(longitude) : null,
        },
      },
    });

    return sendResponse(res, {
      message: "Checked in",
      data: { booking: updated },
    });
  } catch (err) {
    console.error("checkIn error:", err.message);
    return sendError(res, "Check-in failed");
  }
};

// ── Check Out ─────────────────────────────────────────────────────────────────
export const checkOut = async (req, res) => {
  try {
    const { latitude, longitude } = req.body || {};

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        hirer: { select: { id: true, firstName: true, email: true } },
        worker: { select: { id: true, firstName: true, email: true } },
      },
    });

    if (!booking) return sendError(res, "Booking not found", 404);
    if (booking.workerId !== req.user.id)
      return sendError(res, "Forbidden", 403);
    if (booking.status !== "IN_PROGRESS")
      return sendError(res, "Booking must be IN_PROGRESS to check out", 400);

    const updated = await prisma.booking.update({
      where: { id: req.params.id },
      data: {
        checkOutAt: new Date(),
        status: "COMPLETED",
        completedAt: new Date(),
        checkOutLat: latitude ? parseFloat(latitude) : null,
        checkOutLng: longitude ? parseFloat(longitude) : null,
      },
    });

    // Notify hirer
    await prisma.notification.create({
      data: {
        userId: booking.hirerId,
        title: "Job Completed ✅",
        body: "Your worker checked out. Please release payment when satisfied.",
        type: "BOOKING_CHECKOUT",
        data: {
          bookingId: booking.id,
          lat: latitude ? parseFloat(latitude) : null,
          lng: longitude ? parseFloat(longitude) : null,
        },
      },
    });

    // Email hirer to release payment
    await sendJobCompletedEmail({
      to: booking.hirer.email,
      hirerName: booking.hirer.firstName,
      workerName: booking.worker.firstName,
      booking: { id: booking.id, title: booking.title },
    });

    // Prompt both to review
    await Promise.all([
      sendReviewRequestEmail({
        to: booking.hirer.email,
        name: booking.hirer.firstName,
        otherPartyName: booking.worker.firstName,
        booking: { id: booking.id, title: booking.title },
      }),
      sendReviewRequestEmail({
        to: booking.worker.email,
        name: booking.worker.firstName,
        otherPartyName: booking.hirer.firstName,
        booking: { id: booking.id, title: booking.title },
      }),
    ]);

    return sendResponse(res, {
      message: "Checked out",
      data: { booking: updated },
    });
  } catch (err) {
    console.error("checkOut error:", err.message);
    return sendError(res, "Check-out failed");
  }
};

// ── Activate SOS ──────────────────────────────────────────────────────────────
export const activateSOS = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        hirer: { select: { id: true, firstName: true, email: true } },
        worker: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!booking) return sendError(res, "Booking not found", 404);
    if (booking.workerId !== req.user.id)
      return sendError(res, "Forbidden", 403);
    if (!["ACCEPTED", "IN_PROGRESS"].includes(booking.status)) {
      return sendError(
        res,
        "SOS can only be activated on active bookings",
        400,
      );
    }

    const updated = await prisma.booking.update({
      where: { id: req.params.id },
      data: {
        sosActivatedAt: new Date(),
        sosLatitude: latitude ? parseFloat(latitude) : null,
        sosLongitude: longitude ? parseFloat(longitude) : null,
        sosResolvedAt: null,
      },
    });

    // Notify hirer immediately
    await prisma.notification.create({
      data: {
        userId: booking.hirerId,
        title: "🚨 SOS Alert — Worker Needs Help",
        body: `${booking.worker.firstName} ${booking.worker.lastName} has activated an emergency alert on booking "${booking.title}".`,
        type: "SOS_ACTIVATED",
        data: {
          bookingId: booking.id,
          lat: latitude ? parseFloat(latitude) : null,
          lng: longitude ? parseFloat(longitude) : null,
          activatedAt: new Date().toISOString(),
        },
      },
    });

    // Notify all admins
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    await Promise.all(
      admins.map((admin) =>
        prisma.notification.create({
          data: {
            userId: admin.id,
            title: "🚨 SOS Alert",
            body: `Worker ${booking.worker.firstName} ${booking.worker.lastName} activated SOS on booking "${booking.title}"`,
            type: "SOS_ACTIVATED",
            data: {
              bookingId: booking.id,
              workerId: booking.workerId,
              lat: latitude ? parseFloat(latitude) : null,
              lng: longitude ? parseFloat(longitude) : null,
            },
          },
        }),
      ),
    );

    return sendResponse(res, {
      status: 201,
      message: "SOS activated. Your hirer and our team have been alerted.",
      data: { booking: updated },
    });
  } catch (err) {
    console.error("activateSOS error:", err.message);
    return sendError(res, "Failed to activate SOS");
  }
};

// ── Resolve SOS ───────────────────────────────────────────────────────────────
export const resolveSOS = async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
    });

    if (!booking) return sendError(res, "Booking not found", 404);

    const isInvolved =
      booking.workerId === req.user.id ||
      booking.hirerId === req.user.id ||
      req.user.role === "ADMIN";

    if (!isInvolved) return sendError(res, "Forbidden", 403);
    if (!booking.sosActivatedAt)
      return sendError(res, "No active SOS on this booking", 400);

    const updated = await prisma.booking.update({
      where: { id: req.params.id },
      data: { sosResolvedAt: new Date() },
    });

    // Notify the worker the alert is resolved
    await prisma.notification.create({
      data: {
        userId: booking.workerId,
        title: "✅ SOS Resolved",
        body: "Your emergency alert has been resolved.",
        type: "SOS_RESOLVED",
        data: { bookingId: booking.id },
      },
    });

    return sendResponse(res, {
      message: "SOS resolved",
      data: { booking: updated },
    });
  } catch (err) {
    return sendError(res, "Failed to resolve SOS");
  }
};

// ── Update emergency contact ──────────────────────────────────────────────────
export const updateEmergencyContact = async (req, res) => {
  try {
    const { name, phone, relationship } = req.body;

    if (!name || !phone) {
      return sendError(res, "Name and phone are required", 400);
    }

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
    });

    if (!booking) return sendError(res, "Booking not found", 404);
    if (booking.workerId !== req.user.id)
      return sendError(res, "Forbidden", 403);

    const updated = await prisma.booking.update({
      where: { id: req.params.id },
      data: {
        emergencyContact: JSON.stringify({ name, phone, relationship }),
      },
    });

    return sendResponse(res, {
      message: "Emergency contact saved",
      data: { emergencyContact: { name, phone, relationship } },
    });
  } catch (err) {
    return sendError(res, "Failed to save emergency contact");
  }
};
