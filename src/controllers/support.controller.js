// src/controllers/support.controller.js
import {
  createTicket as svcCreateTicket,
  addMessage as svcAddMessage,
  setStatus as svcSetStatus,
  setPriority as svcSetPriority,
  assignTicket as svcAssignTicket,
  listTickets as svcListTickets,
  getTicketFull,
  getTicketFullAdmin,
  submitCsat as svcSubmitCsat,
} from "../services/support.ticket.service.js";
import {
  startOrResumeChat,
  getChatForUser,
  listMyChats,
  escalateChatToTicket,
  submitChatCsat,
  adminListChats,
} from "../services/support.chat.service.js";
import { processSupportAttachments } from "../utils/supportAttachments.js";
import { PrismaClient } from "../generated/prisma/index.js";
import { logAdminAction } from "../utils/auditLog.js";

const prisma = new PrismaClient();

// ── Helpers ──────────────────────────────────────────────────────────────────
async function assertTicketAccess(ticketId, userId, role) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
  });
  if (!ticket)
    throw Object.assign(new Error("Ticket not found"), { status: 404 });
  if (role !== "ADMIN" && ticket.userId !== userId) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
  return ticket;
}

// ═════════════════════════════════════════════════════════════════════════════
// USER — TICKETS
// ═════════════════════════════════════════════════════════════════════════════

export async function createTicket(req, res, next) {
  try {
    const attachments = await processSupportAttachments(req.files);
    const ticket = await svcCreateTicket({
      userId: req.user.id,
      payload: req.body,
      attachments,
    });
    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "SUPPORT_TICKET_CREATED",
      targetType: "SUPPORT_TICKET",
      targetId: ticket.id,
      description: `Ticket ${ticket.ticketNumber} created`,
      after: { ticketNumber: ticket.ticketNumber, subject: ticket.subject },
    }).catch(() => {});
    res.status(201).json({ ticket });
  } catch (err) {
    next(err);
  }
}

export async function getMyTickets(req, res, next) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const where = { userId: req.user.id, ...(status ? { status } : {}) };
    const result = await svcListTickets({ where, page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getTicket(req, res, next) {
  try {
    await assertTicketAccess(req.params.id, req.user.id, req.user.role);
    const ticket = await getTicketFull(req.params.id);
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
}

export async function replyToTicket(req, res, next) {
  try {
    const ticket = await assertTicketAccess(
      req.params.id,
      req.user.id,
      req.user.role,
    );
    const attachments = await processSupportAttachments(req.files);
    if (!req.body.body?.trim() && !attachments) {
      return res.status(400).json({ message: "Message cannot be empty" });
    }
    const { message, ticketStatus } = await svcAddMessage({
      ticketId: ticket.id,
      authorId: req.user.id,
      authorType: "USER",
      body: req.body.body?.trim() || "",
      attachments,
      isInternal: false,
    });
    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "SUPPORT_TICKET_REPLIED",
      targetType: "SUPPORT_TICKET",
      targetId: ticket.id,
      description: `User replied to ${ticket.ticketNumber}`,
    }).catch(() => {});
    res.status(201).json({ message, ticketStatus });
  } catch (err) {
    next(err);
  }
}

export async function closeTicket(req, res, next) {
  try {
    await assertTicketAccess(req.params.id, req.user.id, req.user.role);
    const ticket = await svcSetStatus({
      ticketId: req.params.id,
      actorId: req.user.id,
      status: "CLOSED",
      note: "Closed by user",
    });
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
}

export async function reopenTicket(req, res, next) {
  try {
    const t = await assertTicketAccess(
      req.params.id,
      req.user.id,
      req.user.role,
    );
    if (!["RESOLVED", "CLOSED"].includes(t.status)) {
      return res
        .status(400)
        .json({ message: "Only resolved or closed tickets can be reopened" });
    }
    const ticket = await svcSetStatus({
      ticketId: req.params.id,
      actorId: req.user.id,
      status: "OPEN",
      note: "Reopened by user",
    });
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
}

export async function submitTicketCsat(req, res, next) {
  try {
    const ticket = await svcSubmitCsat({
      ticketId: req.params.id,
      userId: req.user.id,
      rating: req.body.rating,
      comment: req.body.comment,
    });
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN — TICKETS
// ═════════════════════════════════════════════════════════════════════════════

export async function adminListTickets(req, res, next) {
  try {
    const {
      status,
      category,
      priority,
      assignedAdminId,
      search,
      page = 1,
      limit = 20,
    } = req.query;
    const where = {
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      ...(priority ? { priority } : {}),
      ...(assignedAdminId ? { assignedAdminId } : {}),
      ...(search
        ? {
            OR: [
              { ticketNumber: { contains: search, mode: "insensitive" } },
              { subject: { contains: search, mode: "insensitive" } },
              { user: { email: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const result = await svcListTickets({ where, page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function adminTicketStats(req, res, next) {
  try {
    const [
      open,
      inProgress,
      waitingUser,
      waitingAdmin,
      resolved,
      closed,
      unassigned,
    ] = await Promise.all([
      prisma.supportTicket.count({ where: { status: "OPEN" } }),
      prisma.supportTicket.count({ where: { status: "IN_PROGRESS" } }),
      prisma.supportTicket.count({ where: { status: "WAITING_USER" } }),
      prisma.supportTicket.count({ where: { status: "WAITING_ADMIN" } }),
      prisma.supportTicket.count({ where: { status: "RESOLVED" } }),
      prisma.supportTicket.count({ where: { status: "CLOSED" } }),
      prisma.supportTicket.count({
        where: {
          assignedAdminId: null,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      }),
    ]);
    res.json({
      open,
      inProgress,
      waitingUser,
      waitingAdmin,
      resolved,
      closed,
      unassigned,
    });
  } catch (err) {
    next(err);
  }
}

export async function adminGetTicket(req, res, next) {
  try {
    const ticket = await getTicketFullAdmin(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
}

export async function adminReplyToTicket(req, res, next) {
  try {
    const attachments = await processSupportAttachments(req.files);
    const isInternal =
      req.body.isInternal === true || req.body.isInternal === "true";
    if (!req.body.body?.trim() && !attachments) {
      return res.status(400).json({ message: "Message cannot be empty" });
    }
    const { message, ticketStatus } = await svcAddMessage({
      ticketId: req.params.id,
      authorId: req.user.id,
      authorType: "ADMIN",
      body: req.body.body?.trim() || "",
      attachments,
      isInternal,
    });
    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "SUPPORT_TICKET_REPLIED",
      targetType: "SUPPORT_TICKET",
      targetId: req.params.id,
      description: `Admin replied${isInternal ? " (internal)" : ""} to ticket`,
    }).catch(() => {});
    res.status(201).json({ message, ticketStatus });
  } catch (err) {
    next(err);
  }
}

export async function adminAssignTicket(req, res, next) {
  try {
    const ticket = await svcAssignTicket({
      ticketId: req.params.id,
      actorId: req.user.id,
      adminId: req.body.adminId,
    });
    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "SUPPORT_TICKET_ASSIGNED",
      targetType: "SUPPORT_TICKET",
      targetId: ticket.id,
      description: `Ticket assigned to ${req.body.adminId || "nobody"}`,
    }).catch(() => {});
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
}

export async function adminUpdateTicketStatus(req, res, next) {
  try {
    const ticket = await svcSetStatus({
      ticketId: req.params.id,
      actorId: req.user.id,
      status: req.body.status,
      note: req.body.note,
    });
    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "SUPPORT_TICKET_STATUS_CHANGED",
      targetType: "SUPPORT_TICKET",
      targetId: ticket.id,
      description: `Status → ${req.body.status}`,
      after: { status: req.body.status },
    }).catch(() => {});
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
}

export async function adminUpdateTicketPriority(req, res, next) {
  try {
    const ticket = await svcSetPriority({
      ticketId: req.params.id,
      actorId: req.user.id,
      priority: req.body.priority,
    });
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// LIVE CHAT (REST bootstrap)
// ═════════════════════════════════════════════════════════════════════════════

export async function startChat(req, res, next) {
  try {
    const result = await startOrResumeChat({
      userId: req.user.id,
      payload: req.body,
    });
    res.status(result.created ? 201 : 200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getMyChats(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const result = await listMyChats({ userId: req.user.id, page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getChat(req, res, next) {
  try {
    const chat = await getChatForUser({
      conversationId: req.params.id,
      userId: req.user.id,
      role: req.user.role,
    });
    res.json({ chat });
  } catch (err) {
    next(err);
  }
}

export async function escalateChat(req, res, next) {
  try {
    const { ticket } = await escalateChatToTicket({
      conversationId: req.params.id,
      userId: req.user.id,
      role: req.user.role,
      payload: req.body,
    });
    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "SUPPORT_CHAT_ESCALATED",
      targetType: "SUPPORT_CHAT",
      targetId: req.params.id,
      description: `Chat escalated to ticket ${ticket.ticketNumber}`,
    }).catch(() => {});
    res.status(201).json({ ticket });
  } catch (err) {
    next(err);
  }
}

export async function submitChatCsatCtrl(req, res, next) {
  try {
    const chat = await submitChatCsat({
      conversationId: req.params.id,
      userId: req.user.id,
      rating: req.body.rating,
      comment: req.body.comment,
    });
    res.json({ chat });
  } catch (err) {
    next(err);
  }
}

export async function adminListChatsCtrl(req, res, next) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const result = await adminListChats({ status, page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function adminGetChat(req, res, next) {
  try {
    const chat = await getChatForUser({
      conversationId: req.params.id,
      userId: req.user.id,
      role: "ADMIN",
    });
    res.json({ chat });
  } catch (err) {
    next(err);
  }
}

// ── Chat upload endpoint (REST, since socket.io can't carry multipart) ──────
export async function uploadChatAttachments(req, res, next) {
  try {
    const attachments = await processSupportAttachments(req.files);
    if (!attachments)
      return res.status(400).json({ message: "No attachments uploaded" });
    res.json({ attachments });
  } catch (err) {
    next(err);
  }
}

// src/controllers/support.controller.js

export async function getStaleMessages(req, res, next) {
  try {
    const FIVE_MINUTES_AGO = new Date(Date.now() - 5 * 60 * 1000);

    // 1. Find chats where the last message is from the USER and older than 5 mins
    // We fetch recent chats and filter in JS because Prisma can't compare
    // two column values (createdAt >= lastMessageAt) in a single query.
    const recentChats = await prisma.supportConversation.findMany({
      where: {
        status: { in: ["AGENT_ASSIGNED", "WAITING_AGENT"] },
        lastMessageAt: { lt: FIVE_MINUTES_AGO },
      },
      select: {
        id: true,
        userId: true,
        lastMessagePreview: true,
        lastMessageAt: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { senderType: true },
        },
      },
      take: 50,
    });

    const staleChats = recentChats.filter((chat) => {
      const lastMsg = chat.messages?.[0];
      // Stale if last message was sent by USER (no admin reply after)
      return lastMsg && lastMsg.senderType === "USER";
    });

    // 2. Find tickets where the last message is from USER and older than 5 mins
    const recentTickets = await prisma.supportTicket.findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS", "WAITING_ADMIN"] },
        lastReplyAt: { lt: FIVE_MINUTES_AGO },
      },
      select: {
        id: true,
        subject: true,
        ticketNumber: true,
        lastReplyAt: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { authorType: true },
        },
      },
      take: 50,
    });

    const staleTickets = recentTickets.filter((ticket) => {
      const lastMsg = ticket.messages?.[0];
      // Stale if last message was sent by USER
      return lastMsg && lastMsg.authorType === "USER";
    });

    res.json({
      success: true,
      data: {
        staleChats: staleChats.map((c) => ({
          id: c.id,
          preview: c.lastMessagePreview,
          lastMessageAt: c.lastMessageAt,
        })),
        staleTickets: staleTickets.map((t) => ({
          id: t.id,
          subject: t.subject,
          ticketNumber: t.ticketNumber,
          lastReplyAt: t.lastReplyAt,
        })),
        totalStale: staleChats.length + staleTickets.length,
      },
    });
  } catch (err) {
    console.error("[getStaleMessages] Error:", err);
    next(err);
  }
}
