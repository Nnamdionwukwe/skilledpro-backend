import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

export const getConversations = async (req, res) => {
  try {
    const convos = await prisma.conversation.findMany({
      where: { users: { some: { userId: req.user.id } } },
      include: {
        users: { include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
    });
    return sendResponse(res, { data: { conversations: convos } });
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
      skip, take: parseInt(limit),
      include: { sender: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
      orderBy: { createdAt: "asc" },
    });
    await prisma.message.updateMany({
      where: { conversationId: req.params.conversationId, receiverId: req.user.id, isRead: false },
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
    let convoId = conversationId;
    if (!convoId) {
      const convo = await prisma.conversation.create({
        data: { users: { create: [{ userId: req.user.id }, { userId: receiverId }] } },
      });
      convoId = convo.id;
    }
    const message = await prisma.message.create({
      data: { conversationId: convoId, senderId: req.user.id, receiverId, content, fileUrl: req.file?.path || null },
      include: { sender: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
    });
    await prisma.conversation.update({ where: { id: convoId }, data: { updatedAt: new Date() } });
    return sendResponse(res, { status: 201, data: { message, conversationId: convoId } });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to send message");
  }
};
