// ─────────────────────────────────────────────────────────────────────────────
// In-app + Push notification service.
// Every createNotification() call now also fires a push notification
// to the user's registered mobile devices automatically.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../config/database.js";
import { getIO } from "../socket/index.js";
import { sendPushToUser } from "./push.service.js";

// ── Core: create in-app + emit Socket.IO + send push ─────────────────────────
export async function createNotification({
  userId,
  title,
  body,
  type,
  data = {},
  icon = "FaBell", // ← NEW: React Icon name for frontend
}) {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        body,
        type,
        data,
        icon, // ← store icon name
      },
    });

    // ── Socket.IO real-time (web + mobile WebSocket) ──────────────────────────
    try {
      const io = getIO();
      if (io) {
        io.to(`user:${userId}`).emit("notification", {
          id: notification.id,
          title,
          body,
          type,
          data,
          icon, // ← send icon to frontend
          isRead: false,
          createdAt: notification.createdAt,
        });
      }
    } catch (_) {}

    // ── Expo push (mobile background / foreground) — fire and forget ──────────
    sendPushToUser(userId, { title, body, data }).catch(() => {});

    return notification;
  } catch (err) {
    console.error("[Notification] Failed to create:", err.message);
  }
}

// ── Notification type constants ───────────────────────────────────────────────
export const N = {
  BOOKING_REQUEST: "BOOKING_REQUEST",
  BOOKING_ACCEPTED: "BOOKING_ACCEPTED",
  BOOKING_REJECTED: "BOOKING_REJECTED",
  BOOKING_CANCELLED: "BOOKING_CANCELLED",
  BOOKING_IN_PROGRESS: "BOOKING_IN_PROGRESS",
  BOOKING_COMPLETED: "BOOKING_COMPLETED",
  PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
  PAYMENT_RELEASED: "PAYMENT_RELEASED",
  PAYMENT_REFUNDED: "PAYMENT_REFUNDED",
  NEW_REVIEW: "NEW_REVIEW",
  REVIEW_REQUEST: "REVIEW_REQUEST",
  JOB_APPLICATION: "JOB_APPLICATION",
  APPLICATION_STATUS: "APPLICATION_STATUS",
  NEW_MESSAGE: "NEW_MESSAGE",
  PROFILE_VIEWED: "PROFILE_VIEWED",
  ACCOUNT_VERIFIED: "ACCOUNT_VERIFIED",
  LOGIN_ALERT: "LOGIN_ALERT",
};

// ── Icon mapping ──────────────────────────────────────────────────────────────
const ICONS = {
  BOOKING_REQUEST: "FaCalendarPlus",
  BOOKING_ACCEPTED: "FaCheckCircle",
  BOOKING_REJECTED: "FaTimesCircle",
  BOOKING_CANCELLED: "FaBan",
  BOOKING_IN_PROGRESS: "FaClock",
  BOOKING_COMPLETED: "FaTrophy",
  PAYMENT_RECEIVED: "FaCreditCard",
  PAYMENT_RELEASED: "FaMoneyBillWave",
  PAYMENT_REFUNDED: "FaUndoAlt",
  NEW_REVIEW: "FaStar",
  REVIEW_REQUEST: "FaStarHalfAlt",
  JOB_APPLICATION: "FaFileAlt",
  APPLICATION_STATUS: "FaCheck",
  NEW_MESSAGE: "FaCommentDots",
  PROFILE_VIEWED: "FaEye",
  ACCOUNT_VERIFIED: "FaCheckCircle",
  LOGIN_ALERT: "FaShieldAlt",
  SUBSCRIPTION_ACTIVATED: "FaRocket",
  SUBSCRIPTION_EXPIRED: "FaExclamationTriangle",
  SUBSCRIPTION_CANCELLED: "FaTimes",
  WITHDRAWAL_COMPLETED: "FaMoneyBillWave",
  WITHDRAWAL_FAILED: "FaExclamationCircle",
  VERIFICATION_APPROVED: "FaCheckCircle",
  VERIFICATION_REJECTED: "FaTimesCircle",
  FEATURED_ACTIVATED: "FaStar",
  FEATURED_EXPIRING: "FaClock",
  DISPUTE_RAISED: "FaGavel",
  DISPUTE_RESOLVED: "FaCheckCircle",
  SOS_ACTIVATED: "FaExclamationTriangle",
  SOS_RESOLVED: "FaCheckCircle",
  PASSWORD_CHANGED: "FaLock",
  JOB_MATCH: "FaBriefcase",
};

// ── Helper to get icon for notification type ──────────────────────────────────
function getIcon(type) {
  return ICONS[type] || "FaBell";
}

// ══════════════════════════════════════════════════════════════════════════════
// BOOKING
// ══════════════════════════════════════════════════════════════════════════════
export const notifyBookingRequest = (workerId, hirerName, booking) =>
  createNotification({
    userId: workerId,
    title: "New booking request",
    body: `${hirerName} wants to book you for "${booking.title}"`,
    type: N.BOOKING_REQUEST,
    data: { bookingId: booking.id },
    icon: getIcon(N.BOOKING_REQUEST),
  });

export const notifyBookingAccepted = (hirerId, workerName, booking) =>
  createNotification({
    userId: hirerId,
    title: "Booking accepted",
    body: `${workerName} accepted "${booking.title}". Please pay to confirm.`,
    type: N.BOOKING_ACCEPTED,
    data: { bookingId: booking.id },
    icon: getIcon(N.BOOKING_ACCEPTED),
  });

export const notifyBookingRejected = (hirerId, workerName, booking) =>
  createNotification({
    userId: hirerId,
    title: "Booking declined",
    body: `${workerName} was unable to take "${booking.title}".`,
    type: N.BOOKING_REJECTED,
    data: { bookingId: booking.id },
    icon: getIcon(N.BOOKING_REJECTED),
  });

export const notifyBookingCancelled = (userId, name, booking, reason) =>
  createNotification({
    userId,
    title: "Booking cancelled",
    body: `"${booking.title}" has been cancelled.${reason ? ` Reason: ${reason}` : ""}`,
    type: N.BOOKING_CANCELLED,
    data: { bookingId: booking.id },
    icon: getIcon(N.BOOKING_CANCELLED),
  });

export const notifyBookingInProgress = (hirerId, workerName, booking) =>
  createNotification({
    userId: hirerId,
    title: "Job started",
    body: `${workerName} checked in for "${booking.title}"`,
    type: N.BOOKING_IN_PROGRESS,
    data: { bookingId: booking.id },
    icon: getIcon(N.BOOKING_IN_PROGRESS),
  });

export const notifyBookingCompleted = (hirerId, workerName, booking) =>
  createNotification({
    userId: hirerId,
    title: "Job completed",
    body: `${workerName} completed "${booking.title}". Release payment and leave a review.`,
    type: N.BOOKING_COMPLETED,
    data: { bookingId: booking.id },
    icon: getIcon(N.BOOKING_COMPLETED),
  });

// ══════════════════════════════════════════════════════════════════════════════
// PAYMENT
// ══════════════════════════════════════════════════════════════════════════════
export const notifyPaymentReceived = (hirerId, amount, currency, booking) =>
  createNotification({
    userId: hirerId,
    title: "Payment held in escrow",
    body: `${currency} ${Number(amount).toLocaleString()} is held for "${booking.title}"`,
    type: N.PAYMENT_RECEIVED,
    data: { bookingId: booking.id },
    icon: getIcon(N.PAYMENT_RECEIVED),
  });

export const notifyPaymentReleased = (workerId, amount, currency, booking) =>
  createNotification({
    userId: workerId,
    title: "Payment released",
    body: `${currency} ${Number(amount).toLocaleString()} released for "${booking.title}"`,
    type: N.PAYMENT_RELEASED,
    data: { bookingId: booking.id },
    icon: getIcon(N.PAYMENT_RELEASED),
  });

export const notifyPaymentRefunded = (userId, amount, currency, booking) =>
  createNotification({
    userId,
    title: "Refund processed",
    body: `${currency} ${Number(amount).toLocaleString()} refund for "${booking.title}"`,
    type: N.PAYMENT_REFUNDED,
    data: { bookingId: booking.id },
    icon: getIcon(N.PAYMENT_REFUNDED),
  });

// ══════════════════════════════════════════════════════════════════════════════
// REVIEWS
// ══════════════════════════════════════════════════════════════════════════════
export const notifyReviewRequest = (userId, otherPartyName, booking) =>
  createNotification({
    userId,
    title: "Leave a review",
    body: `How was your experience with ${otherPartyName}? Review "${booking.title}"`,
    type: N.REVIEW_REQUEST,
    data: { bookingId: booking.id },
    icon: getIcon(N.REVIEW_REQUEST),
  });

export const notifyNewReview = (receiverId, giverName, rating, booking) =>
  createNotification({
    userId: receiverId,
    title: "New review",
    body: `${giverName} gave you ${rating} star${rating !== 1 ? "s" : ""} for "${booking.title}"`,
    type: N.NEW_REVIEW,
    data: { bookingId: booking.id, rating },
    icon: getIcon(N.NEW_REVIEW),
  });

// ══════════════════════════════════════════════════════════════════════════════
// JOBS
// ══════════════════════════════════════════════════════════════════════════════
export const notifyJobApplication = (hirerId, workerName, job) =>
  createNotification({
    userId: hirerId,
    title: "New job application",
    body: `${workerName} applied for "${job.title}"`,
    type: N.JOB_APPLICATION,
    data: { jobPostId: job.id },
    icon: getIcon(N.JOB_APPLICATION),
  });

export const notifyApplicationAccepted = (workerId, hirerName, job) =>
  createNotification({
    userId: workerId,
    title: "Application accepted!",
    body: `Your application for "${job.title}" was accepted by ${hirerName}`,
    type: N.APPLICATION_STATUS,
    data: { jobPostId: job.id, status: "ACCEPTED" },
    icon: getIcon(N.APPLICATION_STATUS),
  });

export const notifyApplicationRejected = (workerId, job) =>
  createNotification({
    userId: workerId,
    title: "Application update",
    body: `Your application for "${job.title}" was not selected.`,
    type: N.APPLICATION_STATUS,
    data: { jobPostId: job.id, status: "REJECTED" },
    icon: getIcon(N.APPLICATION_STATUS),
  });

export const notifyNewJobMatch = (workerId, jobTitle, jobId, categoryName) =>
  createNotification({
    userId: workerId,
    title: `New ${categoryName} job`,
    body: `"${jobTitle}" was just posted. Apply before it fills up!`,
    type: "JOB_MATCH",
    data: { jobPostId: jobId, categoryName },
    icon: getIcon("JOB_MATCH"),
  });

// ══════════════════════════════════════════════════════════════════════════════
// MESSAGES
// ══════════════════════════════════════════════════════════════════════════════
export const notifyNewMessage = (
  receiverId,
  senderName,
  preview,
  conversationId,
) =>
  createNotification({
    userId: receiverId,
    title: `New message from ${senderName}`,
    body: preview
      ? `"${preview.slice(0, 80)}${preview.length > 80 ? "…" : ""}"`
      : "You have a new message",
    type: N.NEW_MESSAGE,
    data: { conversationId, senderName },
    icon: getIcon(N.NEW_MESSAGE),
  });

// ══════════════════════════════════════════════════════════════════════════════
// PROFILE
// ══════════════════════════════════════════════════════════════════════════════
export const notifyProfileViewed = (profileOwnerId, viewerName, viewerRole) =>
  createNotification({
    userId: profileOwnerId,
    title: "Profile viewed",
    body: `${viewerName} (${viewerRole?.toLowerCase() || "user"}) viewed your profile`,
    type: N.PROFILE_VIEWED,
    data: { viewerName, viewerRole },
    icon: getIcon(N.PROFILE_VIEWED),
  });

// ══════════════════════════════════════════════════════════════════════════════
// ACCOUNT / SECURITY
// ══════════════════════════════════════════════════════════════════════════════
export const notifyLoginAlert = (userId, ip, device) =>
  createNotification({
    userId,
    title: "New login detected",
    body: `Account accessed${ip ? ` from ${ip}` : ""}${device ? ` on ${device}` : ""}. Not you? Change your password.`,
    type: N.LOGIN_ALERT,
    data: { ip, device },
    icon: getIcon(N.LOGIN_ALERT),
  });

export const notifyAccountVerified = (userId) =>
  createNotification({
    userId,
    title: "Account verified",
    body: "Your identity is verified. You can now access all features.",
    type: N.ACCOUNT_VERIFIED,
    data: {},
    icon: getIcon(N.ACCOUNT_VERIFIED),
  });

export const notifyPasswordChanged = (userId) =>
  createNotification({
    userId,
    title: "Password changed",
    body: "Your password was changed. If this wasn't you, contact support immediately.",
    type: "PASSWORD_CHANGED",
    data: {},
    icon: getIcon("PASSWORD_CHANGED"),
  });

export const notifyNewDevice = (userId, ip, device) =>
  createNotification({
    userId,
    title: "New login detected",
    body: `Login detected${device ? ` from ${device}` : ""}${ip ? ` (${ip})` : ""}. Not you? Change your password.`,
    type: N.LOGIN_ALERT,
    data: { ip, device },
    icon: getIcon(N.LOGIN_ALERT),
  });

// ══════════════════════════════════════════════════════════════════════════════
// DISPUTES / SOS
// ══════════════════════════════════════════════════════════════════════════════
export const notifyDisputeRaised = (userId, raisedByName, booking) =>
  createNotification({
    userId,
    title: "Dispute raised",
    body: `${raisedByName} raised a dispute on "${booking.title}". Our team will review within 24–48 hours.`,
    type: "DISPUTE_RAISED",
    data: { bookingId: booking.id },
    icon: getIcon("DISPUTE_RAISED"),
  });

export const notifyDisputeResolved = (userId, booking, resolution) =>
  createNotification({
    userId,
    title: "Dispute resolved",
    body: `The dispute on "${booking.title}" has been resolved.${resolution ? ` Resolution: ${resolution}` : ""}`,
    type: "DISPUTE_RESOLVED",
    data: { bookingId: booking.id },
    icon: getIcon("DISPUTE_RESOLVED"),
  });

export const notifySOSActivated = (userId, workerName, booking, coords) =>
  createNotification({
    userId,
    title: "SOS Alert",
    body: `${workerName} activated an emergency alert on "${booking.title}".`,
    type: "SOS_ACTIVATED",
    data: { bookingId: booking.id, lat: coords?.lat, lng: coords?.lng },
    icon: getIcon("SOS_ACTIVATED"),
  });

export const notifySOSResolved = (workerId, booking) =>
  createNotification({
    userId: workerId,
    title: "SOS resolved",
    body: `Your emergency alert on "${booking.title}" has been resolved.`,
    type: "SOS_RESOLVED",
    data: { bookingId: booking.id },
    icon: getIcon("SOS_RESOLVED"),
  });

// ══════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTIONS
// ══════════════════════════════════════════════════════════════════════════════
export const notifySubscriptionActivated = (userId, tier, role) =>
  createNotification({
    userId,
    title: "Subscription active",
    body: `Your ${tier} plan is now active. Enjoy your premium features!`,
    type: "SUBSCRIPTION_ACTIVATED",
    data: { tier, role },
    icon: getIcon("SUBSCRIPTION_ACTIVATED"),
  });

export const notifySubscriptionExpired = (userId, tier) =>
  createNotification({
    userId,
    title: "Subscription expired",
    body: `Your ${tier} plan has expired. Renew to keep premium features.`,
    type: "SUBSCRIPTION_EXPIRED",
    data: { tier },
    icon: getIcon("SUBSCRIPTION_EXPIRED"),
  });

export const notifySubscriptionCancelled = (userId, tier) =>
  createNotification({
    userId,
    title: "Subscription cancelled",
    body: `Your ${tier} plan was cancelled. Access continues until billing period ends.`,
    type: "SUBSCRIPTION_CANCELLED",
    data: { tier },
    icon: getIcon("SUBSCRIPTION_CANCELLED"),
  });

// ══════════════════════════════════════════════════════════════════════════════
// WITHDRAWALS
// ══════════════════════════════════════════════════════════════════════════════
export const notifyWithdrawalProcessed = (
  workerId,
  amount,
  currency,
  reference,
) =>
  createNotification({
    userId: workerId,
    title: "Withdrawal processed",
    body: `${currency} ${Number(amount).toLocaleString()} sent. Ref: ${reference}`,
    type: "WITHDRAWAL_COMPLETED",
    data: { amount, currency, reference },
    icon: getIcon("WITHDRAWAL_COMPLETED"),
  });

export const notifyWithdrawalFailed = (workerId, amount, currency, reason) =>
  createNotification({
    userId: workerId,
    title: "Withdrawal failed",
    body: `${currency} ${Number(amount).toLocaleString()} failed.${reason ? ` Reason: ${reason}` : ""} Balance restored.`,
    type: "WITHDRAWAL_FAILED",
    data: { amount, currency, reason },
    icon: getIcon("WITHDRAWAL_FAILED"),
  });

// ══════════════════════════════════════════════════════════════════════════════
// VERIFICATION
// ══════════════════════════════════════════════════════════════════════════════
export const notifyVerificationApproved = (workerId) =>
  createNotification({
    userId: workerId,
    title: "Profile verified",
    body: "Your identity is verified! Your profile now shows a verified badge.",
    type: "VERIFICATION_APPROVED",
    data: {},
    icon: getIcon("VERIFICATION_APPROVED"),
  });

export const notifyVerificationRejected = (workerId, reason) =>
  createNotification({
    userId: workerId,
    title: "Verification update",
    body: `Verification not approved.${reason ? ` Reason: ${reason}` : ""} You can resubmit.`,
    type: "VERIFICATION_REJECTED",
    data: { reason },
    icon: getIcon("VERIFICATION_REJECTED"),
  });

// ══════════════════════════════════════════════════════════════════════════════
// FEATURED LISTINGS
// ══════════════════════════════════════════════════════════════════════════════
export const notifyFeaturedActivated = (userId, expiresAt) =>
  createNotification({
    userId,
    title: "Featured listing active",
    body: `Your profile is featured until ${new Date(expiresAt).toLocaleDateString()}.`,
    type: "FEATURED_ACTIVATED",
    data: { expiresAt },
    icon: getIcon("FEATURED_ACTIVATED"),
  });

export const notifyFeaturedExpiring = (userId) =>
  createNotification({
    userId,
    title: "Featured listing expiring",
    body: "Your featured listing expires in 24 hours. Renew to keep your top placement.",
    type: "FEATURED_EXPIRING",
    data: {},
    icon: getIcon("FEATURED_EXPIRING"),
  });
