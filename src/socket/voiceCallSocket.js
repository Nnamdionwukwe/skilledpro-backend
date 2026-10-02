// src/socket/voiceCallSocket.js
// ─────────────────────────────────────────────────────────────────────────────
// WebRTC signaling for voice calls.
//
// Each conversation is a Socket.IO "room" named `voice:<conversationId>`.
// Only the two participants of the conversation may join.
//
// The server is a dumb relay — it forwards SDP offers/answers and ICE
// candidates between the two peers. It never sees or touches the media.
//
// Client → server events:
//   voice:join   { conversationId }   → join the room, get { ok: true }
//   voice:leave  { conversationId }   → leave the room
//   voice:offer  { conversationId, sdp }
//   voice:answer { conversationId, sdp }
//   voice:ice    { conversationId, candidate }
//
// Server → client events:
//   voice:peer-joined { userId }
//   voice:peer-left   { userId }
//   voice:offer       { fromUserId, sdp }
//   voice:answer      { fromUserId, sdp }
//   voice:ice         { fromUserId, candidate }
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../config/database.js";

export default function registerVoiceCallSocket(io) {
  // Dedicated namespace. Socket.IO will call our auth middleware for it too
  // (see the io.use() registration in server.js).
  const nsp = io.of("/voice-calls");

  nsp.on("connection", (socket) => {
    const userId = socket.user?.id;
    if (!userId) {
      socket.disconnect(true);
      return;
    }

    let activeConversation = null;

    // ── voice:join ────────────────────────────────────────────────────────
    socket.on("voice:join", async ({ conversationId } = {}, cb) => {
      try {
        if (!conversationId || typeof conversationId !== "string") {
          return cb?.({ ok: false, error: "conversationId required" });
        }

        // Confirm the user is a member of the conversation.
        const membership = await prisma.conversationUser.findFirst({
          where: { conversationId, userId },
          select: { id: true },
        });
        if (!membership) {
          return cb?.({ ok: false, error: "forbidden" });
        }

        const room = `voice:${conversationId}`;
        socket.join(room);
        activeConversation = conversationId;

        // Notify the other peer (if already in the room) that we joined.
        socket.to(room).emit("voice:peer-joined", { userId });

        return cb?.({ ok: true });
      } catch (err) {
        console.error("voice:join error:", err.message);
        return cb?.({ ok: false, error: "server error" });
      }
    });

    // ── voice:leave ───────────────────────────────────────────────────────
    socket.on("voice:leave", ({ conversationId } = {}) => {
      if (!conversationId) return;
      const room = `voice:${conversationId}`;
      socket.to(room).emit("voice:peer-left", { userId });
      socket.leave(room);
      if (activeConversation === conversationId) activeConversation = null;
    });

    // ── Signaling relays ──────────────────────────────────────────────────
    // We don't validate the payload beyond a shape check — the recipient's
    // browser will reject malformed SDP/ICE.

    socket.on("voice:offer", ({ conversationId, sdp } = {}) => {
      if (!conversationId || !sdp) return;
      socket.to(`voice:${conversationId}`).emit("voice:offer", {
        fromUserId: userId,
        sdp,
      });
    });

    socket.on("voice:answer", ({ conversationId, sdp } = {}) => {
      if (!conversationId || !sdp) return;
      socket.to(`voice:${conversationId}`).emit("voice:answer", {
        fromUserId: userId,
        sdp,
      });
    });

    socket.on("voice:ice", ({ conversationId, candidate } = {}) => {
      if (!conversationId || !candidate) return;
      socket.to(`voice:${conversationId}`).emit("voice:ice", {
        fromUserId: userId,
        candidate,
      });
    });

    // ── Cleanup on disconnect ─────────────────────────────────────────────
    socket.on("disconnect", () => {
      if (activeConversation) {
        socket
          .to(`voice:${activeConversation}`)
          .emit("voice:peer-left", { userId });
      }
    });
  });
}
