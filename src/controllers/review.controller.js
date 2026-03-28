import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

// ── POST /api/reviews ─────────────────────────────────────────────────────────
// Both hirers and workers can leave a review after a completed booking
export const createReview = async (req, res) => {
  try {
    const { bookingId, rating, comment } = req.body;

    if (!bookingId) return sendError(res, "Booking ID is required", 400);
    if (!rating || rating < 1 || rating > 5) {
      return sendError(res, "Rating must be between 1 and 5", 400);
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        hirer: { select: { id: true, firstName: true, lastName: true } },
        worker: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!booking) return sendError(res, "Booking not found", 404);
    if (booking.status !== "COMPLETED") {
      return sendError(res, "You can only review completed bookings", 400);
    }

    const isHirer = booking.hirerId === req.user.id;
    const isWorker = booking.workerId === req.user.id;

    if (!isHirer && !isWorker) {
      return sendError(res, "You are not part of this booking", 403);
    }

    // Check if this user already reviewed this booking
    const existing = await prisma.review.findFirst({
      where: { bookingId, giverId: req.user.id },
    });
    if (existing)
      return sendError(res, "You have already reviewed this booking", 409);

    // Receiver is the other party
    const receiverId = isHirer ? booking.workerId : booking.hirerId;

    const review = await prisma.review.create({
      data: {
        bookingId,
        giverId: req.user.id,
        receiverId,
        rating: parseInt(rating),
        comment: comment || null,
      },
      include: {
        giver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
          },
        },
        receiver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
          },
        },
        booking: {
          select: { id: true, title: true, scheduledAt: true },
        },
      },
    });

    // Update worker avg rating whenever a worker receives a review
    if (isHirer) {
      // Hirer reviewed worker — update worker stats
      const stats = await prisma.review.aggregate({
        where: { receiverId: booking.workerId },
        _avg: { rating: true },
        _count: { id: true },
      });
      await prisma.workerProfile.updateMany({
        where: { userId: booking.workerId },
        data: {
          avgRating: Math.round((stats._avg.rating || 0) * 10) / 10,
          totalReviews: stats._count.id,
        },
      });
    }

    // Update hirer avg rating
    if (isWorker) {
      const hirerStats = await prisma.review.aggregate({
        where: { receiverId: booking.hirerId },
        _avg: { rating: true },
        _count: { id: true },
      });
      await prisma.hirerProfile.updateMany({
        where: { userId: booking.hirerId },
        data: {
          avgRating: Math.round((hirerStats._avg.rating || 0) * 10) / 10,
        },
      });
    }

    return sendResponse(res, {
      status: 201,
      message: "Review submitted successfully",
      data: { review },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to submit review");
  }
};

// ── GET /api/reviews/worker/:userId ───────────────────────────────────────────
// Public — reviews received by a worker (shown on public worker profile)
export const getWorkerReviews = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reviews, total, stats] = await Promise.all([
      prisma.review.findMany({
        where: { receiverId: req.params.userId },
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
      prisma.review.count({ where: { receiverId: req.params.userId } }),
      prisma.review.aggregate({
        where: { receiverId: req.params.userId },
        _avg: { rating: true },
        _count: { id: true },
      }),
    ]);

    // Rating distribution (how many 5★, 4★, etc.)
    const distribution = await prisma.review.groupBy({
      by: ["rating"],
      where: { receiverId: req.params.userId },
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
        distribution: distribution.reduce((acc, r) => {
          acc[r.rating] = r._count.rating;
          return acc;
        }, {}),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch worker reviews");
  }
};

// ── GET /api/reviews/hirer/:userId ────────────────────────────────────────────
// Public — reviews received by a hirer (shown on public hirer profile)
export const getHirerReviewsPublic = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reviews, total, stats] = await Promise.all([
      prisma.review.findMany({
        where: { receiverId: req.params.userId },
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
      prisma.review.count({ where: { receiverId: req.params.userId } }),
      prisma.review.aggregate({
        where: { receiverId: req.params.userId },
        _avg: { rating: true },
        _count: { id: true },
      }),
    ]);

    const distribution = await prisma.review.groupBy({
      by: ["rating"],
      where: { receiverId: req.params.userId },
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

// ── GET /api/reviews/my/given ─────────────────────────────────────────────────
// Protected — reviews the logged-in user has GIVEN (both hirers and workers)
export const getMyGivenReviews = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: { giverId: req.user.id },
        skip,
        take: parseInt(limit),
        include: {
          receiver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              role: true,
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
      prisma.review.count({ where: { giverId: req.user.id } }),
    ]);

    return sendResponse(res, {
      data: {
        reviews,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch given reviews");
  }
};

// ── GET /api/reviews/my/received ──────────────────────────────────────────────
// Protected — reviews the logged-in user has RECEIVED (both hirers and workers)
export const getMyReceivedReviews = async (req, res) => {
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
    return sendError(res, "Failed to fetch received reviews");
  }
};

// ── GET /api/reviews/check/:bookingId ─────────────────────────────────────────
// Protected — check if logged-in user already reviewed a booking
export const checkReviewStatus = async (req, res) => {
  try {
    const review = await prisma.review.findFirst({
      where: { bookingId: req.params.bookingId, giverId: req.user.id },
    });
    return sendResponse(res, {
      data: { hasReviewed: !!review, review: review || null },
    });
  } catch (err) {
    return sendError(res, "Failed to check review status");
  }
};

// ── DELETE /api/reviews/:reviewId ─────────────────────────────────────────────
// Admin only — delete a review
export const deleteReview = async (req, res) => {
  try {
    await prisma.review.delete({ where: { id: req.params.reviewId } });
    return sendResponse(res, { message: "Review deleted" });
  } catch (err) {
    return sendError(res, "Failed to delete review");
  }
};
