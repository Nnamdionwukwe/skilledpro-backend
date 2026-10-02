// src/controllers/voicecall.controller.js
// ─────────────────────────────────────────────────────────────────────────────
// Voice call controller — parallel to videocall.controller.js but scoped
// to a Conversation instead of a Booking.
//
// Endpoints:
//   POST   /api/voice-calls/:conversationId/initiate   — start a call
//   PATCH  /api/voice-calls/:conversationId/accept     — receiver picks up
//   PATCH  /api/voice-calls/:conversationId/decline    — receiver rejects
//   PATCH  /api/voice-calls/:conversationId/end        — either party ends
//   GET    /api/voice-calls/:conversationId            — poll status
//   GET    /api/voice-calls/incoming                   — global banner poll
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import {
  buildVoiceCallUrl,
  buildVoiceRoomId,
} from "../services/voiceCall.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: verify the current user is a member of the conversation.
// Returns { conversation } on success, or { error, status } on failure.
// ─────────────────────────────────────────────────────────────────────────────
async function loadConversationForUser(conversationId, userId) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      users: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  if (!conversation) return { error: "Conversation not found", status: 404 };

  const isMember = conversation.users.some((u) => u.userId === userId);
  if (!isMember) return { error: "Forbidden", status: 403 };

  return { conversation };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/voice-calls/:conversationId/initiate
// ─────────────────────────────────────────────────────────────────────────────
export const initiateVoiceCall = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const { conversation, error, status } = await loadConversationForUser(
      conversationId,
      userId,
    );
    if (error) return sendError(res, error, status);

    const other = conversation.users.find((u) => u.userId !== userId);
    if (!other) {
      return sendError(res, "No other participant in this conversation", 400);
    }
    const receiverId = other.userId;

    // ── Reuse or reopen existing call ─────────────────────────────────────
    let call = await prisma.voiceCall.findUnique({
      where: { conversationId },
    });

    if (!call) {
      call = await prisma.voiceCall.create({
        data: {
          conversationId,
          initiatorId: userId,
          receiverId,
          roomId: buildVoiceRoomId(randomUUID()),
          status: "PENDING",
        },
      });
    } else if (call.status === "ENDED" || call.status === "DECLINED") {
      call = await prisma.voiceCall.update({
        where: { conversationId },
        data: {
          status: "PENDING",
          initiatorId: userId,
          receiverId,
          startedAt: null,
          endedAt: null,
        },
      });
    } else if (call.status === "ACTIVE") {
      // Already active — return the current state so both clients can join
      return sendResponse(res, {
        data: {
          call,
          callUrl: buildVoiceCallUrl(call.roomId),
          callType: "voice",
        },
      });
    }

    const callUrl = buildVoiceCallUrl(call.roomId);

    // ── Fire-and-forget notification for the receiver ─────────────────────
    const callerName =
      `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() ||
      "Someone";

    await prisma.notification
      .create({
        data: {
          userId: receiverId,
          title: "🎙️ Incoming Voice Call",
          body: `${callerName} is calling you`,
          type: "VOICE_CALL_INCOMING",
          data: {
            conversationId,
            callId: call.id,
            roomId: call.roomId,
            callUrl,
            callType: "voice",
          },
        },
      })
      .catch(() => {});

    return sendResponse(res, {
      status: 201,
      message: "Voice call initiated",
      data: { call, roomId: call.roomId, callUrl, callType: "voice" },
    });
  } catch (err) {
    console.error("initiateVoiceCall error:", err.message);
    return sendError(res, "Failed to initiate voice call");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/voice-calls/:conversationId/accept
// ─────────────────────────────────────────────────────────────────────────────
export const acceptVoiceCall = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const call = await prisma.voiceCall.findUnique({
      where: { conversationId },
    });
    if (!call) return sendError(res, "Call not found", 404);
    if (call.receiverId !== userId) return sendError(res, "Forbidden", 403);
    if (call.status !== "PENDING") {
      return sendError(res, `Call is ${call.status}, cannot accept`, 400);
    }

    const updated = await prisma.voiceCall.update({
      where: { conversationId },
      data: { status: "ACTIVE", startedAt: new Date() },
    });

    const callUrl = buildVoiceCallUrl(updated.roomId);

    await prisma.notification
      .create({
        data: {
          userId: call.initiatorId,
          title: "🎙️ Voice Call Accepted",
          body: "The other party accepted your voice call.",
          type: "VOICE_CALL_ACCEPTED",
          data: {
            conversationId,
            roomId: call.roomId,
            callUrl,
            callType: "voice",
          },
        },
      })
      .catch(() => {});

    return sendResponse(res, {
      message: "Voice call accepted",
      data: { call: updated, callUrl, callType: "voice" },
    });
  } catch (err) {
    console.error("acceptVoiceCall error:", err.message);
    return sendError(res, "Failed to accept voice call");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/voice-calls/:conversationId/decline
// ─────────────────────────────────────────────────────────────────────────────
export const declineVoiceCall = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const call = await prisma.voiceCall.findUnique({
      where: { conversationId },
    });
    if (!call) return sendError(res, "Call not found", 404);
    if (call.receiverId !== userId) return sendError(res, "Forbidden", 403);

    await prisma.voiceCall.update({
      where: { conversationId },
      data: { status: "DECLINED", endedAt: new Date() },
    });

    await prisma.notification
      .create({
        data: {
          userId: call.initiatorId,
          title: "🎙️ Voice Call Declined",
          body: "The other party declined your voice call.",
          type: "VOICE_CALL_DECLINED",
          data: { conversationId, callType: "voice" },
        },
      })
      .catch(() => {});

    return sendResponse(res, { message: "Voice call declined" });
  } catch (err) {
    console.error("declineVoiceCall error:", err.message);
    return sendError(res, "Failed to decline voice call");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/voice-calls/:conversationId/end
// ─────────────────────────────────────────────────────────────────────────────
export const endVoiceCall = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const call = await prisma.voiceCall.findUnique({
      where: { conversationId },
    });
    if (!call) return sendError(res, "Call not found", 404);
    if (call.initiatorId !== userId && call.receiverId !== userId) {
      return sendError(res, "Forbidden", 403);
    }

    const updated = await prisma.voiceCall.update({
      where: { conversationId },
      data: { status: "ENDED", endedAt: new Date() },
    });

    return sendResponse(res, {
      message: "Voice call ended",
      data: { call: updated },
    });
  } catch (err) {
    console.error("endVoiceCall error:", err.message);
    return sendError(res, "Failed to end voice call");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/voice-calls/:conversationId
// ─────────────────────────────────────────────────────────────────────────────
export const getVoiceCallStatus = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const call = await prisma.voiceCall.findUnique({
      where: { conversationId },
    });

    if (!call) {
      return sendResponse(res, { data: { call: null, callUrl: null } });
    }

    return sendResponse(res, {
      data: {
        call,
        callUrl: buildVoiceCallUrl(call.roomId),
        callType: "voice",
      },
    });
  } catch (err) {
    console.error("getVoiceCallStatus error:", err.message);
    return sendError(res, "Failed to fetch voice call");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/voice-calls/incoming
// Returns the most recent PENDING voice call where current user is receiver.
// Used by the global incoming-call banner.
// ─────────────────────────────────────────────────────────────────────────────
export const getIncomingVoiceCall = async (req, res) => {
  try {
    const userId = req.user.id;

    const call = await prisma.voiceCall.findFirst({
      where: { receiverId: userId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        initiator: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
        conversation: { select: { id: true } },
      },
    });

    if (!call) {
      return sendResponse(res, {
        data: { call: null, callUrl: null, callType: null },
      });
    }

    return sendResponse(res, {
      data: {
        call,
        callUrl: buildVoiceCallUrl(call.roomId),
        callType: "voice",
        conversationId: call.conversationId,
        callerName:
          `${call.initiator?.firstName || ""} ${call.initiator?.lastName || ""}`.trim(),
      },
    });
  } catch (err) {
    console.error("getIncomingVoiceCall error:", err.message);
    return sendError(res, "Failed to fetch incoming voice call");
  }
};
