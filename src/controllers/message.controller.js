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
        // ← REMOVED _count: false   (invalid Prisma — was breaking unread counts for Hirers)
      },
      orderBy: { updatedAt: "desc" },
    });

    if (convos.length === 0) {
      return sendResponse(res, { data: { conversations: [] } });
    }

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
    console.error("getConversations error:", err);
    return sendError(res, "Failed to fetch conversations");
  }
};

// In getMessages — REMOVE the updateMany, just fetch:
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
    // ← No more updateMany here
    return sendResponse(res, { data: { messages } });
  } catch (err) {
    return sendError(res, "Failed to fetch messages");
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { receiverId, content, conversationId } = req.body;

    if (!receiverId) {
      return sendError(res, "receiverId is required", 400);
    }

    // ── Normalise file — upload.any() puts it in req.files[], not req.file ──
    const file = req.file || (req.files?.length > 0 ? req.files[0] : null);

    if (!content?.trim() && !file) {
      return sendError(res, "Message content or file is required", 400);
    }

    // ── Resolve conversation ──────────────────────────────────────────────────
    let convoId = conversationId || null;

    if (!convoId) {
      const existing = await prisma.conversation.findFirst({
        where: {
          bookingId: null,
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

    // ── Resolve file + content ────────────────────────────────────────────────
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

    // ── Create message ────────────────────────────────────────────────────────
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
