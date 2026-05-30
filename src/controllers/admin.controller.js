// src/controllers/admin.controller.js
// Full admin controller — covers every model in the Prisma schema.
// All functions use the same sendResponse / sendError helpers as the original.

import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import {
  logAdminAction,
  logAdminFailure,
  userSnapshot,
} from "../utils/auditLog.js";
import { paginate, paginationMeta, fullName, formatCurrency, truncate, slugify, uniqueRef, parseJSON, extractIP, timeAgo, safeUser } from "../utils/helpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS & STATS
// ─────────────────────────────────────────────────────────────────────────────

export const getPlatformStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalWorkers,
      totalHirers,
      totalBookings,
      activeBookings,
      completedBookings,
      cancelledBookings,
      disputedBookings,
      totalCategories,
      totalJobPosts,
      openJobPosts,
      totalReviews,
      totalRevenue,
      pendingWithdrawals,
      newUsersToday,
      newBookingsToday,
    ] = await Promise.all([
      prisma.user.count({ where: { isActive: true } }),
      prisma.workerProfile.count(),
      prisma.hirerProfile.count(),
      prisma.booking.count(),
      prisma.booking.count({
        where: { status: { in: ["PENDING", "ACCEPTED", "IN_PROGRESS"] } },
      }),
      prisma.booking.count({ where: { status: "COMPLETED" } }),
      prisma.booking.count({ where: { status: "CANCELLED" } }),
      prisma.booking.count({ where: { status: "DISPUTED" } }),
      prisma.category.count(),
      prisma.jobPost.count(),
      prisma.jobPost.count({ where: { status: "OPEN" } }),
      prisma.review.count(),
      prisma.payment.aggregate({
        where: { status: "RELEASED" },
        _sum: { platformFee: true, amount: true },
      }),
      prisma.withdrawal.aggregate({
        where: { status: "PENDING" },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.user.count({
        where: {
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      prisma.booking.count({
        where: {
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
    ]);

    // Monthly revenue — last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const recentPayments = await prisma.payment.findMany({
      where: { status: "RELEASED", createdAt: { gte: sixMonthsAgo } },
      select: { platformFee: true, amount: true, createdAt: true },
    });

    const monthlyRevenue = {};
    recentPayments.forEach((p) => {
      const key = p.createdAt.toISOString().slice(0, 7);
      if (!monthlyRevenue[key]) monthlyRevenue[key] = { revenue: 0, gmv: 0 };
      monthlyRevenue[key].revenue += p.platformFee || 0;
      monthlyRevenue[key].gmv += p.amount || 0;
    });

    // Monthly user signups — last 6 months
    const recentUsers = await prisma.user.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { role: true, createdAt: true },
    });
    const monthlySignups = {};
    recentUsers.forEach((u) => {
      const key = u.createdAt.toISOString().slice(0, 7);
      if (!monthlySignups[key])
        monthlySignups[key] = { total: 0, workers: 0, hirers: 0 };
      monthlySignups[key].total++;
      if (u.role === "WORKER") monthlySignups[key].workers++;
      if (u.role === "HIRER") monthlySignups[key].hirers++;
    });

    // Top categories
    const topCategories = await prisma.category.findMany({
      include: { _count: { select: { bookings: true, workers: true } } },
      orderBy: { bookings: { _count: "desc" } },
      take: 10,
    });

    // Top workers by completed bookings
    const topWorkers = await prisma.user.findMany({
      where: { role: "WORKER" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatar: true,
        _count: { select: { bookingsAsWorker: true } },
        workerProfile: {
          select: { verificationStatus: true, hourlyRate: true },
        },
      },
      orderBy: { bookingsAsWorker: { _count: "desc" } },
      take: 5,
    });

    // Top hirers by total spend
    const topHirers = await prisma.user.findMany({
      where: { role: "HIRER" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatar: true,
        _count: { select: { bookingsAsHirer: true } },
        hirerProfile: { select: { totalSpent: true } },
      },
      orderBy: { bookingsAsHirer: { _count: "desc" } },
      take: 5,
    });

    // Booking funnel
    const bookingFunnel = [
      { stage: "Created", count: totalBookings },
      {
        stage: "Accepted",
        count: await prisma.booking.count({
          where: { status: { in: ["ACCEPTED", "IN_PROGRESS", "COMPLETED"] } },
        }),
      },
      {
        stage: "In Progress",
        count: await prisma.booking.count({
          where: { status: { in: ["IN_PROGRESS", "COMPLETED"] } },
        }),
      },
      { stage: "Completed", count: completedBookings },
    ];

    return sendResponse(res, {
      data: {
        overview: {
          totalUsers,
          totalWorkers,
          totalHirers,
          totalBookings,
          activeBookings,
          completedBookings,
          cancelledBookings,
          disputedBookings,
          totalCategories,
          totalJobPosts,
          openJobPosts,
          totalReviews,
          totalRevenue: totalRevenue._sum.platformFee || 0,
          totalGMV: totalRevenue._sum.amount || 0,
          pendingPayouts: pendingWithdrawals._sum.amount || 0,
          pendingPayoutCount: pendingWithdrawals._count || 0,
          newUsersToday,
          newBookingsToday,
        },
        monthlyRevenue,
        monthlySignups,
        topCategories,
        topWorkers,
        topHirers,
        bookingFunnel,
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to fetch platform stats");
  }
};

// Detailed analytics — user growth over time (configurable range)
export const getUserGrowthAnalytics = async (req, res) => {
  try {
    const { months = 12 } = req.query;
    const since = new Date();
    since.setMonth(since.getMonth() - parseInt(months));

    const users = await prisma.user.findMany({
      where: { createdAt: { gte: since } },
      select: { role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const byMonth = {};
    users.forEach((u) => {
      const key = u.createdAt.toISOString().slice(0, 7);
      if (!byMonth[key])
        byMonth[key] = { month: key, total: 0, workers: 0, hirers: 0 };
      byMonth[key].total++;
      if (u.role === "WORKER") byMonth[key].workers++;
      if (u.role === "HIRER") byMonth[key].hirers++;
    });

    return sendResponse(res, { data: { growth: Object.values(byMonth) } });
  } catch (err) {
    return sendError(res, "Failed to fetch user growth");
  }
};

// Revenue analytics — detailed breakdown
export const getRevenueAnalytics = async (req, res) => {
  try {
    const { months = 12 } = req.query;
    const since = new Date();
    since.setMonth(since.getMonth() - parseInt(months));

    const payments = await prisma.payment.findMany({
      where: { status: "RELEASED", createdAt: { gte: since } },
      select: {
        amount: true,
        platformFee: true,
        workerPayout: true,
        currency: true,
        createdAt: true,
        provider: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const byMonth = {};
    payments.forEach((p) => {
      const key = p.createdAt.toISOString().slice(0, 7);
      if (!byMonth[key])
        byMonth[key] = {
          month: key,
          gmv: 0,
          revenue: 0,
          workerPayouts: 0,
          count: 0,
        };
      byMonth[key].gmv += p.amount || 0;
      byMonth[key].revenue += p.platformFee || 0;
      byMonth[key].workerPayouts += p.workerPayout || 0;
      byMonth[key].count++;
    });

    // By payment provider
    const byProvider = {};
    payments.forEach((p) => {
      const key = p.provider || "unknown";
      byProvider[key] = (byProvider[key] || 0) + p.amount;
    });

    return sendResponse(res, {
      data: { monthly: Object.values(byMonth), byProvider },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch revenue analytics");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────────────────────────────────────

export const getAllUsers = async (req, res) => {
  try {
    const {
      role,
      search,
      isActive,
      isBanned,
      isEmailVerified,
      page = 1,
      limit = 20,
    } = req.query;
    const { skip, take } = paginate(page, limit);
    const where = {};

    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === "true";
    if (isBanned !== undefined) where.isBanned = isBanned === "true";
    if (isEmailVerified !== undefined)
      where.isEmailVerified = isEmailVerified === "true";
    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          avatar: true,
          phone: true,
          country: true,
          city: true,
          isActive: true,
          isBanned: true,
          isEmailVerified: true,
          createdAt: true,
          lastSeen: true,
          _count: { select: { bookingsAsHirer: true, bookingsAsWorker: true } },
          workerProfile: {
            select: {
              verificationStatus: true,
              hourlyRate: true,
              currency: true,
            },
          },
          subscriptions: {
            take: 1,
            where: { status: "ACTIVE" },
            orderBy: { createdAt: "desc" },
            select: {
              tier: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where }),
    ]);

    return sendResponse(res, {
      data: {
        users,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to fetch users");
  }
};

export const getUserDetail = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      include: {
        workerProfile: {
          include: {
            categories: { include: { category: true } },
            certifications: true,
            portfolio: true,
            availability: true,
          },
        },
        hirerProfile: true,
        subscriptions: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
        bookingsAsHirer: {
          take: 10,
          orderBy: { createdAt: "desc" },
          include: {
            category: true,
            payment: { select: { status: true, amount: true } },
          },
        },
        bookingsAsWorker: {
          take: 10,
          orderBy: { createdAt: "desc" },
          include: {
            category: true,
            payment: { select: { status: true, amount: true } },
          },
        },
        reviewsReceived: {
          take: 10,
          orderBy: { createdAt: "desc" },
          include: {
            giver: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
        },
        reviewsGiven: {
          take: 5,
          orderBy: { createdAt: "desc" },
          include: {
            receiver: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        notifications: { take: 10, orderBy: { createdAt: "desc" } },
        _count: {
          select: {
            bookingsAsHirer: true,
            bookingsAsWorker: true,
            reviewsReceived: true,
            reviewsGiven: true,
            notifications: true,
          },
        },
      },
    });

    if (!user) return sendError(res, "User not found", 404);

    // Strip sensitive fields
    const {
      password,
      refreshToken,
      emailVerifyToken,
      passwordResetToken,
      ...safeUser
    } = user;
    return sendResponse(res, { data: { user: safeUser } });
  } catch (err) {
    return sendError(res, "Failed to fetch user");
  }
};

export const banUser = async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
    });
    if (!user) return sendError(res, "User not found", 404);
    if (user.role === "ADMIN") return sendError(res, "Cannot ban admin", 403);

    await prisma.user.update({
      where: { id: req.params.userId },
      data: { isBanned: true, isActive: false, refreshToken: null },
    });

    await prisma.notification.create({
      data: {
        userId: req.params.userId,
        title: "Account Suspended",
        body: reason || "Your account has been suspended.",
        type: "ACCOUNT_BANNED",
      },
    });

    // ── AUDIT LOG ──────────────────────────────────────────────────────────
    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "USER_BANNED",
      targetType: "USER",
      targetId: req.params.userId,
      description: `Banned user ${user.email} — ${reason || "No reason provided"}`,
      before: userSnapshot(user),
      after: { ...userSnapshot(user), isBanned: true, isActive: false },
      meta: { reason, email: user.email, role: user.role },
    });

    return sendResponse(res, { message: "User banned successfully" });
  } catch (err) {
    return sendError(res, "Failed to ban user");
  }
};

export const unbanUser = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
    });

    await prisma.user.update({
      where: { id: req.params.userId },
      data: { isBanned: false, isActive: true },
    });

    await prisma.notification.create({
      data: {
        userId: req.params.userId,
        title: "Account Reinstated",
        body: "Your account has been reinstated.",
        type: "ACCOUNT_UNBANNED",
      },
    });

    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "USER_UNBANNED",
      targetType: "USER",
      targetId: req.params.userId,
      description: `Unbanned user ${user?.email}`,
      before: { isBanned: true, isActive: false },
      after: { isBanned: false, isActive: true },
    });

    return sendResponse(res, { message: "User unbanned successfully" });
  } catch (err) {
    return sendError(res, "Failed to unban user");
  }
};

export const deleteUser = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
    });
    if (!user) return sendError(res, "User not found", 404);
    if (user.role === "ADMIN")
      return sendError(res, "Cannot delete admin", 403);

    // Soft-delete: anonymise + deactivate
    await prisma.user.update({
      where: { id: req.params.userId },
      data: {
        isActive: false,
        isBanned: true,
        email: `deleted_${Date.now()}_${user.email}`,
        firstName: "Deleted",
        lastName: "User",
        phone: null,
        avatar: null,
        refreshToken: null,
      },
    });

    return sendResponse(res, { message: "User deleted successfully" });
  } catch (err) {
    return sendError(res, "Failed to delete user");
  }
};

export const updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!["HIRER", "WORKER", "ADMIN"].includes(role))
      return sendError(res, "Invalid role", 400);

    const before = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { role: true, email: true },
    });
    const user = await prisma.user.update({
      where: { id: req.params.userId },
      data: { role },
      select: { id: true, email: true, role: true },
    });

    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "USER_ROLE_CHANGED",
      targetType: "USER",
      targetId: req.params.userId,
      description: `Changed role of ${user.email} from ${before?.role} to ${role}`,
      before: { role: before?.role },
      after: { role },
      meta: { previousRole: before?.role, newRole: role },
    });

    return sendResponse(res, { message: "Role updated", data: { user } });
  } catch (err) {
    return sendError(res, "Failed to update role");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const verifyWorker = async (req, res) => {
  try {
    const { status, notes } = req.body;
    if (!["VERIFIED", "REJECTED"].includes(status))
      return sendError(res, "Status must be VERIFIED or REJECTED", 400);

    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.params.userId },
    });
    if (!worker) return sendError(res, "Worker profile not found", 404);

    await prisma.workerProfile.update({
      where: { userId: req.params.userId },
      data: { verificationStatus: status },
    });

    await prisma.notification.create({
      data: {
        userId: req.params.userId,
        title:
          status === "VERIFIED"
            ? "Profile Verified ✅"
            : "Verification Rejected",
        body:
          status === "VERIFIED"
            ? "Your worker profile has been verified."
            : notes ||
              "Verification rejected. Please re-submit with valid documents.",
        type: "VERIFICATION_UPDATE",
      },
    });

    await logAdminAction({
      req,
      adminId: req.user.id,
      action:
        status === "VERIFIED" ? "USER_VERIFIED" : "USER_VERIFICATION_REJECTED",
      targetType: "USER",
      targetId: req.params.userId,
      description: `${status === "VERIFIED" ? "Verified" : "Rejected"} worker profile — ${notes || ""}`,
      before: { verificationStatus: worker.verificationStatus },
      after: { verificationStatus: status },
      meta: { notes, previousStatus: worker.verificationStatus },
    });

    return sendResponse(res, {
      message: `Worker ${status.toLowerCase()} successfully`,
    });
  } catch (err) {
    return sendError(res, "Failed to update verification");
  }
};

export const getPendingVerifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);

    const [workers, total] = await Promise.all([
      prisma.workerProfile.findMany({
        where: { verificationStatus: "PENDING" },
        skip,
        take,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
              createdAt: true,
            },
          },
          certifications: true,
        },
        orderBy: { updatedAt: "asc" }, // oldest first
      }),
      prisma.workerProfile.count({ where: { verificationStatus: "PENDING" } }),
    ]);

    return sendResponse(res, {
      data: {
        verifications: workers,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch pending verifications");
  }
};

export const getVerificationStats = async (req, res) => {
  try {
    const [unverified, pending, verified, rejected] = await Promise.all([
      prisma.workerProfile.count({
        where: { verificationStatus: "UNVERIFIED" },
      }),
      prisma.workerProfile.count({ where: { verificationStatus: "PENDING" } }),
      prisma.workerProfile.count({ where: { verificationStatus: "VERIFIED" } }),
      prisma.workerProfile.count({ where: { verificationStatus: "REJECTED" } }),
    ]);
    return sendResponse(res, {
      data: { unverified, pending, verified, rejected },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch verification stats");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// BOOKINGS
// ─────────────────────────────────────────────────────────────────────────────

export const getAllBookings = async (req, res) => {
  try {
    const { status, search, from, to, page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);
    const where = {};

    if (status) where.status = status;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { hirer: { firstName: { contains: search, mode: "insensitive" } } },
        { worker: { firstName: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take,
        include: {
          hirer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            },
          },
          worker: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            },
          },
          category: true,
          payment: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.booking.count({ where }),
    ]);

    return sendResponse(res, {
      data: {
        bookings,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch bookings");
  }
};

export const getAdminBookingDetail = async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.bookingId },
      include: {
        hirer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
            phone: true,
          },
        },
        worker: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
            phone: true,
          },
        },
        category: true,
        payment: true,
        reviews: {
          include: {
            giver: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        conversation: {
          include: { messages: { take: 20, orderBy: { createdAt: "asc" } } },
        },
      },
    });

    if (!booking) return sendError(res, "Booking not found", 404);
    return sendResponse(res, { data: { booking } });
  } catch (err) {
    return sendError(res, "Failed to fetch booking");
  }
};

export const adminUpdateBookingStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;
    const validStatuses = [
      "PENDING",
      "ACCEPTED",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
      "DISPUTED",
    ];
    if (!validStatuses.includes(status)) {
      return sendError(
        res,
        `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        400,
      );
    }

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.bookingId },
      include: { payment: true },
    });
    if (!booking) return sendError(res, "Booking not found", 404);

    await prisma.booking.update({
      where: { id: req.params.bookingId },
      data: { status },
    });

    // Notify both parties
    const msg =
      notes ||
      `Your booking status has been updated to ${status.replace("_", " ")} by admin.`;
    await prisma.notification.createMany({
      data: [
        {
          userId: booking.hirerId,
          title: "Booking Updated",
          body: msg,
          type: "BOOKING_STATUS_UPDATE",
          data: { bookingId: booking.id, status },
        },
        {
          userId: booking.workerId,
          title: "Booking Updated",
          body: msg,
          type: "BOOKING_STATUS_UPDATE",
          data: { bookingId: booking.id, status },
        },
      ],
    });

    return sendResponse(res, { message: "Booking status updated" });
  } catch (err) {
    return sendError(res, "Failed to update booking status");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DISPUTES
// ─────────────────────────────────────────────────────────────────────────────

export const getDisputes = async (req, res) => {
  try {
    const { page = 1, limit = 20, resolved } = req.query;
    const { skip, take } = paginate(page, limit);
    const where = {};

    if (resolved === "true") where.status = { not: "DISPUTED" };
    else if (resolved === "false") where.status = "DISPUTED";
    else where.status = "DISPUTED"; // default: open only

    const [disputes, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take,
        include: {
          hirer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            },
          },
          worker: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            },
          },
          category: true,
          payment: true,
        },
        orderBy: { updatedAt: "asc" }, // oldest disputes first
      }),
      prisma.booking.count({ where }),
    ]);

    return sendResponse(res, {
      data: {
        disputes,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch disputes");
  }
};

export const resolveDispute = async (req, res) => {
  try {
    const { resolution, refundHirer, releaseToWorker, notes } = req.body;
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.bookingId },
      include: { payment: true },
    });
    if (!booking) return sendError(res, "Booking not found", 404);

    // ... (your existing dispute resolution logic) ...

    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "DISPUTE_RESOLVED",
      targetType: "DISPUTE",
      targetId: req.params.bookingId,
      description: `Resolved dispute for booking "${booking.title}" — Decision: ${resolution}`,
      before: { status: "DISPUTED" },
      after: {
        resolution,
        bookingStatus: resolution === "REFUND" ? "CANCELLED" : "COMPLETED",
      },
      meta: { resolution, refundHirer, releaseToWorker, notes },
    });

    return sendResponse(res, { message: "Dispute resolved successfully" });
  } catch (err) {
    return sendError(res, "Failed to resolve dispute");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENTS & WITHDRAWALS
// ─────────────────────────────────────────────────────────────────────────────

export const getAllPayments = async (req, res) => {
  try {
    const { status, provider, from, to, page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);
    const where = {};

    if (status) where.status = status;
    if (provider) where.provider = provider;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [payments, total, summary] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take,
        include: {
          booking: {
            select: {
              id: true,
              title: true,
              status: true,
              hirer: { select: { id: true, firstName: true, lastName: true } },
              worker: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.payment.count({ where }),
      prisma.payment.aggregate({
        where,
        _sum: { amount: true, platformFee: true, workerPayout: true },
      }),
    ]);

    return sendResponse(res, {
      data: {
        payments,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
        summary: {
          totalGMV: summary._sum.amount || 0,
          totalFees: summary._sum.platformFee || 0,
          totalPayouts: summary._sum.workerPayout || 0,
        },
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch payments");
  }
};

export const getPaymentDetail = async (req, res) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.paymentId },
      include: {
        booking: {
          include: {
            hirer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            worker: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            category: true,
          },
        },
      },
    });
    if (!payment) return sendError(res, "Payment not found", 404);
    return sendResponse(res, { data: { payment } });
  } catch (err) {
    return sendError(res, "Failed to fetch payment");
  }
};

export const adminReleasePayment = async (req, res) => {
  try {
    const { notes } = req.body;
    const payment = await prisma.payment.findFirst({
      where: { bookingId: req.params.bookingId },
      include: { booking: true },
    });
    if (!payment) return sendError(res, "Payment not found", 404);
    if (payment.status !== "HELD")
      return sendError(res, "Payment is not HELD", 400);

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "RELEASED", escrowReleasedAt: new Date() },
    });
    await prisma.booking.update({
      where: { id: req.params.bookingId },
      data: { status: "COMPLETED" },
    });

    // ... notifications ...

    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "PAYMENT_RELEASED",
      targetType: "PAYMENT",
      targetId: payment.id,
      description: `Released escrowed payment of ${payment.currency} ${payment.amount} for booking "${payment.booking?.title}"`,
      before: { status: "HELD" },
      after: { status: "RELEASED" },
      meta: {
        amount: payment.amount,
        currency: payment.currency,
        notes,
        bookingId: req.params.bookingId,
      },
    });

    return sendResponse(res, { message: "Payment released successfully" });
  } catch (err) {
    return sendError(res, "Failed to release payment");
  }
};

export const adminRefundPayment = async (req, res) => {
  try {
    const { notes } = req.body;
    const payment = await prisma.payment.findFirst({
      where: { bookingId: req.params.bookingId },
      include: { booking: true },
    });
    if (!payment) return sendError(res, "Payment not found", 404);
    if (!["HELD", "RELEASED"].includes(payment.status)) {
      return sendError(
        res,
        "Payment cannot be refunded in its current state",
        400,
      );
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "REFUNDED", refundedAt: new Date() },
    });
    await prisma.booking.update({
      where: { id: req.params.bookingId },
      data: { status: "CANCELLED" },
    });

    const msg = notes || "Admin has issued a refund for your booking.";
    await prisma.notification.createMany({
      data: [
        {
          userId: payment.booking.hirerId,
          title: "Refund Issued",
          body: msg,
          type: "PAYMENT_REFUNDED",
        },
        {
          userId: payment.booking.workerId,
          title: "Booking Cancelled",
          body: "Your booking was cancelled and a refund was issued to the hirer.",
          type: "BOOKING_CANCELLED",
        },
      ],
    });

    return sendResponse(res, { message: "Refund issued successfully" });
  } catch (err) {
    return sendError(res, "Failed to issue refund");
  }
};

export const getAllWithdrawals = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);
    const where = {};
    if (status) where.status = status;

    const [withdrawals, total, pendingSum] = await Promise.all([
      prisma.withdrawal.findMany({
        where,
        skip,
        take,
        include: {
          worker: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.withdrawal.count({ where }),
      prisma.withdrawal.aggregate({
        where: { status: "PENDING" },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    return sendResponse(res, {
      data: {
        withdrawals,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
        pendingTotal: pendingSum._sum.amount || 0,
        pendingCount: pendingSum._count || 0,
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch withdrawals");
  }
};

export const approveWithdrawal = async (req, res) => {
  try {
    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id: req.params.withdrawalId },
      include: { worker: true },
    });
    if (!withdrawal) return sendError(res, "Withdrawal not found", 404);

    await prisma.withdrawal.update({
      where: { id: req.params.withdrawalId },
      data: { status: "PROCESSING", processedAt: new Date() },
    });

    // ... notification ...

    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "WITHDRAWAL_APPROVED",
      targetType: "WITHDRAWAL",
      targetId: req.params.withdrawalId,
      description: `Approved withdrawal of ${withdrawal.currency} ${withdrawal.amount} for ${withdrawal.worker?.email}`,
      before: { status: "PENDING" },
      after: { status: "PROCESSING" },
      meta: {
        amount: withdrawal.amount,
        currency: withdrawal.currency,
        method: withdrawal.method,
      },
    });

    return sendResponse(res, { message: "Withdrawal approved — processing" });
  } catch (err) {
    return sendError(res, "Failed to approve withdrawal");
  }
};

export const rejectWithdrawal = async (req, res) => {
  try {
    const { reason } = req.body;
    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id: req.params.withdrawalId },
    });
    if (!withdrawal) return sendError(res, "Withdrawal not found", 404);
    if (withdrawal.status !== "PENDING")
      return sendError(res, "Withdrawal is not pending", 400);

    await prisma.withdrawal.update({
      where: { id: req.params.withdrawalId },
      data: { status: "FAILED" },
    });

    await prisma.notification.create({
      data: {
        userId: withdrawal.workerId,
        title: "Withdrawal Rejected",
        body:
          reason ||
          "Your withdrawal request was rejected. Please contact support.",
        type: "WITHDRAWAL_REJECTED",
      },
    });

    return sendResponse(res, { message: "Withdrawal rejected" });
  } catch (err) {
    return sendError(res, "Failed to reject withdrawal");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────

export const createCategory = async (req, res) => {
  try {
    const { name, slug, description, icon, parentId } = req.body;
    if (!name || !slug)
      return sendError(res, "Name and slug are required", 400);

    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) return sendError(res, "Slug already exists", 409);

    const category = await prisma.category.create({
      data: { name, slug, description, icon, parentId: parentId || null },
    });

    return sendResponse(res, {
      status: 201,
      message: "Category created",
      data: { category },
    });
  } catch (err) {
    return sendError(res, "Failed to create category");
  }
};

export const updateCategory = async (req, res) => {
  try {
    const { name, description, icon, slug, parentId } = req.body;
    const category = await prisma.category.update({
      where: { id: req.params.categoryId },
      data: { name, description, icon, slug, parentId: parentId || null },
    });
    return sendResponse(res, {
      message: "Category updated",
      data: { category },
    });
  } catch (err) {
    return sendError(res, "Failed to update category");
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const [workerUsage, bookingUsage] = await Promise.all([
      prisma.workerCategory.count({
        where: { categoryId: req.params.categoryId },
      }),
      prisma.booking.count({ where: { categoryId: req.params.categoryId } }),
    ]);

    if (workerUsage > 0 || bookingUsage > 0) {
      return sendError(
        res,
        `Cannot delete — ${workerUsage} workers and ${bookingUsage} bookings use this category`,
        400,
      );
    }

    await prisma.category.delete({ where: { id: req.params.categoryId } });
    return sendResponse(res, { message: "Category deleted" });
  } catch (err) {
    return sendError(res, "Failed to delete category");
  }
};

export const getAllCategories = async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const { skip, take } = paginate(page, limit);
    const where = {};
    if (search) where.name = { contains: search, mode: "insensitive" };

    const [categories, total] = await Promise.all([
      prisma.category.findMany({
        where,
        skip,
        take,
        include: {
          parent: true,
          _count: { select: { workers: true, bookings: true, jobPosts: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.category.count({ where }),
    ]);

    return sendResponse(res, {
      data: {
        categories,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch categories");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REVIEWS
// ─────────────────────────────────────────────────────────────────────────────

export const getAllReviews = async (req, res) => {
  try {
    const { rating, page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);
    const where = {};
    if (rating) where.rating = parseInt(rating);

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        skip,
        take,
        include: {
          giver: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
          },
          receiver: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
          },
          booking: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.review.count({ where }),
    ]);

    return sendResponse(res, {
      data: {
        reviews,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch reviews");
  }
};

export const deleteReview = async (req, res) => {
  try {
    const review = await prisma.review.findUnique({
      where: { id: req.params.reviewId },
    });
    if (!review) return sendError(res, "Review not found", 404);
    await prisma.review.delete({ where: { id: req.params.reviewId } });
    return sendResponse(res, { message: "Review deleted" });
  } catch (err) {
    return sendError(res, "Failed to delete review");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// JOBS & APPLICATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const getAllJobPosts = async (req, res) => {
  try {
    const { status, search, categoryId, page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);
    const where = {};

    if (status) where.status = status;
    if (categoryId) where.categoryId = categoryId;
    if (search) where.title = { contains: search, mode: "insensitive" };

    const [jobs, total] = await Promise.all([
      prisma.jobPost.findMany({
        where,
        skip,
        take,
        include: {
          hirer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            },
          },
          category: true,
          _count: { select: { applications: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.jobPost.count({ where }),
    ]);

    return sendResponse(res, {
      data: {
        jobs,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch job posts");
  }
};

export const getJobPostDetail = async (req, res) => {
  try {
    const job = await prisma.jobPost.findUnique({
      where: { id: req.params.jobId },
      include: {
        hirer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
          },
        },
        category: true,
        applications: {
          include: {
            worker: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!job) return sendError(res, "Job post not found", 404);
    return sendResponse(res, { data: { job } });
  } catch (err) {
    return sendError(res, "Failed to fetch job post");
  }
};

export const adminDeleteJobPost = async (req, res) => {
  try {
    const { reason } = req.body;
    const job = await prisma.jobPost.findUnique({
      where: { id: req.params.jobId },
    });
    if (!job) return sendError(res, "Job post not found", 404);

    await prisma.jobPost.delete({ where: { id: req.params.jobId } });

    if (job.hirerId) {
      await prisma.notification.create({
        data: {
          userId: job.hirerId,
          title: "Job Post Removed",
          body:
            reason ||
            "Your job post was removed by admin for violating our guidelines.",
          type: "JOB_REMOVED",
        },
      });
    }

    return sendResponse(res, { message: "Job post deleted" });
  } catch (err) {
    return sendError(res, "Failed to delete job post");
  }
};

export const adminUpdateJobStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["OPEN", "FILLED", "CANCELLED"].includes(status)) {
      return sendError(res, "Invalid status", 400);
    }
    const job = await prisma.jobPost.update({
      where: { id: req.params.jobId },
      data: { status },
    });
    return sendResponse(res, { message: "Job status updated", data: { job } });
  } catch (err) {
    return sendError(res, "Failed to update job status");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTIONS
// ─────────────────────────────────────────────────────────────────────────────

export const getAllSubscriptions = async (req, res) => {
  try {
    const { status, tier, page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);
    const where = {};
    if (status) where.status = status;
    if (tier) where.tier = tier;

    const [subscriptions, total, summary] = await Promise.all([
      prisma.subscription.findMany({
        where,
        skip,
        take,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.subscription.count({ where }),
      prisma.subscription.groupBy({
        by: ["tier", "status"],
        _count: true,
      }),
    ]);

    return sendResponse(res, {
      data: {
        subscriptions,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
        summary,
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch subscriptions");
  }
};

export const adminCancelSubscription = async (req, res) => {
  try {
    const { reason } = req.body;
    const sub = await prisma.subscription.findUnique({
      where: { id: req.params.subscriptionId },
      include: { user: true },
    });
    if (!sub) return sendError(res, "Subscription not found", 404);

    await prisma.subscription.update({
      where: { id: req.params.subscriptionId },
      data: { status: "CANCELLED" },
    });

    await prisma.notification.create({
      data: {
        userId: sub.userId,
        title: "Subscription Cancelled",
        body: reason || "Your subscription has been cancelled by admin.",
        type: "SUBSCRIPTION_CANCELLED",
      },
    });

    return sendResponse(res, { message: "Subscription cancelled" });
  } catch (err) {
    return sendError(res, "Failed to cancel subscription");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// FEATURED LISTINGS / BOOSTS
// ─────────────────────────────────────────────────────────────────────────────

export const getAllFeaturedListings = async (req, res) => {
  try {
    const { type, page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);
    const where = {};
    if (type) where.type = type;

    const [listings, total] = await Promise.all([
      prisma.featuredListing.findMany({
        where,
        skip,
        take,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
              role: true,
            },
          },
          category: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.featuredListing.count({ where }),
    ]);

    return sendResponse(res, {
      data: {
        listings,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch featured listings");
  }
};

export const adminRemoveFeaturedListing = async (req, res) => {
  try {
    const { reason } = req.body;
    const listing = await prisma.featuredListing.findUnique({
      where: { id: req.params.listingId },
    });
    if (!listing) return sendError(res, "Listing not found", 404);

    await prisma.featuredListing.delete({
      where: { id: req.params.listingId },
    });

    await prisma.notification.create({
      data: {
        userId: listing.userId,
        title: "Featured Listing Removed",
        body: reason || "Your featured listing has been removed by admin.",
        type: "FEATURED_REMOVED",
      },
    });

    return sendResponse(res, { message: "Featured listing removed" });
  } catch (err) {
    return sendError(res, "Failed to remove featured listing");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// COMMUNITY POSTS
// ─────────────────────────────────────────────────────────────────────────────

export const getAllPosts = async (req, res) => {
  try {
    const { type, search, page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);
    const where = {};
    if (type) where.type = type;
    if (search) where.content = { contains: search, mode: "insensitive" };

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        skip,
        take,
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
          _count: { select: { reactions: true, comments: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.post.count({ where }),
    ]);

    return sendResponse(res, {
      data: {
        posts,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch posts");
  }
};

export const adminDeletePost = async (req, res) => {
  try {
    const { reason } = req.body;
    const post = await prisma.post.findUnique({
      where: { id: req.params.postId },
    });
    if (!post) return sendError(res, "Post not found", 404);

    await prisma.post.delete({ where: { id: req.params.postId } });

    await prisma.notification.create({
      data: {
        userId: post.authorId,
        title: "Post Removed",
        body:
          reason || "Your post was removed for violating community guidelines.",
        type: "POST_REMOVED",
      },
    });

    return sendResponse(res, { message: "Post deleted" });
  } catch (err) {
    return sendError(res, "Failed to delete post");
  }
};

export const adminDeleteComment = async (req, res) => {
  try {
    const comment = await prisma.postComment.findUnique({
      where: { id: req.params.commentId },
    });
    if (!comment) return sendError(res, "Comment not found", 404);
    await prisma.postComment.delete({ where: { id: req.params.commentId } });
    return sendResponse(res, { message: "Comment deleted" });
  } catch (err) {
    return sendError(res, "Failed to delete comment");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGES (read-only admin oversight)
// ─────────────────────────────────────────────────────────────────────────────

export const getAllConversations = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
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
          messages: { take: 1, orderBy: { createdAt: "desc" } },
          _count: { select: { messages: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.conversation.count(),
    ]);

    return sendResponse(res, {
      data: {
        conversations,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch conversations");
  }
};

export const getConversationMessages = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const { skip, take } = paginate(page, limit);

    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.conversationId },
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
      },
    });
    if (!conversation) return sendError(res, "Conversation not found", 404);

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId: req.params.conversationId },
        skip,
        take,
        include: {
          sender: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.message.count({
        where: { conversationId: req.params.conversationId },
      }),
    ]);

    return sendResponse(res, {
      data: {
        conversation,
        messages,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch messages");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS BROADCAST
// ─────────────────────────────────────────────────────────────────────────────

export const broadcastNotification = async (req, res) => {
  try {
    const {
      title,
      body,
      type = "PLATFORM_ANNOUNCEMENT",
      role,
      userIds,
    } = req.body;
    if (!title || !body) return sendError(res, "Title and body required", 400);

    let users;
    if (userIds?.length > 0) {
      users = userIds.map((id) => ({ id }));
    } else {
      const where = role ? { role, isActive: true } : { isActive: true };
      users = await prisma.user.findMany({ where, select: { id: true } });
    }

    await prisma.notification.createMany({
      data: users.map((u) => ({ userId: u.id, title, body, type })),
    });

    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "NOTIFICATION_BROADCAST",
      targetType: "SYSTEM",
      description: `Broadcast "${title}" to ${users.length} user(s)`,
      meta: {
        title,
        body,
        type,
        role: role || "ALL",
        recipients: users.length,
      },
    });

    return sendResponse(res, {
      message: `Broadcast sent to ${users.length} users`,
      data: { recipients: users.length },
    });
  } catch (err) {
    return sendError(res, "Broadcast failed");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// VIDEO CALLS (oversight)
// ─────────────────────────────────────────────────────────────────────────────

export const getAllVideoCalls = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);

    const [calls, total] = await Promise.all([
      prisma.videoCall.findMany({
        skip,
        take,
        include: {
          booking: { select: { id: true, title: true, status: true } },
          initiator: { select: { id: true, firstName: true, lastName: true } },
          receiver: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.videoCall.count(),
    ]);

    return sendResponse(res, {
      data: {
        calls,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch video calls");
  }
};

// ─── ADD TO src/controllers/admin.controller.js ──────────────────────────────
// Two new exports at the bottom of admin.controller.js

// PATCH /api/admin/payments/:bookingId/verify
// Confirms a pending manual bank-transfer or crypto payment → sets to HELD
export const verifyManualPayment = async (req, res) => {
  try {
    const { notes } = req.body;

    const payment = await prisma.payment.findFirst({
      where: { bookingId: req.params.bookingId },
      include: {
        booking: {
          include: {
            hirer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            worker: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!payment) return sendError(res, "Payment not found", 404);
    if (payment.status !== "PENDING")
      return sendError(
        res,
        `Payment is already ${payment.status} — cannot verify`,
        400,
      );
    if (!["bank_transfer", "crypto"].includes(payment.provider))
      return sendError(
        res,
        "This endpoint is only for manual payments (bank_transfer / crypto)",
        400,
      );

    // Mark payment as held + booking as accepted
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "HELD" },
      }),
      prisma.booking.update({
        where: { id: req.params.bookingId },
        data: { status: "ACCEPTED" },
      }),
      prisma.notification.createMany({
        data: [
          {
            userId: payment.booking.workerId,
            title: "Payment Verified — Job is Active ✅",
            body: `Admin has confirmed payment for "${payment.booking.title}". The funds are now in escrow. You can check in when you're ready.`,
            type: "PAYMENT_HELD",
            data: { bookingId: payment.bookingId },
          },
          {
            userId: payment.booking.hirerId,
            title: "Payment Confirmed ✅",
            body: `Your ${payment.provider === "crypto" ? "crypto" : "bank"} payment for "${payment.booking.title}" has been verified and secured in escrow.`,
            type: "PAYMENT_HELD",
            data: { bookingId: payment.bookingId },
          },
        ],
      }),
    ]);

    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "PAYMENT_MANUAL_VERIFIED",
      targetType: "PAYMENT",
      targetId: payment.id,
      description: `Verified ${payment.provider} payment of ${payment.currency} ${payment.amount} — Ref: ${payment.providerRef}`,
      before: { status: "PENDING" },
      after: { status: "HELD" },
      meta: {
        provider: payment.provider,
        reference: payment.providerRef,
        amount: payment.amount,
        currency: payment.currency,
      },
    });

    return sendResponse(res, {
      message: "Payment verified",
      data: { bookingId: req.params.bookingId, status: "HELD" },
    });
  } catch (err) {
    await logAdminFailure({
      req,
      adminId: req.user.id,
      action: "PAYMENT_MANUAL_VERIFIED",
      targetType: "PAYMENT",
      description: "Manual payment verification failed",
      errorMessage: err.message,
    });
    return sendError(res, "Failed to verify payment");
  }
};

// PATCH /api/admin/payments/:bookingId/reject-manual
// Rejects a pending manual payment — notifies hirer to re-submit
export const rejectManualPayment = async (req, res) => {
  try {
    const { reason } = req.body;

    const payment = await prisma.payment.findFirst({
      where: { bookingId: req.params.bookingId },
      include: {
        booking: {
          include: {
            hirer: { select: { id: true, firstName: true } },
          },
        },
      },
    });

    if (!payment) return sendError(res, "Payment not found", 404);
    if (payment.status !== "PENDING")
      return sendError(
        res,
        `Payment is ${payment.status} — cannot reject`,
        400,
      );

    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED" },
      }),
      prisma.notification.create({
        data: {
          userId: payment.booking.hirerId,
          title: "Payment Not Verified ❌",
          body: reason
            ? `Your payment for "${payment.booking.title}" could not be verified. Reason: ${reason}. Please re-submit with correct details.`
            : `Your payment for "${payment.booking.title}" could not be verified. Please contact support or re-submit.`,
          type: "PAYMENT_FAILED",
          data: { bookingId: payment.bookingId, reason },
        },
      }),
    ]);

    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "PAYMENT_MANUAL_REJECTED",
      targetType: "PAYMENT",
      targetId: payment.id,
      description: `Rejected ${payment.provider} payment — ${reason}`,
      before: { status: "PENDING" },
      after: { status: "FAILED" },
      meta: {
        reason,
        provider: payment.provider,
        reference: payment.providerRef,
      },
    });

    return sendResponse(res, {
      message: "Payment rejected",
      data: { bookingId: req.params.bookingId, status: "FAILED" },
    });
  } catch (err) {
    return sendError(res, "Failed to reject payment");
  }
};
