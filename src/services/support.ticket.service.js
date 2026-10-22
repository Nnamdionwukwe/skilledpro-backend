// src/services/support.ticket.service.js
import { PrismaClient } from "../generated/prisma/index.js";
import { generateTicketNumber } from "../utils/supportTicketNumber.js";
import { SUPPORT_POLICY } from "../config/supportConfig.js";
import { getSupportIO } from "../socket/supportChatSocket.js";

const prisma = new PrismaClient();

const SLA_MIN = SUPPORT_POLICY.sla;
const TERMINAL_STATUSES = ["RESOLVED", "CLOSED"];

function slaDate(priority) {
  const now = new Date();
  const add = (mins) => new Date(now.getTime() + mins * 60_000);
  switch (priority) {
    case "URGENT":
      return add(SLA_MIN.urgentFirstResponseMinutes);
    case "HIGH":
      return add(SLA_MIN.highFirstResponseMinutes);
    default:
      return add(SLA_MIN.normalFirstResponseMinutes);
  }
}

export async function createTicket({ userId, payload, attachments }) {
  const ticketNumber = await generateTicketNumber();

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.supportTicket.create({
      data: {
        ticketNumber,
        userId,
        category: payload.category,
        priority: payload.priority || "NORMAL",
        subject: payload.subject,
        description: payload.description,
        attachments: attachments || undefined,
        relatedType: payload.relatedType || null,
        relatedId: payload.relatedId || null,
        lastReplyAt: new Date(),
      },
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
    });

    await tx.supportMessage.create({
      data: {
        ticketId: created.id,
        authorId: userId,
        authorType: "USER",
        body: payload.description,
        attachments: attachments || undefined,
      },
    });

    await tx.supportTicketAudit.create({
      data: {
        ticketId: created.id,
        actorId: userId,
        action: "STATUS_CHANGED",
        fromValue: null,
        toValue: "OPEN",
        note: `Ticket created (${ticketNumber})`,
      },
    });

    return created;
  });

  // NOTIFY ADMINS IN REAL-TIME
  try {
    const io = getSupportIO();
    if (io) {
      io.of("/support")
        .to("support:admin:inbox")
        .emit("support:inbox:new_ticket", {
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          userId: userId,
          body: ticket.description, // Fallback message body
          senderName: `${ticket.user.firstName} ${ticket.user.lastName}`,
        });
    }
  } catch (err) {
    console.error("Failed to emit ticket notification:", err.message);
  }

  return ticket;
}

export async function addMessage({
  ticketId,
  authorId,
  authorType,
  body,
  attachments,
  isInternal,
  replyToId,
}) {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.findUnique({
      where: { id: ticketId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!ticket)
      throw Object.assign(new Error("Ticket not found"), { status: 404 });
    if (ticket.status === "CLOSED") {
      throw Object.assign(new Error("Ticket is closed. Reopen it first."), {
        status: 400,
      });
    }

    const message = await tx.supportMessage.create({
      data: {
        ticketId,
        authorId,
        authorType,
        body,
        attachments: attachments || undefined,
        isInternal: !!isInternal,
        replyToId: replyToId || undefined,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
          },
        },
        replyTo: {
          select: {
            id: true,
            body: true,
            authorType: true,
          },
        },
      },
    });

    let newStatus = ticket.status;
    if (authorType === "ADMIN") {
      if (["OPEN", "WAITING_ADMIN"].includes(ticket.status))
        newStatus = isInternal ? ticket.status : "WAITING_USER";
      if (!ticket.firstResponseAt && !isInternal) {
        await tx.supportTicket.update({
          where: { id: ticketId },
          data: { firstResponseAt: new Date() },
        });
      }
    } else if (authorType === "USER") {
      if (
        ["WAITING_USER", "RESOLVED", "WAITING_ADMIN"].includes(ticket.status)
      ) {
        newStatus = "OPEN";
      }

      // Notify Admin Inbox if a user replies to a ticket
      try {
        const io = getSupportIO();
        if (io) {
          io.of("/support")
            .to("support:admin:inbox")
            .emit("support:inbox:new_ticket_reply", {
              ticketId,
              ticketNumber: ticket.ticketNumber,
              subject: ticket.subject,
              body: body, // Include the body for the banner
              senderName: `${ticket.user.firstName} ${ticket.user.lastName}`, // Include sender name
            });
        }
      } catch (err) {}
    }

    await tx.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: newStatus,
        lastReplyAt: new Date(),
        resolvedAt: newStatus !== "RESOLVED" ? null : ticket.resolvedAt,
        autoCloseAt: null,
      },
    });

    return { message, ticketStatus: newStatus };
  });
}

// ... (setStatus, setPriority, assignTicket remain unchanged)

export async function setStatus({ ticketId, actorId, status, note }) {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket)
      throw Object.assign(new Error("Ticket not found"), { status: 404 });
    if (ticket.status === status) return ticket;

    const data = { status };
    if (status === "RESOLVED") {
      data.resolvedAt = new Date();
      data.autoCloseAt = new Date(
        Date.now() + SLA_MIN.autoCloseResolvedDays * 24 * 60 * 60 * 1000,
      );
    }
    if (status === "CLOSED") {
      data.closedAt = new Date();
    }
    if (status === "OPEN" && TERMINAL_STATUSES.includes(ticket.status)) {
      data.reopenedCount = { increment: 1 };
      data.resolvedAt = null;
      data.closedAt = null;
      data.autoCloseAt = null;
    }

    const updated = await tx.supportTicket.update({
      where: { id: ticketId },
      data,
    });

    await tx.supportTicketAudit.create({
      data: {
        ticketId,
        actorId,
        action: "STATUS_CHANGED",
        fromValue: ticket.status,
        toValue: status,
        note: note || null,
      },
    });

    return updated;
  });
}

export async function setPriority({ ticketId, actorId, priority }) {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket)
      throw Object.assign(new Error("Ticket not found"), { status: 404 });
    if (ticket.priority === priority) return ticket;

    const updated = await tx.supportTicket.update({
      where: { id: ticketId },
      data: { priority },
    });
    await tx.supportTicketAudit.create({
      data: {
        ticketId,
        actorId,
        action: "PRIORITY_CHANGED",
        fromValue: ticket.priority,
        toValue: priority,
      },
    });
    return updated;
  });
}

export async function assignTicket({ ticketId, actorId, adminId }) {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket)
      throw Object.assign(new Error("Ticket not found"), { status: 404 });

    const data = adminId
      ? { assignedAdminId: adminId, assignedAt: new Date() }
      : { assignedAdminId: null, assignedAt: null };

    const updated = await tx.supportTicket.update({
      where: { id: ticketId },
      data,
    });

    await tx.supportTicketAudit.create({
      data: {
        ticketId,
        actorId,
        action: "ASSIGNED",
        fromValue: ticket.assignedAdminId || null,
        toValue: adminId || null,
      },
    });

    return updated;
  });
}

export async function listTickets({ where, page, limit, orderBy }) {
  const skip = (Number(page) - 1) * Number(limit);
  const [rows, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: orderBy || { lastReplyAt: "desc" },
      skip,
      take: Number(limit),
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
          },
        },
        assignedAdmin: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
        _count: {
          select: {
            messages: {
              where: {
                authorType: "USER",
                readByAdminAt: null,
              },
            },
          },
        },
      },
    }),
    prisma.supportTicket.count({ where }),
  ]);

  const mappedTickets = rows.map((t) => {
    const { _count, ...ticketData } = t;
    return {
      ...ticketData,
      unreadCount: _count?.messages || 0,
    };
  });

  return {
    tickets: mappedTickets,
    total,
    page: Number(page),
    limit: Number(limit),
  };
}

export async function getTicketFull(ticketId) {
  return prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatar: true,
        },
      },
      assignedAdmin: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
      messages: {
        where: { isInternal: false },
        orderBy: { createdAt: "asc" },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              role: true,
            },
          },
          replyTo: {
            select: {
              id: true,
              body: true,
              authorType: true,
            },
          },
        },
      },
    },
  });
}

export async function getTicketFullAdmin(ticketId) {
  await prisma.supportMessage.updateMany({
    where: {
      ticketId,
      authorType: "USER",
      readByAdminAt: null,
    },
    data: { readByAdminAt: new Date() },
  });

  return prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatar: true,
        },
      },
      assignedAdmin: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              role: true,
            },
          },
          replyTo: {
            select: {
              id: true,
              body: true,
              authorType: true,
            },
          },
        },
      },
      auditLogs: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function submitCsat({ ticketId, userId, rating, comment }) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
  });
  if (!ticket)
    throw Object.assign(new Error("Ticket not found"), { status: 404 });
  if (ticket.userId !== userId)
    throw Object.assign(new Error("Forbidden"), { status: 403 });

  const updated = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      csatRating: rating,
      csatComment: comment || null,
      csatSubmittedAt: new Date(),
    },
  });

  await prisma.supportTicketAudit
    .create({
      data: {
        ticketId,
        actorId: userId,
        action: "CSAT_SUBMITTED",
        toValue: String(rating),
        note: comment || null,
      },
    })
    .catch(() => {});

  return updated;
}

export async function autoCloseResolvedTickets() {
  const due = await prisma.supportTicket.findMany({
    where: { status: "RESOLVED", autoCloseAt: { lte: new Date() } },
    select: { id: true },
  });

  for (const { id } of due) {
    await prisma.supportTicket.update({
      where: { id },
      data: { status: "CLOSED", closedAt: new Date() },
    });
    await prisma.supportTicketAudit
      .create({
        data: {
          ticketId: id,
          actorId:
            (
              await prisma.user.findFirst({
                where: { role: "ADMIN" },
                select: { id: true },
              })
            )?.id ||
            (
              await prisma.supportTicket.findUnique({
                where: { id },
                select: { userId: true },
              })
            ).userId,
          action: "STATUS_CHANGED",
          fromValue: "RESOLVED",
          toValue: "CLOSED",
          note: "Auto-closed after 7 days",
        },
      })
      .catch(() => {});
  }

  return due.length;
}

export { slaDate };
