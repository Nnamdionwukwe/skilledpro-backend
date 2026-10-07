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
// CRITICAL: Socket.IO middleware registered with `io.use()` only runs on the
// DEFAULT namespace. Namespaces created with `io.of("/name")` have their own
// middleware chain. We attach socketAuthMiddleware explicitly with
// `nsp.use(socketAuthMiddleware)` so `socket.userId` is populated here too.
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
import socketAuthMiddleware from "./authMiddleware.js";

export default function registerVoiceCallSocket(io) {
  const nsp = io.of("/voice-calls");

  // Attach the same JWT auth middleware to this namespace. Without this,
  // `socket.userId` is undefined and every connection is disconnected on
  // arrival (which was the silent bug causing calls to fail).
  nsp.use(socketAuthMiddleware);

  nsp.on("connection", (socket) => {
    // socket.userId is set by the auth middleware above.
    const userId = socket.userId;

    if (!userId) {
      // Should never happen now — middleware guarantees userId.
      console.error(
        "[voice-calls] connection without userId — auth middleware failed",
      );
      socket.disconnect(true);
      return;
    }

    console.log(`[voice-calls] 🔌 connected: ${userId} (${socket.id})`);

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

        console.log(
          `[voice-calls] ${userId} joined room ${room} (socket ${socket.id})`,
        );

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
      console.log(`[voice-calls] ${userId} left room ${room}`);
    });

    // ── Signaling relays ──────────────────────────────────────────────────
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
    socket.on("disconnect", (reason) => {
      console.log(
        `[voice-calls] 🔴 disconnected: ${userId} (${socket.id}) — ${reason}`,
      );
      if (activeConversation) {
        socket
          .to(`voice:${activeConversation}`)
          .emit("voice:peer-left", { userId });
      }
    });
  });
}
