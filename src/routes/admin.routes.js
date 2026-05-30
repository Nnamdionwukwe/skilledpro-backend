// src/routes/admin.routes.js
import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  getPlatformStats,
  getUserGrowthAnalytics,
  getRevenueAnalytics,
  getAllUsers,
  getUserDetail,
  banUser,
  unbanUser,
  deleteUser,
  updateUserRole,
  verifyWorker,
  getPendingVerifications,
  getVerificationStats,
  getAllBookings,
  getAdminBookingDetail,
  adminUpdateBookingStatus,
  getDisputes,
  resolveDispute,
  getAllPayments,
  getPaymentDetail,
  adminReleasePayment,
  adminRefundPayment,
  getAllWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getAllReviews,
  deleteReview,
  getAllJobPosts,
  getJobPostDetail,
  adminUpdateJobStatus,
  adminDeleteJobPost,
  getAllSubscriptions,
  adminCancelSubscription,
  getAllFeaturedListings,
  adminRemoveFeaturedListing,
  getAllPosts,
  adminDeletePost,
  adminDeleteComment,
  getAllConversations,
  getConversationMessages,
  broadcastNotification,
  getAllVideoCalls,
} from "../controllers/admin.controller.js";
import {
  verifyManualPayment,
  rejectManualPayment,
} from "../controllers/admin.controller.js";
import {
  validateCreateCategory,
  validateBroadcast,
  validateResolveDispute,
  validateUUIDParam,
  validatePagination,
} from "../utils/validators.js";

const router = Router();

// ── All admin routes require auth + ADMIN role ─────────────────────────────────
router.use(protect, requireRole("ADMIN"));

// ── Analytics & stats ──────────────────────────────────────────────────────────
router.get("/stats", getPlatformStats);
router.get("/analytics/users", getUserGrowthAnalytics);
router.get("/analytics/revenue", getRevenueAnalytics);

// ── Users ──────────────────────────────────────────────────────────────────────
router.get("/users", validatePagination, getAllUsers);
router.get("/users/:userId", ...validateUUIDParam("userId"), getUserDetail);
router.patch("/users/:userId/ban", ...validateUUIDParam("userId"), banUser);
router.patch("/users/:userId/unban", ...validateUUIDParam("userId"), unbanUser);
router.delete("/users/:userId", ...validateUUIDParam("userId"), deleteUser);
router.patch(
  "/users/:userId/role",
  ...validateUUIDParam("userId"),
  updateUserRole,
);

// ── Verifications ──────────────────────────────────────────────────────────────
router.get("/verifications/stats", getVerificationStats);
router.get(
  "/verifications/pending",
  validatePagination,
  getPendingVerifications,
);
router.patch(
  "/users/:userId/verify",
  ...validateUUIDParam("userId"),
  verifyWorker,
);

// ── Bookings ───────────────────────────────────────────────────────────────────
router.get("/bookings", validatePagination, getAllBookings);
router.get(
  "/bookings/:bookingId",
  ...validateUUIDParam("bookingId"),
  getAdminBookingDetail,
);
router.patch(
  "/bookings/:bookingId/status",
  ...validateUUIDParam("bookingId"),
  adminUpdateBookingStatus,
);

// ── Disputes ───────────────────────────────────────────────────────────────────
router.get("/disputes", validatePagination, getDisputes);
router.patch(
  "/disputes/:bookingId/resolve",
  validateResolveDispute,
  resolveDispute,
);

// ── Payments ───────────────────────────────────────────────────────────────────
router.get("/payments", validatePagination, getAllPayments);
router.get(
  "/payments/:paymentId",
  ...validateUUIDParam("paymentId"),
  getPaymentDetail,
);
router.post(
  "/payments/:bookingId/release",
  ...validateUUIDParam("bookingId"),
  adminReleasePayment,
);
router.post(
  "/payments/:bookingId/refund",
  ...validateUUIDParam("bookingId"),
  adminRefundPayment,
);
router.patch(
  "/payments/:bookingId/verify",
  ...validateUUIDParam("bookingId"),
  verifyManualPayment,
);
router.patch(
  "/payments/:bookingId/reject-manual",
  ...validateUUIDParam("bookingId"),
  rejectManualPayment,
);

// ── Withdrawals ────────────────────────────────────────────────────────────────
router.get("/withdrawals", validatePagination, getAllWithdrawals);
router.patch(
  "/withdrawals/:withdrawalId/approve",
  ...validateUUIDParam("withdrawalId"),
  approveWithdrawal,
);
router.patch(
  "/withdrawals/:withdrawalId/reject",
  ...validateUUIDParam("withdrawalId"),
  rejectWithdrawal,
);

// ── Categories ─────────────────────────────────────────────────────────────────
router.get("/categories", validatePagination, getAllCategories);
router.post("/categories", validateCreateCategory, createCategory);
router.patch(
  "/categories/:categoryId",
  ...validateUUIDParam("categoryId"),
  updateCategory,
);
router.delete(
  "/categories/:categoryId",
  ...validateUUIDParam("categoryId"),
  deleteCategory,
);

// ── Reviews ────────────────────────────────────────────────────────────────────
router.get("/reviews", validatePagination, getAllReviews);
router.delete(
  "/reviews/:reviewId",
  ...validateUUIDParam("reviewId"),
  deleteReview,
);

// ── Jobs ───────────────────────────────────────────────────────────────────────
router.get("/jobs", validatePagination, getAllJobPosts);
router.get("/jobs/:jobId", ...validateUUIDParam("jobId"), getJobPostDetail);
router.patch(
  "/jobs/:jobId/status",
  ...validateUUIDParam("jobId"),
  adminUpdateJobStatus,
);
router.delete(
  "/jobs/:jobId",
  ...validateUUIDParam("jobId"),
  adminDeleteJobPost,
);

// ── Subscriptions ──────────────────────────────────────────────────────────────
router.get("/subscriptions", validatePagination, getAllSubscriptions);
router.patch(
  "/subscriptions/:subscriptionId/cancel",
  ...validateUUIDParam("subscriptionId"),
  adminCancelSubscription,
);

// ── Featured listings ──────────────────────────────────────────────────────────
router.get("/featured", validatePagination, getAllFeaturedListings);
router.delete(
  "/featured/:listingId",
  ...validateUUIDParam("listingId"),
  adminRemoveFeaturedListing,
);

// ── Community posts ────────────────────────────────────────────────────────────
router.get("/posts", validatePagination, getAllPosts);
router.delete(
  "/posts/:postId",
  ...validateUUIDParam("postId"),
  adminDeletePost,
);
router.delete(
  "/posts/comments/:commentId",
  ...validateUUIDParam("commentId"),
  adminDeleteComment,
);

// ── Messages (read-only oversight) ────────────────────────────────────────────
router.get("/conversations", validatePagination, getAllConversations);
router.get(
  "/conversations/:conversationId",
  ...validateUUIDParam("conversationId"),
  getConversationMessages,
);

// ── Broadcast notification ─────────────────────────────────────────────────────
router.post("/broadcast", validateBroadcast, broadcastNotification);

// ── Video calls ────────────────────────────────────────────────────────────────
router.get("/video-calls", validatePagination, getAllVideoCalls);

export default router;
