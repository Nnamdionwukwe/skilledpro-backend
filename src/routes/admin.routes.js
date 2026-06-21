// src/routes/admin.routes.js
import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  // Analytics
  getPlatformStats,
  getAdminDashboard,
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
  // Payments — general
  getAllPayments,
  getPaymentDetail,
  adminReleasePayment,
  adminRefundPayment,
  // Payments — manual verification (these REPLACE verifyManualPayment / rejectManualPayment)
  adminGetManualPayments,
  adminGetPaymentAttempts,
  adminVerifyManualPayment,
  adminRejectManualPayment,
  adminManualPaymentStats,
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
  adminUpdateJobStatus,
  adminDeleteJobPost,
  // Subscriptions
  getAllSubscriptions,
  adminCancelSubscription,
  // Featured listings
  getAllFeaturedListings,
  adminRemoveFeaturedListing,
  // Community posts
  getAllPosts,
  adminDeletePost,
  adminDeleteComment,
  // Messages
  getAllConversations,
  getConversationMessages,
  // Notifications
  broadcastNotification,
  // Video calls
  getAllVideoCalls,
} from "../controllers/admin.controller.js";

import { approveWithdrawalPayout } from "../controllers/payment.controller.js";

import {
  validateCreateCategory,
  validateBroadcast,
  validateResolveDispute,
  validateUUIDParam,
  validatePagination,
} from "../utils/validators.js";

const router = Router();
router.use(protect, requireRole("ADMIN"));

// ── Analytics ──────────────────────────────────────────────────────────────────
router.get("/stats", getPlatformStats);
router.get("/dashboard", getAdminDashboard); // FIX: was bare `getAdminDashboard;` — never registered
router.get("/analytics/users", getUserGrowthAnalytics);
router.get("/analytics/revenue", getRevenueAnalytics);

// ── Users ──────────────────────────────────────────────────────────────────────
router.get(
  "/users",
  ...validateUUIDParam("userId", false),
  validatePagination,
  getAllUsers,
);
router.get("/users/:userId", ...validateUUIDParam("userId"), getUserDetail);
router.patch("/users/:userId/ban", ...validateUUIDParam("userId"), banUser);
router.patch("/users/:userId/unban", ...validateUUIDParam("userId"), unbanUser);
router.patch(
  "/users/:userId/role",
  ...validateUUIDParam("userId"),
  updateUserRole,
);
router.delete("/users/:userId", ...validateUUIDParam("userId"), deleteUser);

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
// CRITICAL ORDER: specific static paths MUST come before parameterized ones.
// /payments/stats          ← must be before /payments/:paymentId
// /payments/booking/…      ← must be before /payments/:paymentId
// /payments/:paymentId     ← catch-all for single payment lookup, comes last
//
// FIX 1: /payments/stats was registered AFTER /payments/:paymentId — Express
//         would match "stats" as a paymentId UUID, validateUUIDParam would 400.
// FIX 2: GET /payments was registered twice (getAllPayments + adminGetManualPayments).
//         Express uses the first match so adminGetManualPayments never ran.
//         Replaced the first registration with adminGetManualPayments everywhere.
// FIX 3: PATCH verify + reject-manual were each registered twice (old + new functions).
//         Removed the old verifyManualPayment / rejectManualPayment duplicates.

router.get("/payments/stats", adminManualPaymentStats); // static — MUST be first

router.get(
  "/payments/booking/:bookingId/attempts",
  ...validateUUIDParam("bookingId"),
  adminGetPaymentAttempts,
); // static sub-path — before /:paymentId

router.get("/payments", validatePagination, adminGetManualPayments); // list — returns bank+crypto, all statuses, with referralDiscount

router.get(
  "/payments/:paymentId",
  ...validateUUIDParam("paymentId"),
  getPaymentDetail,
); // single lookup — last

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
  adminVerifyManualPayment,
); // FIX: was verifyManualPayment (duplicate removed)
router.patch(
  "/payments/:bookingId/reject-manual",
  ...validateUUIDParam("bookingId"),
  adminRejectManualPayment,
); // FIX: was rejectManualPayment (duplicate removed)

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
router.post(
  "/withdrawals/:withdrawalId/payout",
  ...validateUUIDParam("withdrawalId"),
  approveWithdrawalPayout,
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
// ── Jobs (Platform) ──────────────────────────────────────────────────────────
router.get("/platform/jobs", validatePagination, getAllJobPosts);
router.get(
  "/platform/jobs/:jobId",
  ...validateUUIDParam("jobId"),
  getJobPostDetail,
);
router.patch(
  "/platform/jobs/:jobId/status",
  ...validateUUIDParam("jobId"),
  adminUpdateJobStatus,
);
router.delete(
  "/platform/jobs/:jobId",
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
// NOTE: /posts/comments/:commentId MUST come before /posts/:postId
router.get("/posts", validatePagination, getAllPosts);
router.delete(
  "/posts/comments/:commentId",
  ...validateUUIDParam("commentId"),
  adminDeleteComment,
); // static sub-path first
router.delete(
  "/posts/:postId",
  ...validateUUIDParam("postId"),
  adminDeletePost,
); // parameterized after

// ── Messages ───────────────────────────────────────────────────────────────────
router.get("/conversations", validatePagination, getAllConversations);
router.get(
  "/conversations/:conversationId",
  ...validateUUIDParam("conversationId"),
  getConversationMessages,
);

// ── Notifications ──────────────────────────────────────────────────────────────
router.post("/broadcast", validateBroadcast, broadcastNotification);

// ── Video calls ────────────────────────────────────────────────────────────────
router.get("/video-calls", validatePagination, getAllVideoCalls);

export default router;
