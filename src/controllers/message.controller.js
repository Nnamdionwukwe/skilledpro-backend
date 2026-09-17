// src/controllers/message.controller.js
import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { paginate } from "../utils/helpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/messages/conversations?page=1&limit=50
// Returns the user's conversations, newest activity first.
// Each conversation includes: the other participant, the last message,
// and an unread count for the current user.
// ─────────────────────────────────────────────────────────────────────────────
export const getConversations = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const { skip, take } = paginate(page, limit);

    const where = { users: { some: { userId: req.user.id } } };

    const [convos, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        skip,
        take,
        include: {
          users: {
            include: {
              user: {
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
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.conversation.count({ where }),
    ]);

    if (convos.length === 0) {
      return sendResponse(res, {
        data: {
          conversations: [],
          total: 0,
          page: parseInt(page, 10) || 1,
          pages: 0,
        },
      });
    }

    // Unread counts for just this page's conversations
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

    return sendResponse(res, {
      data: {
        conversations: result,
        total,
        page: parseInt(page, 10) || 1,
        pages: Math.ceil(total / take) || 1,
      },
    });
  } catch (err) {
    console.error("getConversations error:", err);
    return sendError(res, "Failed to fetch conversations");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/messages/:conversationId?page=1&limit=100
// Returns the NEWEST N messages (not oldest), re-sorted oldest → newest
// so the frontend can render top-to-bottom and scroll to the bottom.
// ─────────────────────────────────────────────────────────────────────────────
export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 100 } = req.query;
    const { skip, take } = paginate(page, limit);

    // Verify the requesting user is a participant
    const membership = await prisma.conversationUser.findFirst({
      where: { conversationId, userId: req.user.id },
    });
    if (!membership) return sendError(res, "Conversation not found", 404);

    // Fetch newest first so pagination returns the most recent messages,
    // then reverse for display.
    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId },
        skip,
        take,
        include: {
          sender: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.message.count({ where: { conversationId } }),
    ]);

    const sorted = messages.reverse();

    return sendResponse(res, {
      data: {
        messages: sorted,
        total,
        page: parseInt(page, 10) || 1,
        pages: Math.ceil(total / take) || 1,
      },
    });
  } catch (err) {
    console.error("getMessages error:", err);
    return sendError(res, "Failed to fetch messages");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/messages/:conversationId/read
// Marks all unread messages in a conversation as read for the current user.
// ─────────────────────────────────────────────────────────────────────────────
export const markConversationRead = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const membership = await prisma.conversationUser.findFirst({
      where: { conversationId, userId: req.user.id },
    });
    if (!membership) return sendError(res, "Conversation not found", 404);

    const result = await prisma.message.updateMany({
      where: {
        conversationId,
        receiverId: req.user.id,
        isRead: false,
      },
      data: { isRead: true },
    });

    return sendResponse(res, {
      message: "Marked as read",
      data: { updated: result.count },
    });
  } catch (err) {
    console.error("markConversationRead error:", err);
    return sendError(res, "Failed to mark as read");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/messages
// Body: { receiverId?, conversationId?, content?, file? }
// Either receiverId or conversationId is required. If only conversationId
// is provided, the receiver is derived from the conversation's other member.
// ─────────────────────────────────────────────────────────────────────────────
export const sendMessage = async (req, res) => {
  try {
    let { receiverId, content, conversationId } = req.body;

    const file = req.file || (req.files?.length > 0 ? req.files[0] : null);

    if (!content?.trim() && !file) {
      return sendError(res, "Message content or file is required", 400);
    }

    let convoId = conversationId || null;

    // ── Resolve the conversation and the receiver ──────────────────────────
    if (convoId) {
      // Verify the sender is a member; derive receiver if missing
      const convo = await prisma.conversation.findUnique({
        where: { id: convoId },
        include: { users: { select: { userId: true } } },
      });

      if (!convo) return sendError(res, "Conversation not found", 404);

      const isMember = convo.users.some((u) => u.userId === req.user.id);
      if (!isMember) return sendError(res, "Not a participant", 403);

      if (!receiverId) {
        const other = convo.users.find((u) => u.userId !== req.user.id);
        if (!other) return sendError(res, "No other participant found", 400);
        receiverId = other.userId;
      }
    } else {
      // No conversationId — require a receiverId and find/create a 1-on-1 convo
      if (!receiverId) {
        return sendError(res, "receiverId or conversationId is required", 400);
      }
      if (receiverId === req.user.id) {
        return sendError(res, "You cannot message yourself", 400);
      }

      // Confirm the receiver exists
      const receiver = await prisma.user.findUnique({
        where: { id: receiverId },
        select: { id: true },
      });
      if (!receiver) return sendError(res, "Recipient not found", 404);

      // Find an existing 1-on-1 conversation between exactly these two users
      const existing = await prisma.conversation.findFirst({
        where: {
          AND: [
            { users: { some: { userId: req.user.id } } },
            { users: { some: { userId: receiverId } } },
          ],
        },
        include: { users: { select: { userId: true } } },
      });

      const isExact =
        existing?.users?.length === 2 &&
        existing.users.some((u) => u.userId === req.user.id) &&
        existing.users.some((u) => u.userId === receiverId);

      if (isExact) {
        convoId = existing.id;
      } else {
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

    // ── Prepare content ────────────────────────────────────────────────────
    const fileUrl = file?.path || null;
    let messageContent = content?.trim() || "";

    if (file) {
      const mime = file.mimetype || "";
      if (mime.startsWith("image/"))
        messageContent = messageContent || "[Image]";
      else if (mime.startsWith("video/"))
        messageContent = messageContent || "[Video]";
      else messageContent = messageContent || file.originalname || "[File]";
    }

    // ── Create the message ─────────────────────────────────────────────────
    const message = await prisma.message.create({
      data: {
        conversationId: convoId,
        senderId: req.user.id,
        receiverId,
        content: messageContent,
        fileUrl,
      },
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
      },
    });

    // ── Bump conversation updatedAt so it floats to the top ────────────────
    await prisma.conversation.update({
      where: { id: convoId },
      data: { updatedAt: new Date() },
    });

    // ── Notify the recipient (non-blocking) ────────────────────────────────
    prisma.notification
      .create({
        data: {
          userId: receiverId,
          title: `${message.sender.firstName} ${message.sender.lastName}`,
          body:
            messageContent.length > 80
              ? messageContent.slice(0, 77) + "..."
              : messageContent,
          type: "MESSAGE",
          data: {
            conversationId: convoId,
            messageId: message.id,
            senderId: req.user.id,
          },
        },
      })
      .catch((err) => console.warn("notify message failed:", err.message));

    return sendResponse(res, {
      status: 201,
      data: { message, conversationId: convoId },
    });
  } catch (err) {
    console.error("sendMessage error:", err);
    return sendError(res, "Failed to send message");
  }
};
