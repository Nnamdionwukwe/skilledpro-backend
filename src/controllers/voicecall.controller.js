// src/controllers/voicecall.controller.js
// ─────────────────────────────────────────────────────────────────────────────
// Voice & video call controller — scoped to a Conversation.
//
// Media flows peer-to-peer via WebRTC. The backend handles:
//   • Call lifecycle state (PENDING → ACTIVE → ENDED | DECLINED)
//   • Authorization (only conversation members may act on the call)
//   • Notifications to the other party
//
// Signaling (offer/answer/ICE) is handled by the Socket.IO namespace in
// src/socket/voiceCallSocket.js — it doesn't touch this file.
//
// Endpoints:
//   POST   /api/voice-calls/:conversationId/initiate   — start a call
//   PATCH  /api/voice-calls/:conversationId/accept     — receiver picks up
//   PATCH  /api/voice-calls/:conversationId/decline    — receiver rejects
//   PATCH  /api/voice-calls/:conversationId/end        — either party ends
//   GET    /api/voice-calls/:conversationId            — poll status
//   GET    /api/voice-calls/incoming                   — global banner poll
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { sendIncomingCallPush } from "../services/pushNotification.service.js";

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
// initiateVoiceCall
// POST /api/voice-calls/:conversationId/initiate
//
// Creates (or reuses) a VoiceCall row for a 1-on-1 conversation, emits
// "voice-call:incoming" over the socket, AND sends a high-priority push
// notification so the callee's phone rings even when the app is closed.
// ─────────────────────────────────────────────────────────────────────────────
export const initiateVoiceCall = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const { callType = "voice", returnTo, returnParams } = req.body || {};

    // ── 1. Verify the caller belongs to this conversation ──────────────
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        users: {
          select: {
            userId: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    if (!conversation) return sendError(res, "Conversation not found", 404);

    const isMember = conversation.users.some((u) => u.userId === userId);
    if (!isMember) return sendError(res, "Not a participant", 403);

    const other = conversation.users.find((u) => u.userId !== userId);
    if (!other)
      return sendError(res, "No other participant in conversation", 400);
    const calleeId = other.userId;

    // ── 2. Reuse or create the VoiceCall row ───────────────────────────
    let call = await prisma.voiceCall.findUnique({
      where: { conversationId },
    });

    if (
      call &&
      ["PENDING", "ACTIVE"].includes(call.status) &&
      call.callType === callType
    ) {
      // Already ringing or active — reuse the existing row.
      return sendResponse(res, {
        message: "Call already in progress",
        data: { call },
      });
    }

    if (call) {
      // Reopen for a fresh session — same room, new initiator/receiver.
      call = await prisma.voiceCall.update({
        where: { conversationId },
        data: {
          status: "PENDING",
          callType,
          initiatorId: userId,
          receiverId: calleeId,
          startedAt: null,
          endedAt: null,
          returnTo: returnTo ?? null,
          returnParams: returnParams ?? null,
        },
      });
    } else {
      call = await prisma.voiceCall.create({
        data: {
          conversationId,
          initiatorId: userId,
          receiverId: calleeId,
          callType,
          status: "PENDING",
          returnTo: returnTo ?? null,
          returnParams: returnParams ?? null,
        },
      });
    }

    // ── 3. Compose the caller's display name ───────────────────────────
    const caller = conversation.users.find((u) => u.userId === userId)?.user;
    const callerName =
      `${caller?.firstName ?? ""} ${caller?.lastName ?? ""}`.trim() ||
      "Someone";

    // DM rooms are deterministic — the frontend builds `skp-conv-${id}`.
    const callUrl = `https://call.skilledproz.com/skp-conv-${conversationId}?audio=1&video=1&notify=0&chat=0`;

    // ── 4. Socket emit (in-app banner) ─────────────────────────────────
    const io = req.app.get("io");
    if (io) {
      io.to(`user:${calleeId}`).emit("voice-call:incoming", {
        call: {
          ...call,
          initiator: caller ?? null,
          callUrl,
        },
      });
    }

    // ── 5. ✅ NEW — high-priority push notification ────────────────────
    // Wakes the callee's phone even when the app is closed or in the
    // background. Fire-and-forget — a push failure must not block the
    // HTTP response to the caller.
    sendIncomingCallPush(calleeId, {
      callType:
        callType === "video" ? "CONVERSATION_VIDEO" : "CONVERSATION_VOICE",
      callId: call.id,
      roomId: `skp-conv-${conversationId}`,
      callUrl,
      callerName,
      title:
        callType === "video"
          ? `Video call from ${callerName}`
          : `Voice call from ${callerName}`,
      conversationId,
    }).catch((err) => console.error("DM push failed:", err));

    return sendResponse(res, {
      message: "Call initiated",
      data: { call },
    });
  } catch (err) {
    console.error("initiateVoiceCall error:", err.message);
    return sendError(res, "Failed to initiate call");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/voice-calls/:conversationId/accept
// ✅ NEW: echoes returnTo/returnParams/bookingId so the receiver's UI can
// route to the correct return screen after the call ends.
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
            callType: updated.callType,
          },
        },
      })
      .catch(() => {});

    return sendResponse(res, {
      message: "Call accepted",
      data: {
        call: updated,
        callType: updated.callType,
        // ✅ NEW
        returnTo: updated.returnTo || null,
        returnParams: updated.returnParams || null,
        bookingId: updated.bookingId || null,
      },
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
// ✅ NEW: echoes returnTo/returnParams/bookingId so the caller's end handler
// has the same routing info as the receiver.
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
      data: {
        call: updated,
        // ✅ NEW
        returnTo: updated.returnTo || null,
        returnParams: updated.returnParams || null,
        bookingId: updated.bookingId || null,
      },
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
        data: { call: null, callType: null },
      });
    }

    return sendResponse(res, {
      data: { call, callType: call.callType },
    });
  } catch (err) {
    console.error("getVoiceCallStatus error:", err.message);
    return sendError(res, "Failed to fetch voice call");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/voice-calls/incoming
//
// ✅ NEW: now echoes `returnTo`, `returnParams`, and `bookingId` at the top
// level of the response, alongside `conversationId` and `callerName`. This is
// what the mobile VoiceCallBanner uses to decide where to navigate after the
// user accepts (Chat vs BookingDetail vs JobApplications).
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
        data: { call: null, callType: null },
      });
    }

    return sendResponse(res, {
      data: {
        call,
        callType: call.callType,
        conversationId: call.conversationId,
        callerName:
          `${call.initiator?.firstName || ""} ${call.initiator?.lastName || ""}`.trim(),
        // ✅ NEW — top-level echo so the app can navigate correctly:
        returnTo: call.returnTo || null,
        returnParams: call.returnParams || null,
        bookingId: call.bookingId || null,
      },
    });
  } catch (err) {
    console.error("getIncomingVoiceCall error:", err.message);
    return sendError(res, "Failed to fetch incoming call");
  }
};
