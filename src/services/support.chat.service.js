import { PrismaClient } from "../generated/prisma/index.js";

const prisma = new PrismaClient();

export async function startOrResumeChat({ userId, payload }) {
  // Reuse an active chat if one exists
  const existing = await prisma.supportConversation.findFirst({
    where: {
      userId,
      status: { in: ["ACTIVE", "WAITING_AGENT", "AGENT_ASSIGNED"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) return { conversation: existing, created: false };

  const conversation = await prisma.$transaction(async (tx) => {
    const created = await tx.supportConversation.create({
      data: {
        userId,
        status: "WAITING_AGENT",
        subject: payload.subject || null,
        preChatCategory: payload.category || null,
        preChatMessage: payload.message || null,
        lastMessageAt: new Date(),
      },
    });

    await tx.supportChatParticipant.create({
      data: { conversationId: created.id, userId, role: "USER" },
    });

    if (payload.message?.trim()) {
      const msg = await tx.supportChatMessage.create({
        data: {
          conversationId: created.id,
          senderId: userId,
          senderType: "USER",
          body: payload.message.trim(),
          deliveredAt: new Date(),
        },
      });

      await tx.supportConversation.update({
        where: { id: created.id },
        data: {
          lastMessagePreview: payload.message.slice(0, 120),
          lastMessageAt: new Date(),
        },
      });

      return { created, msg };
    }

    return { created, msg: null };
  });

  return {
    conversation: conversation.created,
    firstMessage: conversation.msg,
    created: true,
  };
}

export async function getChatForUser({ conversationId, userId, role }) {
  const conv = await prisma.supportConversation.findUnique({
    where: { id: conversationId },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
      assignedAdmin: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
      participants: {
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
          },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
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
      },
    },
  });

  if (!conv) throw Object.assign(new Error("Chat not found"), { status: 404 });
  if (role !== "ADMIN" && conv.userId !== userId) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }

  return conv;
}

export async function listMyChats({ userId, page = 1, limit = 20 }) {
  const skip = (Number(page) - 1) * Number(limit);
  const [chats, total] = await Promise.all([
    prisma.supportConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      skip,
      take: Number(limit),
      select: {
        id: true,
        status: true,
        subject: true,
        lastMessageAt: true,
        lastMessagePreview: true,
        csatRating: true,
        assignedAdmin: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
        createdAt: true,
        endedAt: true,
      },
    }),
    prisma.supportConversation.count({ where: { userId } }),
  ]);
  return { chats, total, page: Number(page), limit: Number(limit) };
}

export async function escalateChatToTicket({
  conversationId,
  userId,
  role,
  payload,
}) {
  const conv = await prisma.supportConversation.findUnique({
    where: { id: conversationId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conv) throw Object.assign(new Error("Chat not found"), { status: 404 });
  if (role !== "ADMIN" && conv.userId !== userId) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
  if (conv.escalatedTicketId) {
    return {
      ticket: await prisma.supportTicket.findUnique({
        where: { id: conv.escalatedTicketId },
      }),
    };
  }

  const { generateTicketNumber } =
    await import("../utils/supportTicketNumber.js");
  const ticketNumber = await generateTicketNumber();

  // Build description from chat transcript
  const transcript = conv.messages
    .filter((m) => m.senderType !== "SYSTEM")
    .map((m) => `[${m.senderType}] ${m.body || "(attachment)"}`)
    .join("\n");

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.supportTicket.create({
      data: {
        ticketNumber,
        userId: conv.userId,
        category: payload.category,
        priority: payload.priority || "NORMAL",
        subject: payload.subject,
        description: `Escalated from live chat.\n\n--- Transcript ---\n${transcript || "(no messages)"}`,
        lastReplyAt: new Date(),
        chatConversationId: conv.id,
      },
    });

    await tx.supportConversation.update({
      where: { id: conv.id },
      data: {
        escalatedTicketId: created.id,
        status: "ESCALATED",
        endedAt: new Date(),
      },
    });

    await tx.supportTicketAudit
      .create({
        data: {
          ticketId: created.id,
          actorId: userId,
          action: "ESCALATED",
          toValue: "OPEN",
          note: `Escalated from chat ${conv.id}`,
        },
      })
      .catch(() => {});

    return created;
  });

  return { ticket };
}

export async function submitChatCsat({
  conversationId,
  userId,
  rating,
  comment,
}) {
  const conv = await prisma.supportConversation.findUnique({
    where: { id: conversationId },
  });
  if (!conv) throw Object.assign(new Error("Chat not found"), { status: 404 });
  if (conv.userId !== userId)
    throw Object.assign(new Error("Forbidden"), { status: 403 });

  return prisma.supportConversation.update({
    where: { id: conversationId },
    data: {
      csatRating: rating,
      csatComment: comment || null,
      csatSubmittedAt: new Date(),
    },
  });
}

export async function adminListChats({ status, page = 1, limit = 20 }) {
  const where = status ? { status } : {};
  const skip = (Number(page) - 1) * Number(limit);
  const [chats, total] = await Promise.all([
    prisma.supportConversation.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      skip,
      take: Number(limit),
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            email: true,
          },
        },
        assignedAdmin: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
      },
    }),
    prisma.supportConversation.count({ where }),
  ]);
  return { chats, total, page: Number(page), limit: Number(limit) };
}
