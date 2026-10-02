// src/controllers/voicecall.controller.js
// ─────────────────────────────────────────────────────────────────────────────
// Voice & video call controller — scoped to a Conversation.
//
// A single VoiceCall row backs both call types (voice and video). The
// `callType` column determines which params the MiroTalk URL carries.
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
//
// Body: { callType?: "voice" | "video" }   (defaults to "voice")
// ─────────────────────────────────────────────────────────────────────────────
export const initiateVoiceCall = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const callType = req.body?.callType === "video" ? "video" : "voice";

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
          callType,
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
          callType,
        },
      });
    } else if (call.status === "ACTIVE") {
      // Already active — return current state with a correctly built URL
      return sendResponse(res, {
        data: {
          call,
          callUrl: buildVoiceCallUrl(call.roomId, call.callType),
          callType: call.callType,
        },
      });
    } else if (call.callType !== callType) {
      // PENDING and the caller switched type (voice ↔ video)
      call = await prisma.voiceCall.update({
        where: { conversationId },
        data: { callType, initiatorId: userId, receiverId },
      });
    }

    const callUrl = buildVoiceCallUrl(call.roomId, call.callType);

    // ── Notification ──────────────────────────────────────────────────────
    const callerName =
      `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() ||
      "Someone";
    const notifTitle =
      call.callType === "video"
        ? "📹 Incoming Video Call"
        : "🎙️ Incoming Voice Call";

    await prisma.notification
      .create({
        data: {
          userId: receiverId,
          title: notifTitle,
          body: `${callerName} is calling you`,
          type:
            call.callType === "video"
              ? "VIDEO_CALL_INCOMING"
              : "VOICE_CALL_INCOMING",
          data: {
            conversationId,
            callId: call.id,
            roomId: call.roomId,
            callUrl,
            callType: call.callType,
          },
        },
      })
      .catch(() => {});

    return sendResponse(res, {
      status: 201,
      message:
        call.callType === "video"
          ? "Video call initiated"
          : "Voice call initiated",
      data: {
        call,
        roomId: call.roomId,
        callUrl,
        callType: call.callType,
      },
    });
  } catch (err) {
    console.error("initiateVoiceCall error:", err.message);
    return sendError(res, "Failed to initiate call");
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

    const callUrl = buildVoiceCallUrl(updated.roomId, updated.callType);

    await prisma.notification
      .create({
        data: {
          userId: call.initiatorId,
          title:
            updated.callType === "video"
              ? "📹 Video Call Accepted"
              : "🎙️ Voice Call Accepted",
          body: "The other party accepted your call.",
          type:
            updated.callType === "video"
              ? "VIDEO_CALL_ACCEPTED"
              : "VOICE_CALL_ACCEPTED",
          data: {
            conversationId,
            roomId: call.roomId,
            callUrl,
            callType: updated.callType,
          },
        },
      })
      .catch(() => {});

    return sendResponse(res, {
      message: "Call accepted",
      data: { call: updated, callUrl, callType: updated.callType },
    });
  } catch (err) {
    console.error("acceptVoiceCall error:", err.message);
    return sendError(res, "Failed to accept call");
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
          title:
            call.callType === "video"
              ? "📹 Video Call Declined"
              : "🎙️ Voice Call Declined",
          body: "The other party declined your call.",
          type:
            call.callType === "video"
              ? "VIDEO_CALL_DECLINED"
              : "VOICE_CALL_DECLINED",
          data: { conversationId, callType: call.callType },
        },
      })
      .catch(() => {});

    return sendResponse(res, { message: "Call declined" });
  } catch (err) {
    console.error("declineVoiceCall error:", err.message);
    return sendError(res, "Failed to decline call");
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
      message: "Call ended",
      data: { call: updated },
    });
  } catch (err) {
    console.error("endVoiceCall error:", err.message);
    return sendError(res, "Failed to end call");
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
      return sendResponse(res, {
        data: { call: null, callUrl: null, callType: null },
      });
    }

    return sendResponse(res, {
      data: {
        call,
        callUrl: buildVoiceCallUrl(call.roomId, call.callType),
        callType: call.callType,
      },
    });
  } catch (err) {
    console.error("getVoiceCallStatus error:", err.message);
    return sendError(res, "Failed to fetch voice call");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/voice-calls/incoming
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
        callUrl: buildVoiceCallUrl(call.roomId, call.callType),
        callType: call.callType,
        conversationId: call.conversationId,
        callerName:
          `${call.initiator?.firstName || ""} ${call.initiator?.lastName || ""}`.trim(),
      },
    });
  } catch (err) {
    console.error("getIncomingVoiceCall error:", err.message);
    return sendError(res, "Failed to fetch incoming call");
  }
};
