import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

export const getPlatformStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalWorkers,
      totalHirers,
      totalBookings,
      activeBookings,
      completedBookings,
      disputedBookings,
      totalCategories,
      totalRevenue,
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
      prisma.booking.count({ where: { status: "DISPUTED" } }),
      prisma.category.count(),
      prisma.payment.aggregate({
        where: { status: "RELEASED" },
        _sum: { platformFee: true },
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

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const recentPayments = await prisma.payment.findMany({
      where: { status: "RELEASED", createdAt: { gte: sixMonthsAgo } },
      select: { platformFee: true, createdAt: true },
    });

    const monthlyRevenue = {};
    recentPayments.forEach((p) => {
      const key = p.createdAt.toISOString().slice(0, 7);
      monthlyRevenue[key] = (monthlyRevenue[key] || 0) + p.platformFee;
    });

    const topCategories = await prisma.category.findMany({
      include: { _count: { select: { bookings: true, workers: true } } },
      orderBy: { bookings: { _count: "desc" } },
      take: 10,
    });

    return sendResponse(res, {
      data: {
        overview: {
          totalUsers,
          totalWorkers,
          totalHirers,
          totalBookings,
          activeBookings,
          completedBookings,
          disputedBookings,
          totalCategories,
          totalRevenue: totalRevenue._sum.platformFee || 0,
          newUsersToday,
          newBookingsToday,
        },
        monthlyRevenue,
        topCategories,
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to fetch platform stats");
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const {
      role,
      search,
      isActive,
      isBanned,
      page = 1,
      limit = 20,
    } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === "true";
    if (isBanned !== undefined) where.isBanned = isBanned === "true";
    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: parseInt(limit),
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          avatar: true,
          country: true,
          city: true,
          isActive: true,
          isBanned: true,
          isEmailVerified: true,
          createdAt: true,
          lastSeen: true,
          _count: { select: { bookingsAsHirer: true, bookingsAsWorker: true } },
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
        pages: Math.ceil(total / parseInt(limit)),
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
          },
        },
        hirerProfile: true,
        bookingsAsHirer: {
          take: 5,
          orderBy: { createdAt: "desc" },
          include: { category: true },
        },
        bookingsAsWorker: {
          take: 5,
          orderBy: { createdAt: "desc" },
          include: { category: true },
        },
        reviewsReceived: {
          take: 5,
          orderBy: { createdAt: "desc" },
          include: {
            giver: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!user) return sendError(res, "User not found", 404);
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
        body:
          reason ||
          "Your account has been suspended for violating our terms of service.",
        type: "ACCOUNT_BANNED",
      },
    });

    return sendResponse(res, { message: "User banned successfully" });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to ban user");
  }
};

export const unbanUser = async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.params.userId },
      data: { isBanned: false, isActive: true },
    });

    await prisma.notification.create({
      data: {
        userId: req.params.userId,
        title: "Account Reinstated",
        body: "Your account has been reinstated. Welcome back to SkilledPro.",
        type: "ACCOUNT_UNBANNED",
      },
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
    await prisma.user.update({
      where: { id: req.params.userId },
      data: {
        isActive: false,
        isBanned: true,
        email: `deleted_${Date.now()}_${user.email}`,
      },
    });
    return sendResponse(res, { message: "User deleted successfully" });
  } catch (err) {
    return sendError(res, "Failed to delete user");
  }
};

export const verifyWorker = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["VERIFIED", "REJECTED"].includes(status)) {
      return sendError(res, "Status must be VERIFIED or REJECTED", 400);
    }
    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.params.userId },
    });
    if (!worker) return sendError(res, "Worker not found", 404);

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
            ? "Congratulations! Your worker profile has been verified."
            : "Your verification was rejected. Please re-submit with valid documents.",
        type: "VERIFICATION_UPDATE",
      },
    });

    return sendResponse(res, {
      message: `Worker ${status.toLowerCase()} successfully`,
    });
  } catch (err) {
    return sendError(res, "Failed to update verification");
  }
};

export const getAllBookings = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (status) where.status = status;

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take: parseInt(limit),
        include: {
          hirer: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          worker: {
            select: { id: true, firstName: true, lastName: true, email: true },
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
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch bookings");
  }
};

export const getDisputes = async (req, res) => {
  try {
    const disputes = await prisma.booking.findMany({
      where: { status: "DISPUTED" },
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
      orderBy: { updatedAt: "desc" },
    });
    return sendResponse(res, { data: { disputes, total: disputes.length } });
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
    if (booking.status !== "DISPUTED")
      return sendError(res, "Booking is not disputed", 400);

    await prisma.booking.update({
      where: { id: req.params.bookingId },
      data: { status: resolution === "REFUND" ? "CANCELLED" : "COMPLETED" },
    });

    if (booking.payment) {
      await prisma.payment.update({
        where: { bookingId: req.params.bookingId },
        data: {
          status: refundHirer ? "REFUNDED" : "RELEASED",
          ...(refundHirer && { refundedAt: new Date() }),
          ...(releaseToWorker && { escrowReleasedAt: new Date() }),
        },
      });
    }

    const notifMsg = notes || "Admin has resolved your dispute.";
    await prisma.notification.createMany({
      data: [
        {
          userId: booking.hirerId,
          title: "Dispute Resolved",
          body: notifMsg,
          type: "DISPUTE_RESOLVED",
          data: { bookingId: booking.id, resolution },
        },
        {
          userId: booking.workerId,
          title: "Dispute Resolved",
          body: notifMsg,
          type: "DISPUTE_RESOLVED",
          data: { bookingId: booking.id, resolution },
        },
      ],
    });

    return sendResponse(res, { message: "Dispute resolved successfully" });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to resolve dispute");
  }
};

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
    const { name, description, icon } = req.body;
    const category = await prisma.category.update({
      where: { id: req.params.categoryId },
      data: { name, description, icon },
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
    const usage = await prisma.workerCategory.count({
      where: { categoryId: req.params.categoryId },
    });
    if (usage > 0)
      return sendError(
        res,
        `Cannot delete — ${usage} workers use this category`,
        400,
      );
    await prisma.category.delete({ where: { id: req.params.categoryId } });
    return sendResponse(res, { message: "Category deleted" });
  } catch (err) {
    return sendError(res, "Failed to delete category");
  }
};

export const getAllReviews = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        skip,
        take: parseInt(limit),
        include: {
          giver: { select: { id: true, firstName: true, lastName: true } },
          receiver: { select: { id: true, firstName: true, lastName: true } },
          booking: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.review.count(),
    ]);
    return sendResponse(res, { data: { reviews, total } });
  } catch (err) {
    return sendError(res, "Failed to fetch reviews");
  }
};

export const deleteReview = async (req, res) => {
  try {
    await prisma.review.delete({ where: { id: req.params.reviewId } });
    return sendResponse(res, { message: "Review deleted" });
  } catch (err) {
    return sendError(res, "Failed to delete review");
  }
};

export const broadcastNotification = async (req, res) => {
  try {
    const { title, body, type = "PLATFORM_ANNOUNCEMENT", role } = req.body;
    if (!title || !body) return sendError(res, "Title and body required", 400);
    const where = role ? { role, isActive: true } : { isActive: true };
    const users = await prisma.user.findMany({ where, select: { id: true } });
    await prisma.notification.createMany({
      data: users.map((u) => ({ userId: u.id, title, body, type })),
    });
    return sendResponse(res, {
      message: `Broadcast sent to ${users.length} users`,
      data: { recipients: users.length },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Broadcast failed");
  }
};
