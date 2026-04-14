import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

export const getConversations = async (req, res) => {
  try {
    const convos = await prisma.conversation.findMany({
      where: { users: { some: { userId: req.user.id } } },
      include: {
        users: {
          include: {
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
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        // ← count unread messages addressed to this user
        _count: false,
      },
      orderBy: { updatedAt: "desc" },
    });

    // Add unread count per conversation
    const unreadCounts = await prisma.message.groupBy({
      by: ["conversationId"],
      where: {
        receiverId: req.user.id,
        isRead: false,
        conversationId: { in: convos.map((c) => c.id) },
      },
      _count: { id: true },
    });

    const unreadMap = {};
    for (const u of unreadCounts) unreadMap[u.conversationId] = u._count.id;

    const result = convos.map((c) => ({
      ...c,
      unreadCount: unreadMap[c.id] || 0,
    }));

    return sendResponse(res, { data: { conversations: result } });
  } catch (err) {
    return sendError(res, "Failed to fetch conversations");
  }
};

export const getMessages = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const messages = await prisma.message.findMany({
      where: { conversationId: req.params.conversationId },
      skip,
      take: parseInt(limit),
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    await prisma.message.updateMany({
      where: {
        conversationId: req.params.conversationId,
        receiverId: req.user.id,
        isRead: false,
      },
      data: { isRead: true },
    });
    return sendResponse(res, { data: { messages } });
  } catch (err) {
    return sendError(res, "Failed to fetch messages");
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { receiverId, content, conversationId } = req.body;

    if (!receiverId || !content?.trim()) {
      return sendError(res, "receiverId and content are required", 400);
    }

    let convoId = conversationId;

    if (!convoId) {
      // ── Look for an existing DIRECT (non-booking) conversation between these two users ──
      const existing = await prisma.conversation.findFirst({
        where: {
          bookingId: null, // direct conversations only
          users: { some: { userId: req.user.id } },
          AND: [{ users: { some: { userId: receiverId } } }],
        },
        // Extra safety: ensure BOTH users are in it (exactly these two)
        include: { users: { select: { userId: true } } },
      });

      // Verify it's exactly a 2-person conversation between these specific users
      const isExact =
        existing?.users?.length === 2 &&
        existing.users.some((u) => u.userId === req.user.id) &&
        existing.users.some((u) => u.userId === receiverId);

      if (isExact) {
        convoId = existing.id;
      } else {
        // Create a new direct conversation only if none exists
        const newConvo = await prisma.conversation.create({
          data: {
            users: {
              create: [{ userId: req.user.id }, { userId: receiverId }],
            },
          },
        });
        convoId = newConvo.id;
      }
    }

    const message = await prisma.message.create({
      data: {
        conversationId: convoId,
        senderId: req.user.id,
        receiverId,
        content: content.trim(),
        fileUrl: req.file?.path || null,
      },
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
      },
    });

    await prisma.conversation.update({
      where: { id: convoId },
      data: { updatedAt: new Date() },
    });

    return sendResponse(res, {
      status: 201,
      data: { message, conversationId: convoId },
    });
  } catch (err) {
    console.error("sendMessage error:", err);
    return sendError(res, "Failed to send message");
  }
};
