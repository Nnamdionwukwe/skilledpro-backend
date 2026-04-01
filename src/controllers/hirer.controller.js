// src/controllers/hirer.controller.js
import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { notifyProfileViewed } from "../services/notification.service.js";

export const getMyHirerProfile = async (req, res) => {
  try {
    const profile = await prisma.hirerProfile.findUnique({
      where: { userId: req.user.id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
            phone: true,
            country: true,
            city: true,
            currency: true,
            isEmailVerified: true,
            createdAt: true,
          },
        },
      },
    });
    if (!profile) return sendError(res, "Hirer profile not found", 404);
    return sendResponse(res, { data: { profile } });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to fetch profile");
  }
};

export const updateHirerProfile = async (req, res) => {
  try {
    const { companyName, companySize, website } = req.body;
    const profile = await prisma.hirerProfile.update({
      where: { userId: req.user.id },
      data: {
        companyName: companyName || null,
        companySize: companySize || null,
        website: website || null,
      },
    });
    return sendResponse(res, { message: "Profile updated", data: { profile } });
  } catch (err) {
    console.error(err);
    return sendError(res, "Update failed");
  }
};

export const getHirerProfile = async (req, res) => {
  try {
    const profile = await prisma.hirerProfile.findUnique({
      where: { userId: req.params.userId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            country: true,
            city: true,
            createdAt: true,
          },
        },
      },
    });
    if (!profile) return sendError(res, "Hirer not found", 404);

    // ── Notify hirer their profile was viewed ────────────────────────────────
    if (req.user && req.user.id !== req.params.userId) {
      const viewer = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { firstName: true, lastName: true, role: true },
      });
      if (viewer) {
        notifyProfileViewed(
          req.params.userId,
          `${viewer.firstName} ${viewer.lastName}`,
          viewer.role,
        ).catch(() => {});
      }
    }

    return sendResponse(res, { data: { profile } });
  } catch (err) {
    return sendError(res, "Failed to fetch hirer");
  }
};

export const getHirerBookings = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = { hirerId: req.user.id };
    if (status) where.status = status;

    const [bookings, total, stats] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take: parseInt(limit),
        include: {
          worker: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              workerProfile: { select: { title: true, avgRating: true } },
            },
          },
          category: true,
          payment: true,
          review: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.booking.count({ where }),
      prisma.booking.aggregate({
        where: { hirerId: req.user.id },
        _count: { id: true },
        _sum: { agreedRate: true },
      }),
    ]);

    return sendResponse(res, {
      data: {
        bookings,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        stats: {
          totalBookings: stats._count.id,
          totalSpent: stats._sum.agreedRate || 0,
        },
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to fetch bookings");
  }
};

export const getHirerDashboard = async (req, res) => {
  try {
    const [
      totalBookings,
      activeBookings,
      completedBookings,
      totalSpent,
      recentBookings,
      recentWorkers,
    ] = await Promise.all([
      prisma.booking.count({ where: { hirerId: req.user.id } }),
      prisma.booking.count({
        where: {
          hirerId: req.user.id,
          status: { in: ["PENDING", "ACCEPTED", "IN_PROGRESS"] },
        },
      }),
      prisma.booking.count({
        where: { hirerId: req.user.id, status: "COMPLETED" },
      }),
      prisma.payment.aggregate({
        where: { userId: req.user.id, status: "RELEASED" },
        _sum: { amount: true },
      }),
      prisma.booking.findMany({
        where: { hirerId: req.user.id },
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          worker: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
          },
          category: true,
        },
      }),
      prisma.booking.findMany({
        where: { hirerId: req.user.id, status: "COMPLETED" },
        take: 5,
        orderBy: { completedAt: "desc" },
        distinct: ["workerId"],
        include: {
          worker: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              workerProfile: { select: { title: true, avgRating: true } },
            },
          },
        },
      }),
    ]);

    return sendResponse(res, {
      data: {
        stats: {
          totalBookings,
          activeBookings,
          completedBookings,
          totalSpent: totalSpent._sum.amount || 0,
        },
        recentBookings,
        recentWorkers: recentWorkers.map((b) => b.worker),
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to fetch dashboard");
  }
};

export const getSavedWorkers = async (req, res) => {
  try {
    const bookedWorkers = await prisma.booking.findMany({
      where: { hirerId: req.user.id },
      distinct: ["workerId"],
      include: {
        worker: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            city: true,
            country: true,
            workerProfile: {
              select: {
                title: true,
                avgRating: true,
                totalReviews: true,
                hourlyRate: true,
                currency: true,
                isAvailable: true,
              },
            },
          },
        },
        category: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const workers = bookedWorkers.map((b) => ({
      ...b.worker,
      lastCategory: b.category,
    }));
    return sendResponse(res, { data: { workers } });
  } catch (err) {
    return sendError(res, "Failed to fetch saved workers");
  }
};

export const postJob = async (req, res) => {
  try {
    const {
      categoryId,
      title,
      description,
      address,
      latitude,
      longitude,
      scheduledAt,
      estimatedHours,
      budget,
      currency,
      notes,
    } = req.body;

    if (
      !categoryId ||
      !title ||
      !description ||
      !address ||
      !scheduledAt ||
      !budget
    ) {
      return sendError(res, "Please provide all required fields", 400);
    }

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) return sendError(res, "Category not found", 404);

    const matchedWorkers = await prisma.workerProfile.findMany({
      where: { isAvailable: true, categories: { some: { categoryId } } },
      take: 10,
      orderBy: [{ avgRating: "desc" }, { completedJobs: "desc" }],
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            city: true,
            country: true,
          },
        },
      },
    });

    return sendResponse(res, {
      status: 201,
      message: "Job posted successfully. Matched workers found.",
      data: {
        job: {
          categoryId,
          title,
          description,
          address,
          scheduledAt,
          budget,
          currency,
          notes,
        },
        matchedWorkers,
        totalMatched: matchedWorkers.length,
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to post job");
  }
};

export const getHirerReviews = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reviews, total, stats] = await Promise.all([
      prisma.review.findMany({
        where: { receiverId: req.user.id },
        skip,
        take: parseInt(limit),
        include: {
          giver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              role: true,
              country: true,
              city: true,
            },
          },
          booking: {
            select: {
              id: true,
              title: true,
              scheduledAt: true,
              category: { select: { name: true, icon: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.review.count({ where: { receiverId: req.user.id } }),
      prisma.review.aggregate({
        where: { receiverId: req.user.id },
        _avg: { rating: true },
        _count: { id: true },
      }),
    ]);

    const distribution = await prisma.review.groupBy({
      by: ["rating"],
      where: { receiverId: req.user.id },
      _count: { rating: true },
      orderBy: { rating: "desc" },
    });

    return sendResponse(res, {
      data: {
        reviews,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        avgRating: Math.round((stats._avg.rating || 0) * 10) / 10,
        totalReviews: stats._count.id,
        distribution: distribution.reduce((acc, r) => {
          acc[r.rating] = r._count.rating;
          return acc;
        }, {}),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch hirer reviews");
  }
};

export const getNotifications = async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const unread = await prisma.notification.count({
      where: { userId: req.user.id, isRead: false },
    });
    return sendResponse(res, { data: { notifications, unread } });
  } catch (err) {
    return sendError(res, "Failed to fetch notifications");
  }
};

export const markNotificationsRead = async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true },
    });
    return sendResponse(res, { message: "Notifications marked as read" });
  } catch (err) {
    return sendError(res, "Failed to update notifications");
  }
};
