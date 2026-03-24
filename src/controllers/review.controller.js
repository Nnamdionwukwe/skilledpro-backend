import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

export const createReview = async (req, res) => {
  try {
    const { bookingId, rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) return sendError(res, "Rating must be 1-5", 400);
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return sendError(res, "Booking not found", 404);
    if (booking.status !== "COMPLETED") return sendError(res, "Can only review completed bookings", 400);
    if (booking.hirerId !== req.user.id && booking.workerId !== req.user.id) return sendError(res, "Forbidden", 403);

    const receiverId = req.user.id === booking.hirerId ? booking.workerId : booking.hirerId;
    const existing = await prisma.review.findFirst({ where: { bookingId, giverId: req.user.id } });
    if (existing) return sendError(res, "Already reviewed", 409);

    const review = await prisma.review.create({
      data: { bookingId, giverId: req.user.id, receiverId, rating: parseInt(rating), comment },
    });

    // Update worker avg rating
    if (receiverId === booking.workerId) {
      const stats = await prisma.review.aggregate({ where: { receiverId }, _avg: { rating: true }, _count: true });
      await prisma.workerProfile.updateMany({
        where: { userId: receiverId },
        data: { avgRating: stats._avg.rating || 0, totalReviews: stats._count },
      });
    }

    return sendResponse(res, { status: 201, message: "Review submitted", data: { review } });
  } catch (err) {
    console.error(err);
    return sendError(res, "Review failed");
  }
};

export const getWorkerReviews = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: { receiverId: req.params.userId },
        skip, take: parseInt(limit),
        include: { giver: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.review.count({ where: { receiverId: req.params.userId } }),
    ]);
    return sendResponse(res, { data: { reviews, total } });
  } catch (err) {
    return sendError(res, "Failed to fetch reviews");
  }
};
