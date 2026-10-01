import { randomUUID } from "crypto";
import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { buildCallUrl } from "../services/videoCall.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/video-calls/:bookingId/initiate
// Initiator asks for a room. If a room doesn't exist yet, create one.
// If it exists but ended, reuse it (fresh session).
// Returns the roomId AND the full call URL for both web and mobile clients.
// ─────────────────────────────────────────────────────────────────────────────
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

    if (!["PENDING", "ACCEPTED", "IN_PROGRESS"].includes(booking.status)) {
      return sendError(
        res,
        "Video calls are only available for active bookings",
        400,
      );
    }

    const receiverId =
      req.user.id === booking.hirerId ? booking.workerId : booking.hirerId;

    // ── Reuse existing room if call already exists for this booking ──────
    let call = await prisma.videoCall.findUnique({ where: { bookingId } });

    if (!call) {
      call = await prisma.videoCall.create({
        data: {
          bookingId,
          initiatorId: req.user.id,
          receiverId,
          roomId: `skp-${randomUUID().slice(0, 12)}`, // short, URL-safe
          status: "PENDING",
        },
      });
    } else if (call.status === "ENDED" || call.status === "DECLINED") {
      // Re-open the room for a fresh session — same room ID, so the URL
      // stays stable and any bookmarks/history entries keep working.
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

    const callUrl = buildCallUrl(call.roomId);

    // ── Notify receiver ─────────────────────────────────────────────────
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
        data: {
          bookingId,
          roomId: call.roomId,
          callId: call.id,
          callUrl, // ← mobile + web both read this
        },
      },
    });

    return sendResponse(res, {
      status: 201,
      message: "Call initiated",
      data: {
        call,
        roomId: call.roomId,
        callUrl, // ← the URL both clients navigate to
      },
    });
  } catch (err) {
    console.error("initiateCall error:", err.message);
    return sendError(res, "Failed to initiate call");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/video-calls/:bookingId/accept
// ─────────────────────────────────────────────────────────────────────────────
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

    const callUrl = buildCallUrl(updated.roomId);

    await prisma.notification.create({
      data: {
        userId: call.initiatorId,
        title: "📹 Call Accepted",
        body: "The other party accepted your video call.",
        type: "VIDEO_CALL_ACCEPTED",
        data: {
          bookingId: req.params.bookingId,
          roomId: call.roomId,
          callUrl,
        },
      },
    });

    return sendResponse(res, {
      message: "Call accepted",
      data: { call: updated, callUrl },
    });
  } catch (err) {
    return sendError(res, "Failed to accept call");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/video-calls/:bookingId/decline
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/video-calls/:bookingId/end
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/video-calls/:bookingId
// Returns current call state AND the URL clients should navigate to.
// ─────────────────────────────────────────────────────────────────────────────
export const getCallStatus = async (req, res) => {
  try {
    const call = await prisma.videoCall.findUnique({
      where: { bookingId: req.params.bookingId },
    });

    if (!call) {
      return sendResponse(res, { data: { call: null, callUrl: null } });
    }

    return sendResponse(res, {
      data: {
        call,
        callUrl: buildCallUrl(call.roomId),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch call");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/video-calls/:bookingId/token
// Returns just the URL (and room id) without touching state.
// Mobile app uses this to refresh the URL before opening the WebView.
// ─────────────────────────────────────────────────────────────────────────────
export const getCallUrl = async (req, res) => {
  try {
    const call = await prisma.videoCall.findUnique({
      where: { bookingId: req.params.bookingId },
    });
    if (!call) return sendError(res, "Call not found", 404);

    return sendResponse(res, {
      data: {
        roomId: call.roomId,
        callUrl: buildCallUrl(call.roomId),
        status: call.status,
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch call URL");
  }
};
