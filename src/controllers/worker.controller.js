import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

export const searchWorkers = async (req, res) => {
  try {
    const {
      category,
      city,
      country,
      minRate,
      maxRate,
      rating,
      page = 1,
      limit = 20,
    } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = { isAvailable: true };
    if (city || country) {
      where.user = {};
      if (city) where.user.city = { contains: city, mode: "insensitive" };
      if (country)
        where.user.country = { contains: country, mode: "insensitive" };
    }
    if (minRate || maxRate) {
      where.hourlyRate = {};
      if (minRate) where.hourlyRate.gte = parseFloat(minRate);
      if (maxRate) where.hourlyRate.lte = parseFloat(maxRate);
    }
    if (rating) where.avgRating = { gte: parseFloat(rating) };
    if (category) {
      where.categories = { some: { category: { slug: category } } };
    }
    const [workers, total] = await Promise.all([
      prisma.workerProfile.findMany({
        where,
        skip,
        take: parseInt(limit),
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
          categories: { include: { category: true } },
        },
        orderBy: { avgRating: "desc" },
      }),
      prisma.workerProfile.count({ where }),
    ]);
    return sendResponse(res, {
      data: {
        workers,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Search failed");
  }
};

export const getWorkerProfile = async (req, res) => {
  try {
    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.params.userId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            city: true,
            country: true,
            createdAt: true,
          },
        },
        categories: { include: { category: true } },
        portfolio: true,
        certifications: true,
        availability: true,
      },
    });
    if (!worker) return sendError(res, "Worker not found", 404);
    return sendResponse(res, { data: { worker } });
  } catch (err) {
    return sendError(res, "Failed to fetch worker");
  }
};

export const updateWorkerProfile = async (req, res) => {
  try {
    const {
      title,
      description,
      hourlyRate,
      currency,
      yearsExperience,
      serviceRadius,
      isAvailable,
    } = req.body;
    const worker = await prisma.workerProfile.update({
      where: { userId: req.user.id },
      data: {
        title,
        description,
        hourlyRate: hourlyRate ? parseFloat(hourlyRate) : undefined,
        currency,
        yearsExperience: yearsExperience
          ? parseInt(yearsExperience)
          : undefined,
        serviceRadius: serviceRadius ? parseInt(serviceRadius) : undefined,
        isAvailable,
      },
    });
    return sendResponse(res, { message: "Profile updated", data: { worker } });
  } catch (err) {
    return sendError(res, "Update failed");
  }
};

export const addPortfolio = async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!req.file) return sendError(res, "Image required", 400);
    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.user.id },
    });
    if (!worker) return sendError(res, "Worker profile not found", 404);
    const item = await prisma.portfolio.create({
      data: {
        workerProfileId: worker.id,
        title,
        description,
        imageUrl: req.file.path,
      },
    });
    return sendResponse(res, {
      status: 201,
      message: "Portfolio item added",
      data: { item },
    });
  } catch (err) {
    return sendError(res, "Failed to add portfolio");
  }
};

export const deletePortfolio = async (req, res) => {
  try {
    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.user.id },
    });
    await prisma.portfolio.deleteMany({
      where: { id: req.params.id, workerProfileId: worker.id },
    });
    return sendResponse(res, { message: "Portfolio item deleted" });
  } catch (err) {
    return sendError(res, "Delete failed");
  }
};

export const addCertification = async (req, res) => {
  try {
    const { name, issuedBy, issueDate, expiryDate } = req.body;
    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.user.id },
    });
    const cert = await prisma.certification.create({
      data: {
        workerProfileId: worker.id,
        name,
        issuedBy,
        issueDate: issueDate ? new Date(issueDate) : null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        documentUrl: req.file?.path,
      },
    });
    return sendResponse(res, { status: 201, data: { cert } });
  } catch (err) {
    return sendError(res, "Failed to add certification");
  }
};

export const updateAvailability = async (req, res) => {
  try {
    const { availability } = req.body;
    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.user.id },
    });
    await prisma.availability.deleteMany({
      where: { workerProfileId: worker.id },
    });
    const created = await prisma.availability.createMany({
      data: availability.map((a) => ({
        workerProfileId: worker.id,
        dayOfWeek: a.dayOfWeek,
        startTime: a.startTime,
        endTime: a.endTime,
        isAvailable: a.isAvailable ?? true,
      })),
    });
    return sendResponse(res, {
      message: "Availability updated",
      data: { created },
    });
  } catch (err) {
    return sendError(res, "Update failed");
  }
};

export const addCategory = async (req, res) => {
  try {
    const { categoryId, isPrimary } = req.body;
    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.user.id },
    });
    const wc = await prisma.workerCategory.upsert({
      where: {
        workerProfileId_categoryId: { workerProfileId: worker.id, categoryId },
      },
      update: { isPrimary: isPrimary ?? false },
      create: {
        workerProfileId: worker.id,
        categoryId,
        isPrimary: isPrimary ?? false,
      },
    });
    return sendResponse(res, { status: 201, data: { wc } });
  } catch (err) {
    return sendError(res, "Failed to add category");
  }
};

// ─────────────────────────────────────────────
// GET /api/workers/dashboard
// ─────────────────────────────────────────────
export const getWorkerDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    const worker = await prisma.workerProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            city: true,
            country: true,
            email: true,
            phone: true,
            createdAt: true,
          },
        },
        categories: { include: { category: true } },
        certifications: true,
        availability: true,
        portfolio: true,
      },
    });

    if (!worker) return sendError(res, "Worker profile not found", 404);

    const [
      totalBookings,
      pendingBookings,
      activeBookings,
      completedBookings,
      cancelledBookings,
      disputedBookings,
    ] = await Promise.all([
      prisma.booking.count({ where: { workerId: userId } }),
      prisma.booking.count({ where: { workerId: userId, status: "PENDING" } }),
      prisma.booking.count({
        where: { workerId: userId, status: "IN_PROGRESS" },
      }),
      prisma.booking.count({
        where: { workerId: userId, status: "COMPLETED" },
      }),
      prisma.booking.count({
        where: { workerId: userId, status: "CANCELLED" },
      }),
      prisma.booking.count({ where: { workerId: userId, status: "DISPUTED" } }),
    ]);

    const recentBookings = await prisma.booking.findMany({
      where: { workerId: userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        hirer: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
        category: { select: { name: true, slug: true, icon: true } },
        payment: {
          select: {
            amount: true,
            currency: true,
            status: true,
            workerPayout: true,
          },
        },
      },
    });

    const upcomingBookings = await prisma.booking.findMany({
      where: {
        workerId: userId,
        status: { in: ["ACCEPTED", "PENDING"] },
        scheduledAt: { gte: new Date() },
      },
      orderBy: { scheduledAt: "asc" },
      take: 5,
      include: {
        hirer: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
        category: { select: { name: true, icon: true } },
      },
    });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [thisMonthPayments, lastMonthPayments, thisYearPayments] =
      await Promise.all([
        prisma.payment.aggregate({
          where: {
            booking: { workerId: userId },
            status: "RELEASED",
            createdAt: { gte: startOfMonth },
          },
          _sum: { workerPayout: true },
        }),
        prisma.payment.aggregate({
          where: {
            booking: { workerId: userId },
            status: "RELEASED",
            createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
          },
          _sum: { workerPayout: true },
        }),
        prisma.payment.aggregate({
          where: {
            booking: { workerId: userId },
            status: "RELEASED",
            createdAt: { gte: startOfYear },
          },
          _sum: { workerPayout: true },
        }),
      ]);

    const pendingPayouts = await prisma.payment.aggregate({
      where: { booking: { workerId: userId }, status: "HELD" },
      _sum: { workerPayout: true },
    });

    const monthlyTrend = await Promise.all(
      Array.from({ length: 6 }, (_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        return prisma.payment
          .aggregate({
            where: {
              booking: { workerId: userId },
              status: "RELEASED",
              createdAt: { gte: start, lte: end },
            },
            _sum: { workerPayout: true },
          })
          .then((result) => ({
            month: start.toLocaleString("default", {
              month: "short",
              year: "numeric",
            }),
            earnings: result._sum.workerPayout || 0,
          }));
      }),
    );

    const recentReviews = await prisma.review.findMany({
      where: { receiverId: userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        giver: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
        booking: {
          select: { title: true, category: { select: { name: true } } },
        },
      },
    });

    const unreadMessages = await prisma.message.count({
      where: { receiverId: userId, isRead: false },
    });

    const unreadNotifications = await prisma.notification.count({
      where: { userId, isRead: false },
    });

    const profileFields = [
      !!worker.user.avatar,
      !!worker.user.phone,
      !!worker.title,
      !!worker.description,
      worker.portfolio.length > 0,
      worker.certifications.length > 0,
      worker.categories.length > 0,
      worker.availability.length > 0,
      worker.verificationStatus === "VERIFIED",
    ];
    const profileCompletion = Math.round(
      (profileFields.filter(Boolean).length / profileFields.length) * 100,
    );

    return sendResponse(res, {
      data: {
        profile: { ...worker, profileCompletion },
        stats: {
          bookings: {
            total: totalBookings,
            pending: pendingBookings,
            active: activeBookings,
            completed: completedBookings,
            cancelled: cancelledBookings,
            disputed: disputedBookings,
          },
          earnings: {
            allTime: worker.totalEarnings,
            thisMonth: thisMonthPayments._sum.workerPayout || 0,
            lastMonth: lastMonthPayments._sum.workerPayout || 0,
            thisYear: thisYearPayments._sum.workerPayout || 0,
            pendingPayout: pendingPayouts._sum.workerPayout || 0,
            currency: worker.currency,
          },
          engagement: {
            avgRating: worker.avgRating,
            totalReviews: worker.totalReviews,
            responseRate: worker.responseRate,
            completedJobs: worker.completedJobs,
            unreadMessages,
            unreadNotifications,
          },
        },
        recentBookings,
        upcomingBookings,
        recentReviews,
        monthlyTrend: monthlyTrend.reverse(),
      },
    });
  } catch (err) {
    console.error("[Dashboard Error]", err);
    return sendError(res, "Failed to load dashboard");
  }
};

// ─────────────────────────────────────────────
// GET /api/workers/dashboard/notifications
// ─────────────────────────────────────────────
export const getWorkerNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.notification.count({ where: { userId: req.user.id } }),
      prisma.notification.count({
        where: { userId: req.user.id, isRead: false },
      }),
    ]);

    return sendResponse(res, {
      data: {
        notifications,
        unreadCount,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch notifications");
  }
};

// ─────────────────────────────────────────────
// PATCH /api/workers/dashboard/notifications/read-all
// ─────────────────────────────────────────────
export const markAllNotificationsRead = async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true },
    });
    return sendResponse(res, { message: "All notifications marked as read" });
  } catch (err) {
    return sendError(res, "Failed to update notifications");
  }
};

// ─────────────────────────────────────────────
// GET /api/workers/dashboard/earnings
// ─────────────────────────────────────────────
export const getWorkerEarnings = async (req, res) => {
  try {
    const { from, to, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const dateFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const where = {
      booking: { workerId: req.user.id },
      status: "RELEASED",
      ...(Object.keys(dateFilter).length && { createdAt: dateFilter }),
    };

    const [payments, total, aggregate] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
        include: {
          booking: {
            select: {
              title: true,
              scheduledAt: true,
              category: { select: { name: true } },
              hirer: {
                select: { firstName: true, lastName: true, avatar: true },
              },
            },
          },
        },
      }),
      prisma.payment.count({ where }),
      prisma.payment.aggregate({
        where,
        _sum: { workerPayout: true, amount: true, platformFee: true },
      }),
    ]);

    return sendResponse(res, {
      data: {
        payments,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        summary: {
          totalEarned: aggregate._sum.workerPayout || 0,
          totalJobValue: aggregate._sum.amount || 0,
          totalFees: aggregate._sum.platformFee || 0,
        },
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch earnings");
  }
};

// ─────────────────────────────────────────────
// GET /api/workers/dashboard/reviews
// Protected — returns reviews for the logged-in worker
// RENAMED from getWorkerReviews → getMyReviews to avoid
// collision with the same-named public function in review.controller.js
// ─────────────────────────────────────────────
// GET /api/workers/dashboard/reviews
// Worker sees reviews they RECEIVED in their dashboard
export const getMyReviews = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reviews, total, stats] = await Promise.all([
      prisma.review.findMany({
        where: { receiverId: req.user.id },
        orderBy: { createdAt: "desc" },
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
    return sendError(res, "Failed to fetch reviews");
  }
};
