// src/routes/admin.routes.js
// All routes require JWT auth + ADMIN role (enforced by router.use below).
// Prefix: /api/admin

import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";

import {
  // Analytics
  getPlatformStats,
  getUserGrowthAnalytics,
  getRevenueAnalytics,

  // Users
  getAllUsers,
  getUserDetail,
  banUser,
  unbanUser,
  deleteUser,
  updateUserRole,

  // Verifications
  verifyWorker,
  getPendingVerifications,
  getVerificationStats,

  // Bookings
  getAllBookings,
  getAdminBookingDetail,
  adminUpdateBookingStatus,

  // Disputes
  getDisputes,
  resolveDispute,

  // Payments
  getAllPayments,
  getPaymentDetail,
  adminReleasePayment,
  adminRefundPayment,

  // Withdrawals
  getAllWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,

  // Categories
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,

  // Reviews
  getAllReviews,
  deleteReview,

  // Jobs
  getAllJobPosts,
  getJobPostDetail,
  adminDeleteJobPost,
  adminUpdateJobStatus,

  // Subscriptions
  getAllSubscriptions,
  adminCancelSubscription,

  // Featured Listings
  getAllFeaturedListings,
  adminRemoveFeaturedListing,

  // Community Posts
  getAllPosts,
  adminDeletePost,
  adminDeleteComment,

  // Messages
  getAllConversations,
  getConversationMessages,

  // Notifications
  broadcastNotification,

  // Video Calls
  getAllVideoCalls,

  // Manual Payments
  verifyManualPayment,
  rejectManualPayment,
} from "../controllers/admin.controller.js";

const router = Router();

// ─── Guard — every route below requires a valid JWT + ADMIN role ───────────────
router.use(protect, requireRole("ADMIN"));

// ─── Analytics ────────────────────────────────────────────────────────────────
router.get("/stats", getPlatformStats);
router.get("/analytics/users", getUserGrowthAnalytics);
router.get("/analytics/revenue", getRevenueAnalytics);

// ─── Users ────────────────────────────────────────────────────────────────────
router.get("/users", getAllUsers);
router.get("/users/:userId", getUserDetail);
router.patch("/users/:userId/ban", banUser);
router.patch("/users/:userId/unban", unbanUser);
router.delete("/users/:userId", deleteUser);
router.patch("/users/:userId/role", updateUserRole);

// ─── Verifications ────────────────────────────────────────────────────────────
router.get("/verifications/stats", getVerificationStats);
router.get("/verifications/pending", getPendingVerifications);
router.patch("/users/:userId/verify", verifyWorker);

// ─── Bookings ─────────────────────────────────────────────────────────────────
router.get("/bookings", getAllBookings);
router.get("/bookings/:bookingId", getAdminBookingDetail);
router.patch("/bookings/:bookingId/status", adminUpdateBookingStatus);

// ─── Disputes ─────────────────────────────────────────────────────────────────
router.get("/disputes", getDisputes);
router.patch("/disputes/:bookingId/resolve", resolveDispute);

// ─── Payments ─────────────────────────────────────────────────────────────────
router.get("/payments", getAllPayments);
router.get("/payments/:paymentId", getPaymentDetail);
router.post("/payments/:bookingId/release", adminReleasePayment);
router.post("/payments/:bookingId/refund", adminRefundPayment);

// Manual payment verification (for bank transfers, etc.)
router.patch("/payments/:bookingId/verify", verifyManualPayment);
router.patch("/payments/:bookingId/reject-manual", rejectManualPayment);

// ─── Withdrawals ──────────────────────────────────────────────────────────────
router.get("/withdrawals", getAllWithdrawals);
router.patch("/withdrawals/:withdrawalId/approve", approveWithdrawal);
router.patch("/withdrawals/:withdrawalId/reject", rejectWithdrawal);

// ─── Categories ───────────────────────────────────────────────────────────────
router.get("/categories", getAllCategories);
router.post("/categories", createCategory);
router.patch("/categories/:categoryId", updateCategory);
router.delete("/categories/:categoryId", deleteCategory);

// ─── Reviews ──────────────────────────────────────────────────────────────────
router.get("/reviews", getAllReviews);
router.delete("/reviews/:reviewId", deleteReview);

// ─── Jobs & Applications ──────────────────────────────────────────────────────
router.get("/jobs", getAllJobPosts);
router.get("/jobs/:jobId", getJobPostDetail);
router.patch("/jobs/:jobId/status", adminUpdateJobStatus);
router.delete("/jobs/:jobId", adminDeleteJobPost);

// ─── Subscriptions ────────────────────────────────────────────────────────────
router.get("/subscriptions", getAllSubscriptions);
router.patch("/subscriptions/:subscriptionId/cancel", adminCancelSubscription);

// ─── Featured Listings ────────────────────────────────────────────────────────
router.get("/featured", getAllFeaturedListings);
router.delete("/featured/:listingId", adminRemoveFeaturedListing);

// ─── Community Posts ──────────────────────────────────────────────────────────
router.get("/posts", getAllPosts);
router.delete("/posts/:postId", adminDeletePost);
router.delete("/posts/comments/:commentId", adminDeleteComment);

// ─── Messages (read-only oversight) ──────────────────────────────────────────
router.get("/conversations", getAllConversations);
router.get("/conversations/:conversationId", getConversationMessages);

// ─── Notifications ────────────────────────────────────────────────────────────
router.post("/broadcast", broadcastNotification);

// ─── Video Calls ──────────────────────────────────────────────────────────────
router.get("/video-calls", getAllVideoCalls);

export default router;
