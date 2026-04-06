import { randomUUID } from "crypto";
import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

// POST /api/video-calls/:bookingId/initiate
export const initiateCall = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        hirer: { select: { id: true, firstName: true, lastName: true } },
        worker: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!booking) return sendError(res, "Booking not found", 404);

    const isInvolved =
      booking.hirerId === req.user.id || booking.workerId === req.user.id;
    if (!isInvolved) return sendError(res, "Forbidden", 403);

    // Only allow calls on PENDING or ACCEPTED bookings (pre-job consultation)
    if (!["PENDING", "ACCEPTED", "IN_PROGRESS"].includes(booking.status)) {
      return sendError(
        res,
        "Video calls are only available for active bookings",
        400,
      );
    }

    const receiverId =
      req.user.id === booking.hirerId ? booking.workerId : booking.hirerId;

    // Reuse existing room if call already exists
    let call = await prisma.videoCall.findUnique({ where: { bookingId } });

    if (!call) {
      call = await prisma.videoCall.create({
        data: {
          bookingId,
          initiatorId: req.user.id,
          receiverId,
          roomId: `room-${randomUUID()}`,
          status: "PENDING",
        },
      });
    } else if (call.status === "ENDED") {
      // Allow re-initiating a new call session
      call = await prisma.videoCall.update({
        where: { bookingId },
        data: {
          status: "PENDING",
          startedAt: null,
          endedAt: null,
          initiatorId: req.user.id,
          receiverId,
        },
      });
    }

    // Notify receiver
    const callerName =
      req.user.id === booking.hirerId
        ? `${booking.hirer.firstName} ${booking.hirer.lastName}`
        : `${booking.worker.firstName} ${booking.worker.lastName}`;

    await prisma.notification.create({
      data: {
        userId: receiverId,
        title: "📹 Incoming Video Call",
        body: `${callerName} is calling you for booking "${booking.title}"`,
        type: "VIDEO_CALL_INCOMING",
        data: { bookingId, roomId: call.roomId, callId: call.id },
      },
    });

    return sendResponse(res, {
      status: 201,
      message: "Call initiated",
      data: { call, roomId: call.roomId },
    });
  } catch (err) {
    console.error("initiateCall error:", err.message);
    return sendError(res, "Failed to initiate call");
  }
};

// PATCH /api/video-calls/:bookingId/accept
export const acceptCall = async (req, res) => {
  try {
    const call = await prisma.videoCall.findUnique({
      where: { bookingId: req.params.bookingId },
    });
    if (!call) return sendError(res, "Call not found", 404);
    if (call.receiverId !== req.user.id)
      return sendError(res, "Forbidden", 403);

    const updated = await prisma.videoCall.update({
      where: { bookingId: req.params.bookingId },
      data: { status: "ACTIVE", startedAt: new Date() },
    });

    await prisma.notification.create({
      data: {
        userId: call.initiatorId,
        title: "📹 Call Accepted",
        body: "The other party accepted your video call.",
        type: "VIDEO_CALL_ACCEPTED",
        data: { bookingId: req.params.bookingId, roomId: call.roomId },
      },
    });

    return sendResponse(res, {
      message: "Call accepted",
      data: { call: updated },
    });
  } catch (err) {
    return sendError(res, "Failed to accept call");
  }
};

// PATCH /api/video-calls/:bookingId/decline
export const declineCall = async (req, res) => {
  try {
    const call = await prisma.videoCall.findUnique({
      where: { bookingId: req.params.bookingId },
    });
    if (!call) return sendError(res, "Call not found", 404);

    await prisma.videoCall.update({
      where: { bookingId: req.params.bookingId },
      data: { status: "DECLINED" },
    });

    await prisma.notification.create({
      data: {
        userId: call.initiatorId,
        title: "📹 Call Declined",
        body: "The other party declined your video call.",
        type: "VIDEO_CALL_DECLINED",
        data: { bookingId: req.params.bookingId },
      },
    });

    return sendResponse(res, { message: "Call declined" });
  } catch (err) {
    return sendError(res, "Failed to decline call");
  }
};

// PATCH /api/video-calls/:bookingId/end
export const endCall = async (req, res) => {
  try {
    const call = await prisma.videoCall.findUnique({
      where: { bookingId: req.params.bookingId },
    });
    if (!call) return sendError(res, "Call not found", 404);

    const updated = await prisma.videoCall.update({
      where: { bookingId: req.params.bookingId },
      data: { status: "ENDED", endedAt: new Date() },
    });

    return sendResponse(res, {
      message: "Call ended",
      data: { call: updated },
    });
  } catch (err) {
    return sendError(res, "Failed to end call");
  }
};

// GET /api/video-calls/:bookingId
export const getCallStatus = async (req, res) => {
  try {
    const call = await prisma.videoCall.findUnique({
      where: { bookingId: req.params.bookingId },
    });
    return sendResponse(res, { data: { call } });
  } catch (err) {
    return sendError(res, "Failed to fetch call");
  }
};
