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
        latitude,
        longitude,
        scheduledAt: new Date(scheduledAt),
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
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

    // ── Email: notify worker of new booking request ──────────────────────────
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
    console.error(err);
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
    console.error("getBooking error:", err.message, err.code);
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

    const allowed = {
      WORKER: ["ACCEPTED", "REJECTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      HIRER: ["CANCELLED"],
      ADMIN: [
        "ACCEPTED",
        "REJECTED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
        "DISPUTED",
      ],
    };

    if (!allowed[req.user.role]?.includes(status)) {
      return sendError(res, "Not allowed", 403);
    }

    const updated = await prisma.booking.update({
      where: { id: req.params.id },
      data: {
        status,
        cancelReason: cancelReason || null,
        completedAt: status === "COMPLETED" ? new Date() : undefined,
        checkInAt: status === "IN_PROGRESS" ? new Date() : undefined,
      },
    });

    // ── Email hooks per status ───────────────────────────────────────────────

    if (status === "ACCEPTED") {
      // Notify hirer — worker accepted, please pay
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
      // Notify both parties
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
    }

    if (status === "COMPLETED") {
      // Notify hirer to release payment and prompt reviews
      await sendJobCompletedEmail({
        to: booking.hirer.email,
        hirerName: booking.hirer.firstName,
        workerName: `${booking.worker.firstName} ${booking.worker.lastName}`,
        booking: { id: booking.id, title: booking.title },
      });

      // Prompt both to leave a review
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
      message: "Booking updated",
      data: { booking: updated },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Update failed");
  }
};

export const checkIn = async (req, res) => {
  try {
    const { latitude, longitude } = req.body || {};
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
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

    await prisma.notification.create({
      data: {
        userId: booking.hirerId,
        title: "Worker Checked In 🟢",
        body: "Your worker has arrived and the job is now in progress.",
        type: "BOOKING_CHECKIN",
        data: { bookingId: booking.id, lat: latitude, lng: longitude },
      },
    });

    return sendResponse(res, {
      message: "Checked in.",
      data: { booking: updated },
    });
  } catch (err) {
    console.error("checkIn error:", err.message);
    return sendError(res, "Check-in failed");
  }
};

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

    await prisma.notification.create({
      data: {
        userId: booking.hirerId,
        title: "Job Completed ✅",
        body: "Your worker checked out. Please release payment when satisfied.",
        type: "BOOKING_CHECKOUT",
        data: { bookingId: booking.id, lat: latitude, lng: longitude },
      },
    });

    return sendResponse(res, {
      message: "Checked out.",
      data: { booking: updated },
    });
  } catch (err) {
    console.error("checkOut error:", err.message);
    return sendError(res, "Check-out failed");
  }
};
