// src/socket/supportChatSocket.js
// ─────────────────────────────────────────────────────────────────────────────
// Support live chat — real-time messaging between users and admins.
//
// Namespace: /support
// Room name: support:chat:<conversationId>
//
// Mirrors voiceCallSocket.js:
//   • Namespace registered via io.of("/support")
//   • JWT auth attached via nsp.use(socketAuthMiddleware)
//   • Extra middleware loads socket.user (role required for admin gating)
//   • Reuses the shared io created in socket/index.js — no second server
//
// Client → server:
//   support:join    { conversationId }                    → { ok, conversation }
//   support:message { conversationId, body, attachments } → { ok, message }
//   support:typing  { conversationId, isTyping }          (fire-and-forget)
//   support:read    { conversationId }                    (fire-and-forget)
//   support:end     { conversationId, reason }            → { ok }
//
// Server → client:
//   support:message             <message object>
//   support:typing              { conversationId, userId, isTyping }
//   support:read                { conversationId, byUserId, at }
//   support:ended               { conversationId, endedAt, byUserId, systemMessage }
//   support:inbox:new_message   { conversationId, preview, userId }  (admin inbox only)
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../config/database.js";
import socketAuthMiddleware from "./authMiddleware.js";

const room = (convId) => `support:chat:${convId}`;
const ADMIN_INBOX = "support:admin:inbox";

export default function registerSupportChatSocket(io) {
  const nsp = io.of("/support");

  // Same JWT auth as the default namespace and /voice-calls.
  nsp.use(socketAuthMiddleware);

  // Extra middleware: load full user (we need role for admin gating).
  nsp.use(async (socket, next) => {
    try {
      const userId = socket.userId;
      if (!userId) return next(new Error("Unauthorized"));

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          firstName: true,
          lastName: true,
          avatar: true,
          isActive: true,
        },
      });
      if (!user || !user.isActive) return next(new Error("Unauthorized"));

      socket.user = user;
      next();
    } catch (err) {
      console.error("[support] auth middleware error:", err.message);
      next(new Error("Unauthorized"));
    }
  });

  nsp.on("connection", (socket) => {
    const userId = socket.user.id;
    const role = socket.user.role;

    // Admins auto-join the inbox room for new-message notifications
    if (role === "ADMIN") socket.join(ADMIN_INBOX);

    console.log(`[support] 🔌 connected: ${userId} (${socket.id})`);

    // ── support:join ────────────────────────────────────────────────────
    socket.on("support:join", async ({ conversationId } = {}, ack) => {
      try {
        if (!conversationId || typeof conversationId !== "string") {
          return ack?.({ error: "conversationId required" });
        }

        const conv = await prisma.supportConversation.findUnique({
          where: { id: conversationId },
        });
        if (!conv) return ack?.({ error: "Conversation not found" });

        const isOwner = conv.userId === userId;
        const isAdmin = role === "ADMIN";
        if (!isOwner && !isAdmin) return ack?.({ error: "Forbidden" });

        socket.join(room(conversationId));

        // Admin joins → claim if unassigned
        if (isAdmin && ["ACTIVE", "WAITING_AGENT"].includes(conv.status)) {
          await prisma.supportChatParticipant.upsert({
            where: { conversationId_userId: { conversationId, userId } },
            create: { conversationId, userId, role: "AGENT" },
            update: {},
          });

          if (!conv.assignedAdminId) {
            await prisma.supportConversation.update({
              where: { id: conversationId },
              data: {
                assignedAdminId: userId,
                assignedAt: new Date(),
                status: "AGENT_ASSIGNED",
              },
            });

            const sysMsg = await prisma.supportChatMessage.create({
              data: {
                conversationId,
                senderId: userId,
                senderType: "SYSTEM",
                systemEvent: "AGENT_JOINED",
                body: "An agent has joined the chat.",
              },
            });
            nsp.to(room(conversationId)).emit("support:message", sysMsg);
          }
        }

        ack?.({ ok: true, conversation: conv });
      } catch (err) {
        console.error("support:join error:", err.message);
        ack?.({ error: "server error" });
      }
    });

    // ── support:message ─────────────────────────────────────────────────
    socket.on(
      "support:message",
      async ({ conversationId, body, attachments } = {}, ack) => {
        try {
          if (!conversationId)
            return ack?.({ error: "conversationId required" });
          if (attachments && !Array.isArray(attachments)) {
            return ack?.({ error: "attachments must be an array" });
          }

          const conv = await prisma.supportConversation.findUnique({
            where: { id: conversationId },
          });
          if (!conv) return ack?.({ error: "Conversation not found" });
          if (["ENDED", "ESCALATED"].includes(conv.status)) {
            return ack?.({ error: "Conversation is closed" });
          }

          const isAdmin = role === "ADMIN";
          if (conv.userId !== userId && !isAdmin) {
            return ack?.({ error: "Forbidden" });
          }
          if ((!body || !body.trim()) && !attachments?.length) {
            return ack?.({ error: "Message cannot be empty" });
          }

          const msg = await prisma.supportChatMessage.create({
            data: {
              conversationId,
              senderId: userId,
              senderType: isAdmin ? "ADMIN" : "USER",
              body: body?.trim() || null,
              attachments: attachments || undefined,
              deliveredAt: new Date(),
            },
            include: {
              sender: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  role: true,
                },
              },
            },
          });

          const preview =
            body?.slice(0, 120) ||
            (attachments?.length ? `📎 ${attachments[0].type}` : "Message");

          await prisma.supportConversation.update({
            where: { id: conversationId },
            data: {
              lastMessageAt: new Date(),
              lastMessagePreview: preview,
              ...(isAdmin
                ? { status: "AGENT_ASSIGNED", adminLastReadAt: new Date() }
                : { userLastReadAt: new Date() }),
            },
          });

          // Emit to everyone in the room EXCEPT the sender's socket.
          // The sender will get this via the `ack` callback instead.
          socket.to(room(conversationId)).emit("support:message", msg);

          if (!isAdmin && conv.status === "WAITING_AGENT") {
            nsp.to(ADMIN_INBOX).emit("support:inbox:new_message", {
              conversationId,
              preview,
              userId: conv.userId,
            });
          }

          ack?.({ ok: true, message: msg });
        } catch (err) {
          console.error("support:message error:", err.message);
          ack?.({ error: "server error" });
        }
      },
    );

    // ── support:typing ──────────────────────────────────────────────────
    socket.on("support:typing", ({ conversationId, isTyping } = {}) => {
      if (!conversationId) return;
      socket.to(room(conversationId)).emit("support:typing", {
        conversationId,
        userId,
        isTyping: !!isTyping,
      });
    });

    // ── support:read ────────────────────────────────────────────────────
    socket.on("support:read", async ({ conversationId } = {}) => {
      if (!conversationId) return;
      try {
        const now = new Date();
        const isAdmin = role === "ADMIN";

        await prisma.supportConversation.update({
          where: { id: conversationId },
          data: isAdmin ? { adminLastReadAt: now } : { userLastReadAt: now },
        });

        await prisma.supportChatMessage.updateMany({
          where: { conversationId, senderId: { not: userId }, readAt: null },
          data: { readAt: now },
        });

        socket.to(room(conversationId)).emit("support:read", {
          conversationId,
          byUserId: userId,
          at: now,
        });
      } catch {
        /* ignore */
      }
    });

    // ── support:end ─────────────────────────────────────────────────────
    socket.on("support:end", async ({ conversationId, reason } = {}, ack) => {
      try {
        if (!conversationId) return ack?.({ error: "conversationId required" });

        const conv = await prisma.supportConversation.findUnique({
          where: { id: conversationId },
        });
        if (!conv) return ack?.({ error: "Not found" });
        if (conv.userId !== userId && role !== "ADMIN") {
          return ack?.({ error: "Forbidden" });
        }
        if (conv.status === "ENDED") return ack?.({ ok: true });

        await prisma.supportConversation.update({
          where: { id: conversationId },
          data: { status: "ENDED", endedAt: new Date(), endedById: userId },
        });

        const sysMsg = await prisma.supportChatMessage.create({
          data: {
            conversationId,
            senderId: userId,
            senderType: "SYSTEM",
            systemEvent: "ENDED",
            body: reason || "Chat ended.",
          },
        });

        nsp.to(room(conversationId)).emit("support:ended", {
          conversationId,
          endedAt: new Date(),
          byUserId: userId,
          systemMessage: sysMsg,
        });

        ack?.({ ok: true });
      } catch (err) {
        console.error("support:end error:", err.message);
        ack?.({ error: "server error" });
      }
    });

    // ── Cleanup ─────────────────────────────────────────────────────────
    socket.on("disconnect", (reason) => {
      if (role === "ADMIN") socket.leave(ADMIN_INBOX);
      console.log(`[support] 🔴 ${userId} disconnected — ${reason}`);
    });
  });

  console.log("[support] ✅ namespace /support registered");
}
