import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { getIO } from "../socket/index.js";

export const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 30, unreadOnly } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = { userId: req.user.id };
    if (unreadOnly === "true") where.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: "desc" },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { userId: req.user.id, isRead: false },
      }),
    ]);

    return sendResponse(res, {
      data: {
        notifications,
        total,
        unreadCount,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch notifications");
  }
};

export const markAsRead = async (req, res) => {
  try {
    const notification = await prisma.notification.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!notification) return sendError(res, "Notification not found", 404);
    await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true },
    });
    return sendResponse(res, { message: "Marked as read" });
  } catch (err) {
    return sendError(res, "Failed to update notification");
  }
};

export const markAllAsRead = async (req, res) => {
  try {
    const { count } = await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true },
    });
    return sendResponse(res, {
      message: `${count} notifications marked as read`,
    });
  } catch (err) {
    return sendError(res, "Failed to update notifications");
  }
};

export const deleteNotification = async (req, res) => {
  try {
    await prisma.notification.deleteMany({
      where: { id: req.params.id, userId: req.user.id },
    });
    return sendResponse(res, { message: "Notification deleted" });
  } catch (err) {
    return sendError(res, "Failed to delete notification");
  }
};

export const clearAllNotifications = async (req, res) => {
  try {
    const { count } = await prisma.notification.deleteMany({
      where: { userId: req.user.id },
    });
    return sendResponse(res, { message: `${count} notifications cleared` });
  } catch (err) {
    return sendError(res, "Failed to clear notifications");
  }
};

export const sendRealTimeNotification = async ({
  userId,
  title,
  body,
  type,
  data = {},
}) => {
  try {
    const notification = await prisma.notification.create({
      data: { userId, title, body, type, data },
    });
    const io = getIO();
    if (io) {
      io.to(`user:${userId}`).emit("notification", {
        id: notification.id,
        title,
        body,
        type,
        data,
        isRead: false,
        createdAt: notification.createdAt,
      });
    }
    return notification;
  } catch (err) {
    console.error("Real-time notification error:", err);
  }
};

export const notifyBookingUpdate = async (booking, status) => {
  const messages = {
    ACCEPTED: {
      hirerId: {
        title: "Booking Accepted ✅",
        body: `Your booking "${booking.title}" has been accepted.`,
      },
      workerId: {
        title: "You accepted a booking",
        body: `You accepted "${booking.title}".`,
      },
    },
    REJECTED: {
      hirerId: {
        title: "Booking Rejected",
        body: `Your booking "${booking.title}" was declined.`,
      },
    },
    IN_PROGRESS: {
      hirerId: {
        title: "Job Started 🔨",
        body: `Your worker has checked in for "${booking.title}".`,
      },
    },
    COMPLETED: {
      hirerId: {
        title: "Job Completed ⭐",
        body: `"${booking.title}" is complete. Please leave a review.`,
      },
      workerId: {
        title: "Job Completed 💰",
        body: `Payment for "${booking.title}" is being processed.`,
      },
    },
    CANCELLED: {
      workerId: {
        title: "Booking Cancelled",
        body: `Booking "${booking.title}" was cancelled.`,
      },
    },
  };

  const notifs = messages[status];
  if (!notifs) return;

  for (const [key, notif] of Object.entries(notifs)) {
    const userId = key === "hirerId" ? booking.hirerId : booking.workerId;
    if (userId) {
      await sendRealTimeNotification({
        userId,
        title: notif.title,
        body: notif.body,
        type: `BOOKING_${status}`,
        data: { bookingId: booking.id },
      });
    }
  }
};
