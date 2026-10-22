// src/socket/supportChatSocket.js
import prisma from "../config/database.js";
import socketAuthMiddleware from "./authMiddleware.js";

const room = (convId) => `support:chat:${convId}`;
const ADMIN_INBOX = "support:admin:inbox";

let ioInstance = null;

export default function registerSupportChatSocket(io) {
  ioInstance = io;
  const nsp = io.of("/support");

  nsp.use(socketAuthMiddleware);

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
      next(new Error("Unauthorized"));
    }
  });

  nsp.on("connection", (socket) => {
    const userId = socket.user.id;
    const role = socket.user.role;

    if (role === "ADMIN") socket.join(ADMIN_INBOX);

    // ── support:join ────────────────────────────────────────────────────
    socket.on("support:join", async ({ conversationId } = {}, ack) => {
      try {
        if (!conversationId) return ack?.({ error: "conversationId required" });

        const conv = await prisma.supportConversation.findUnique({
          where: { id: conversationId },
        });
        if (!conv) return ack?.({ error: "Conversation not found" });

        const isOwner = conv.userId === userId;
        const isAdmin = role === "ADMIN";
        if (!isOwner && !isAdmin) return ack?.({ error: "Forbidden" });

        socket.join(room(conversationId));

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
        ack?.({ error: "server error" });
      }
    });

    // ── support:message ─────────────────────────────────────────────────
    socket.on(
      "support:message",
      async (
        { conversationId, body, attachments, replyToId, tempId } = {},
        ack,
      ) => {
        try {
          if (!conversationId)
            return ack?.({ error: "conversationId required" });
          if (attachments && !Array.isArray(attachments))
            return ack?.({ error: "attachments must be an array" });

          const conv = await prisma.supportConversation.findUnique({
            where: { id: conversationId },
            include: {
              user: { select: { firstName: true, lastName: true } },
            },
          });
          if (!conv) return ack?.({ error: "Conversation not found" });
          if (["ENDED", "ESCALATED"].includes(conv.status))
            return ack?.({ error: "Conversation is closed" });

          const isAdmin = role === "ADMIN";
          if (conv.userId !== userId && !isAdmin)
            return ack?.({ error: "Forbidden" });
          if ((!body || !body.trim()) && !attachments?.length)
            return ack?.({ error: "Message cannot be empty" });

          const msg = await prisma.supportChatMessage.create({
            data: {
              conversationId,
              senderId: userId,
              senderType: isAdmin ? "ADMIN" : "USER",
              body: body?.trim() || null,
              attachments: attachments || undefined,
              replyToId: replyToId || undefined,
              tempId: tempId || undefined,
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
              replyTo: { select: { id: true, body: true, senderType: true } },
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

          // Emit to everyone EXCEPT sender
          socket.to(room(conversationId)).emit("support:message", msg);

          // NOTIFY ADMINS GLOBALLY (Fires for EVERY user message)
          if (!isAdmin) {
            nsp.to(ADMIN_INBOX).emit("support:inbox:new_message", {
              conversationId,
              preview,
              userId: conv.userId,
              messageId: msg.id,
              body: msg.body,
              senderName: `${conv.user.firstName} ${conv.user.lastName}`,
            });
          }

          // Return to sender via ack
          ack?.({ ok: true, message: msg });
        } catch (err) {
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
      } catch (err) {
        console.error("support:read error:", err.message);
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
        ack?.({ error: "server error" });
      }
    });

    socket.on("disconnect", (reason) => {
      if (role === "ADMIN") socket.leave(ADMIN_INBOX);
    });
  });
}

export function getSupportIO() {
  if (!ioInstance) {
    console.warn(
      "[support] Socket.io instance requested before initialisation",
    );
  }
  return ioInstance;
}
