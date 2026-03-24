import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

export const createBooking = async (req, res) => {
  try {
    const { workerId, categoryId, title, description, address, latitude, longitude, scheduledAt, estimatedHours, agreedRate, currency, notes } = req.body;
    const booking = await prisma.booking.create({
      data: {
        hirerId: req.user.id, workerId, categoryId, title, description,
        address, latitude, longitude,
        scheduledAt: new Date(scheduledAt),
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
        agreedRate: parseFloat(agreedRate),
        currency: currency || "USD", notes,
      },
      include: { hirer: { select: { id: true, firstName: true, lastName: true } }, worker: { select: { id: true, firstName: true, lastName: true } }, category: true },
    });
    return sendResponse(res, { status: 201, message: "Booking created", data: { booking } });
  } catch (err) {
    console.error(err);
    return sendError(res, "Booking failed");
  }
};

export const getMyBookings = async (req, res) => {
  try {
    const { role, status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (req.user.role === "HIRER") where.hirerId = req.user.id;
    else where.workerId = req.user.id;
    if (status) where.status = status;
    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where, skip, take: parseInt(limit),
        include: {
          hirer: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          worker: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          category: true, payment: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.booking.count({ where }),
    ]);
    return sendResponse(res, { data: { bookings, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) {
    return sendError(res, "Failed to fetch bookings");
  }
};

export const getBooking = async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        hirer: { select: { id: true, firstName: true, lastName: true, avatar: true, phone: true } },
        worker: { select: { id: true, firstName: true, lastName: true, avatar: true, phone: true } },
        category: true, payment: true, review: true,
      },
    });
    if (!booking) return sendError(res, "Booking not found", 404);
    if (booking.hirerId !== req.user.id && booking.workerId !== req.user.id) return sendError(res, "Forbidden", 403);
    return sendResponse(res, { data: { booking } });
  } catch (err) {
    return sendError(res, "Failed to fetch booking");
  }
};

export const updateBookingStatus = async (req, res) => {
  try {
    const { status, cancelReason } = req.body;
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking) return sendError(res, "Booking not found", 404);

    const allowed = {
      WORKER: ["ACCEPTED", "REJECTED", "IN_PROGRESS", "COMPLETED"],
      HIRER: ["CANCELLED"],
    };
    if (!allowed[req.user.role]?.includes(status)) return sendError(res, "Not allowed", 403);

    const updated = await prisma.booking.update({
      where: { id: req.params.id },
      data: {
        status,
        cancelReason: cancelReason || null,
        completedAt: status === "COMPLETED" ? new Date() : undefined,
        checkInAt: status === "IN_PROGRESS" ? new Date() : undefined,
      },
    });
    return sendResponse(res, { message: "Booking updated", data: { booking: updated } });
  } catch (err) {
    return sendError(res, "Update failed");
  }
};

export const checkIn = async (req, res) => {
  try {
    const booking = await prisma.booking.update({
      where: { id: req.params.id },
      data: { checkInAt: new Date(), status: "IN_PROGRESS" },
    });
    return sendResponse(res, { message: "Checked in", data: { booking } });
  } catch (err) {
    return sendError(res, "Check-in failed");
  }
};

export const checkOut = async (req, res) => {
  try {
    const booking = await prisma.booking.update({
      where: { id: req.params.id },
      data: { checkOutAt: new Date(), status: "COMPLETED", completedAt: new Date() },
    });
    return sendResponse(res, { message: "Checked out", data: { booking } });
  } catch (err) {
    return sendError(res, "Check-out failed");
  }
};
