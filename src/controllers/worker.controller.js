// src/controllers/worker.controller.js
import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { notifyProfileViewed } from "../services/notification.service.js";
import { sendProfileViewedEmail } from "../services/email.service.js";
import {
  paginate,
  paginationMeta,
  fullName,
  formatCurrency,
  truncate,
  slugify,
  uniqueRef,
  parseJSON,
  extractIP,
  timeAgo,
} from "../utils/helpers.js";

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
    const { skip, take } = paginate(page, limit);
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
        take,
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
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Search failed");
  }
};

export const getWorkerProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    const worker = await prisma.workerProfile.findUnique({
      where: { userId },
      select: {
        // ── All scalar fields ──────────────────────────────────────────────
        id: true,
        userId: true,
        title: true,
        description: true,
        hourlyRate: true,
        dailyRate: true,
        weeklyRate: true,
        monthlyRate: true,
        yearlyRate: true,
        customRate: true,
        customRateLabel: true,
        pricingNote: true,
        currency: true,
        profileCurrency: true,
        yearsExperience: true,
        serviceRadius: true,
        isAvailable: true,
        verificationStatus: true,
        idDocument: true,
        videoIntroUrl: true,
        backgroundCheck: true,
        totalEarnings: true,
        completedJobs: true,
        responseRate: true,
        avgRating: true,
        totalReviews: true,
        createdAt: true,
        updatedAt: true,
        // ── Relations ──────────────────────────────────────────────────────
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            city: true,
            country: true,
            state: true,
            email: true,
            phone: true,
            gender: true,
            language: true,
            createdAt: true,
            profileVisible: true,
            showPhone: true,
            showLocation: true,
            showEmail: true,
            showGender: true,
          },
        },
        categories: {
          include: {
            category: true,
          },
        },
        portfolio: true,
        certifications: true,
        availability: true,
      },
    });

    if (!worker) return sendError(res, "Worker not found", 404);
    if (!worker.user.profileVisible)
      return sendError(res, "This profile is private", 403);

    const isOwnProfile = req.user?.id === userId;

    // ── Privacy-filtered user ──────────────────────────────────────────────
    const filteredUser = {
      id: worker.user.id,
      firstName: worker.user.firstName,
      lastName: worker.user.lastName,
      avatar: worker.user.avatar,
      language: worker.user.language,
      createdAt: worker.user.createdAt,
      city: isOwnProfile || worker.user.showLocation ? worker.user.city : null,
      country:
        isOwnProfile || worker.user.showLocation ? worker.user.country : null,
      state:
        isOwnProfile || worker.user.showLocation ? worker.user.state : null,
      phone: isOwnProfile || worker.user.showPhone ? worker.user.phone : null,
      email: isOwnProfile || worker.user.showEmail ? worker.user.email : null,
      gender:
        isOwnProfile || worker.user.showGender ? worker.user.gender : null,
    };

    // ── Notify viewer (fire-and-forget) ──────────────────────────────────
    if (req.user && !isOwnProfile) {
      prisma.user
        .findUnique({
          where: { id: req.user.id },
          select: { firstName: true, lastName: true, role: true },
        })
        .then((viewer) => {
          if (!viewer) return;
          const viewerName = `${viewer.firstName} ${viewer.lastName}`;
          notifyProfileViewed(userId, viewerName, viewer.role).catch(() => {});
          if (worker.user.email) {
            sendProfileViewedEmail({
              to: worker.user.email,
              ownerName: worker.user.firstName,
              viewerName,
              viewerRole: viewer.role,
            }).catch(() => {});
          }
        })
        .catch(() => {});
    }

    return sendResponse(res, {
      data: {
        worker: {
          ...worker,
          user: filteredUser,
        },
      },
    });
  } catch (err) {
    console.error("getWorkerProfile error:", err);
    return sendError(res, "Failed to fetch worker");
  }
};

export const updateWorkerProfile = async (req, res) => {
  try {
    if (req.user.role !== "WORKER") return sendError(res, "Forbidden", 403);

    const {
      title,
      description,
      hourlyRate,
      dailyRate,
      weeklyRate,
      monthlyRate,
      yearlyRate,
      customRate,
      customRateLabel,
      pricingNote,
      currency,
      profileCurrency,
      yearsExperience,
      serviceRadius,
      isAvailable,
    } = req.body;

    // Ensure the worker profile exists
    const existing = await prisma.workerProfile.findUnique({
      where: { userId: req.user.id },
    });
    if (!existing) return sendError(res, "Worker profile not found", 404);

    // Build update object
    const data = {};
    if (title !== undefined) data.title = title.trim();
    if (description !== undefined)
      data.description = description?.trim() || null;
    if (hourlyRate !== undefined) data.hourlyRate = parseFloat(hourlyRate) || 0;
    if (dailyRate !== undefined)
      data.dailyRate = dailyRate ? parseFloat(dailyRate) : null;
    if (weeklyRate !== undefined)
      data.weeklyRate = weeklyRate ? parseFloat(weeklyRate) : null;
    if (monthlyRate !== undefined)
      data.monthlyRate = monthlyRate ? parseFloat(monthlyRate) : null;
    if (yearlyRate !== undefined)
      data.yearlyRate = yearlyRate ? parseFloat(yearlyRate) : null;
    if (customRate !== undefined)
      data.customRate = customRate ? parseFloat(customRate) : null;
    if (customRateLabel !== undefined)
      data.customRateLabel = customRateLabel?.trim() || null;
    if (pricingNote !== undefined)
      data.pricingNote = pricingNote?.trim() || null;
    if (currency !== undefined) data.currency = currency;
    if (profileCurrency !== undefined) data.profileCurrency = profileCurrency;
    if (yearsExperience !== undefined)
      data.yearsExperience = parseInt(yearsExperience) || 0;
    if (serviceRadius !== undefined)
      data.serviceRadius = parseInt(serviceRadius) || 25;
    if (isAvailable !== undefined) data.isAvailable = Boolean(isAvailable);

    const worker = await prisma.workerProfile.update({
      where: { userId: req.user.id },
      data,
    });

    return sendResponse(res, {
      message: "Worker profile updated",
      data: { worker },
    });
  } catch (err) {
    console.error("updateWorkerProfile error:", err);
    return sendError(res, "Failed to update worker profile");
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

export const addPortfolio = async (req, res) => {
  try {
    const { title, description } = req.body;
    const file = req.files?.[0] || req.file;
    if (!file) return sendError(res, "Image required", 400);
    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.user.id },
    });
    if (!worker) return sendError(res, "Worker profile not found", 404);
    const item = await prisma.portfolio.create({
      data: {
        workerProfileId: worker.id,
        title,
        description,
        imageUrl: file.path,
      },
    });
    return sendResponse(res, {
      status: 201,
      message: "Portfolio item added",
      data: { item },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to add portfolio");
  }
};

export const addCertification = async (req, res) => {
  try {
    const { name, issuedBy, issueDate, expiryDate } = req.body;
    const file = req.files?.[0] || req.file;
    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.user.id },
    });
    if (!worker) return sendError(res, "Worker profile not found", 404);
    const cert = await prisma.certification.create({
      data: {
        workerProfileId: worker.id,
        name,
        issuedBy,
        issueDate: issueDate ? new Date(issueDate) : null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        documentUrl: file?.path || null,
      },
    });
    return sendResponse(res, { status: 201, data: { cert } });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to add certification");
  }
};

const DAY_MAP = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

export const updateAvailability = async (req, res) => {
  try {
    const { availability } = req.body;
    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.user.id },
    });
    if (!worker) return sendError(res, "Worker profile not found", 404);

    await prisma.availability.deleteMany({
      where: { workerProfileId: worker.id },
    });

    const created = await prisma.availability.createMany({
      data: availability.map((a) => ({
        workerProfileId: worker.id,
        dayOfWeek:
          typeof a.dayOfWeek === "string"
            ? (DAY_MAP[a.dayOfWeek.toUpperCase()] ?? 0)
            : parseInt(a.dayOfWeek),
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
    console.error(err);
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

export const removeCategory = async (req, res) => {
  try {
    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.user.id },
    });
    if (!worker) return sendError(res, "Worker profile not found", 404);
    await prisma.workerCategory.deleteMany({
      where: { workerProfileId: worker.id, categoryId: req.params.categoryId },
    });
    return sendResponse(res, { message: "Category removed" });
  } catch (err) {
    return sendError(res, "Failed to remove category");
  }
};

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
        payments: {
          take: 1,
          orderBy: { createdAt: "desc" },
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

export const getWorkerNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" },
        skip,
        take,
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
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch notifications");
  }
};

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

export const getMyReviews = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const { skip, take } = paginate(page, limit);

    const [reviews, total, stats] = await Promise.all([
      prisma.review.findMany({
        where: { receiverId: req.user.id },
        orderBy: { createdAt: "desc" },
        skip,
        take,
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
        pages: Math.ceil(total / take),
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

export const addVideoIntro = async (req, res) => {
  try {
    if (!req.file) return sendError(res, "Video file required", 400);
    const updated = await prisma.workerProfile.update({
      where: { userId: req.user.id },
      data: { videoIntroUrl: req.file.path },
    });
    return sendResponse(res, {
      message: "Video intro uploaded",
      data: { videoUrl: updated.videoIntroUrl },
    });
  } catch (err) {
    console.error("addVideoIntro error:", err.message);
    return sendError(res, "Failed to upload video intro");
  }
};

export const deleteVideoIntro = async (req, res) => {
  try {
    await prisma.workerProfile.update({
      where: { userId: req.user.id },
      data: { videoIntroUrl: null },
    });
    return sendResponse(res, { message: "Video intro removed" });
  } catch (err) {
    return sendError(res, "Failed to remove video intro");
  }
};

export const getCompletedJobs = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const { skip, take } = paginate(page, limit);
    const workerId = req.user.id;

    const where = {
      workerId,
      status: "COMPLETED",
    };

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take,
        orderBy: { completedAt: "desc" },
        include: {
          hirer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              city: true,
              country: true,
              hirerProfile: {
                select: {
                  companyName: true,
                  avgRating: true,
                  totalHires: true,
                },
              },
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              icon: true,
            },
          },
          payments: {
            select: {
              id: true,
              amount: true,
              workerPayout: true,
              currency: true,
              status: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
          reviews: {
            where: { receiverId: workerId },
            select: {
              id: true,
              rating: true,
              comment: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.booking.count({ where }),
    ]);

    const bookingsWithEarnings = bookings.map((b) => ({
      ...b,
      totalEarned: b.payments
        .filter((p) => p.status === "RELEASED")
        .reduce((sum, p) => sum + (p.workerPayout || 0), 0),
      review: b.reviews.length > 0 ? b.reviews[0] : null,
    }));

    return sendResponse(res, {
      data: {
        bookings: bookingsWithEarnings,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    console.error("getCompletedJobs error:", err);
    return sendError(res, "Failed to fetch completed jobs");
  }
};
