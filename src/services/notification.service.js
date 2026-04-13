// src/services/notification.service.js
// Complete in-app notification service — handles all event types
// Call these from controllers after the relevant DB operation

import prisma from "../config/database.js";
import { getIO } from "../socket/index.js";

// ── Core create + emit ─────────────────────────────────────────────────────────
export async function createNotification({
  userId,
  title,
  body,
  type,
  data = {},
}) {
  try {
    const notification = await prisma.notification.create({
      data: { userId, title, body, type, data },
    });

    // Emit real-time via Socket.IO if available
    try {
      const io = getIO();
      if (io) {
        io.to(`user:${userId}`).emit("notification", {
          id: notification.id,
          title,
          body,
          type,
          data,
          isRead: false,
          createdAt: notification.createdAt,
        });
      }
    } catch (_) {}

    return notification;
  } catch (err) {
    console.error("[Notification] Failed to create:", err.message);
  }
}

// ── Notification type constants ────────────────────────────────────────────────
export const N = {
  // Bookings
  BOOKING_REQUEST: "BOOKING_REQUEST",
  BOOKING_ACCEPTED: "BOOKING_ACCEPTED",
  BOOKING_REJECTED: "BOOKING_REJECTED",
  BOOKING_CANCELLED: "BOOKING_CANCELLED",
  BOOKING_IN_PROGRESS: "BOOKING_IN_PROGRESS",
  BOOKING_COMPLETED: "BOOKING_COMPLETED",
  // Payments
  PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
  PAYMENT_RELEASED: "PAYMENT_RELEASED",
  PAYMENT_REFUNDED: "PAYMENT_REFUNDED",
  // Reviews
  NEW_REVIEW: "NEW_REVIEW",
  REVIEW_REQUEST: "REVIEW_REQUEST",
  // Jobs
  JOB_APPLICATION: "JOB_APPLICATION",
  APPLICATION_STATUS: "APPLICATION_STATUS",
  // Messages
  NEW_MESSAGE: "NEW_MESSAGE",
  // Profile
  PROFILE_VIEWED: "PROFILE_VIEWED",
  // Account
  ACCOUNT_VERIFIED: "ACCOUNT_VERIFIED",
  LOGIN_ALERT: "LOGIN_ALERT",
};

// ══════════════════════════════════════════════════════════════════════════════
// BOOKING NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

// Worker receives when hirer books them
export const notifyBookingRequest = (workerId, hirerName, booking) =>
  createNotification({
    userId: workerId,
    title: "New booking request 📅",
    body: `${hirerName} wants to book you for "${booking.title}"`,
    type: N.BOOKING_REQUEST,
    data: { bookingId: booking.id },
  });

// Hirer receives when worker accepts
export const notifyBookingAccepted = (hirerId, workerName, booking) =>
  createNotification({
    userId: hirerId,
    title: "Booking accepted ✅",
    body: `${workerName} accepted your booking "${booking.title}". Please pay to confirm.`,
    type: N.BOOKING_ACCEPTED,
    data: { bookingId: booking.id },
  });

// Hirer receives when worker rejects
export const notifyBookingRejected = (hirerId, workerName, booking) =>
  createNotification({
    userId: hirerId,
    title: "Booking declined",
    body: `${workerName} was unable to take "${booking.title}".`,
    type: N.BOOKING_REJECTED,
    data: { bookingId: booking.id },
  });

// Both parties receive when booking is cancelled
export const notifyBookingCancelled = (userId, name, booking, reason) =>
  createNotification({
    userId,
    title: "Booking cancelled",
    body: `The booking "${booking.title}" has been cancelled.${reason ? ` Reason: ${reason}` : ""}`,
    type: N.BOOKING_CANCELLED,
    data: { bookingId: booking.id },
  });

// Hirer receives when worker checks in
export const notifyBookingInProgress = (hirerId, workerName, booking) =>
  createNotification({
    userId: hirerId,
    title: "Job started 🔨",
    body: `${workerName} has checked in for "${booking.title}"`,
    type: N.BOOKING_IN_PROGRESS,
    data: { bookingId: booking.id },
  });

// Hirer receives when worker marks complete
export const notifyBookingCompleted = (hirerId, workerName, booking) =>
  createNotification({
    userId: hirerId,
    title: "Job completed 🎉",
    body: `${workerName} has completed "${booking.title}". Please release payment and leave a review.`,
    type: N.BOOKING_COMPLETED,
    data: { bookingId: booking.id },
  });

// ══════════════════════════════════════════════════════════════════════════════
// PAYMENT NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

// Hirer receives after payment goes to escrow
export const notifyPaymentReceived = (hirerId, amount, currency, booking) =>
  createNotification({
    userId: hirerId,
    title: "Payment held in escrow 💳",
    body: `${currency} ${Number(amount).toLocaleString()} is held securely for "${booking.title}"`,
    type: N.PAYMENT_RECEIVED,
    data: { bookingId: booking.id },
  });

// Worker receives when hirer releases escrow
export const notifyPaymentReleased = (workerId, amount, currency, booking) =>
  createNotification({
    userId: workerId,
    title: "Payment released 💰",
    body: `${currency} ${Number(amount).toLocaleString()} has been released for "${booking.title}"`,
    type: N.PAYMENT_RELEASED,
    data: { bookingId: booking.id },
  });

// User receives when refund is processed
export const notifyPaymentRefunded = (userId, amount, currency, booking) =>
  createNotification({
    userId,
    title: "Refund processed",
    body: `${currency} ${Number(amount).toLocaleString()} refund is on its way for "${booking.title}"`,
    type: N.PAYMENT_REFUNDED,
    data: { bookingId: booking.id },
  });

// ══════════════════════════════════════════════════════════════════════════════
// REVIEW NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

// Both parties receive after job complete — prompt to review
export const notifyReviewRequest = (userId, otherPartyName, booking) =>
  createNotification({
    userId,
    title: "Leave a review ⭐",
    body: `How was your experience with ${otherPartyName}? Leave a review for "${booking.title}"`,
    type: N.REVIEW_REQUEST,
    data: { bookingId: booking.id },
  });

// Worker/hirer receives when they get a new review
export const notifyNewReview = (receiverId, giverName, rating, booking) =>
  createNotification({
    userId: receiverId,
    title: "New review received ⭐",
    body: `${giverName} gave you ${rating} star${rating !== 1 ? "s" : ""} for "${booking.title}"`,
    type: N.NEW_REVIEW,
    data: { bookingId: booking.id, rating },
  });

// ══════════════════════════════════════════════════════════════════════════════
// JOB APPLICATION NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

// Hirer receives when worker applies
export const notifyJobApplication = (hirerId, workerName, job) =>
  createNotification({
    userId: hirerId,
    title: "New job application 📋",
    body: `${workerName} applied for your job "${job.title}"`,
    type: N.JOB_APPLICATION,
    data: { jobPostId: job.id },
  });

// Worker receives when application is accepted
export const notifyApplicationAccepted = (workerId, hirerName, job) =>
  createNotification({
    userId: workerId,
    title: "Application accepted! 🎉",
    body: `Your application for "${job.title}" was accepted by ${hirerName}`,
    type: N.APPLICATION_STATUS,
    data: { jobPostId: job.id, status: "ACCEPTED" },
  });

// Worker receives when application is rejected
export const notifyApplicationRejected = (workerId, job) =>
  createNotification({
    userId: workerId,
    title: "Application update",
    body: `Your application for "${job.title}" was not selected this time.`,
    type: N.APPLICATION_STATUS,
    data: { jobPostId: job.id, status: "REJECTED" },
  });

// ══════════════════════════════════════════════════════════════════════════════
// MESSAGE NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

// Receiver gets notified of a new message
export const notifyNewMessage = (
  receiverId,
  senderName,
  preview,
  conversationId,
) =>
  createNotification({
    userId: receiverId,
    title: `New message from ${senderName} 💬`,
    body: preview
      ? `"${preview.slice(0, 80)}${preview.length > 80 ? "…" : ""}"`
      : "You have a new message",
    type: N.NEW_MESSAGE,
    data: { conversationId, senderName },
  });

// ══════════════════════════════════════════════════════════════════════════════
// PROFILE NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

// Worker/hirer gets notified when someone views their profile
// Call this in getWorkerProfile and getHirerProfile when req.user exists
// and it's not the profile owner's own view
export const notifyProfileViewed = (profileOwnerId, viewerName, viewerRole) =>
  createNotification({
    userId: profileOwnerId,
    title: "Profile viewed 👀",
    body: `${viewerName} (${viewerRole?.toLowerCase() || "user"}) viewed your profile`,
    type: N.PROFILE_VIEWED,
    data: { viewerName, viewerRole },
  });

// ══════════════════════════════════════════════════════════════════════════════
// ACCOUNT NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

// User gets notified of new login
export const notifyLoginAlert = (userId, ip, device) =>
  createNotification({
    userId,
    title: "New login detected 🔐",
    body: `Your account was accessed${ip ? ` from ${ip}` : ""}${device ? ` on ${device}` : ""}. If this wasn't you, change your password immediately.`,
    type: N.LOGIN_ALERT,
    data: { ip, device },
  });

// User gets notified when account is verified
export const notifyAccountVerified = (userId) =>
  createNotification({
    userId,
    title: "Account verified ✅",
    body: "Your identity has been verified. You can now access all features.",
    type: N.ACCOUNT_VERIFIED,
    data: {},
  });

// ══════════════════════════════════════════════════════════════════════════════
// DISPUTE NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

export const notifyDisputeRaised = (userId, raisedByName, booking) =>
  createNotification({
    userId,
    title: "⚠️ Dispute raised",
    body: `${raisedByName} raised a dispute on "${booking.title}". Our team will review within 24–48 hours.`,
    type: "DISPUTE_RAISED",
    data: { bookingId: booking.id },
  });

export const notifyDisputeResolved = (userId, booking, resolution) =>
  createNotification({
    userId,
    title: "✅ Dispute resolved",
    body: `The dispute on "${booking.title}" has been resolved.${resolution ? ` Resolution: ${resolution}` : ""}`,
    type: "DISPUTE_RESOLVED",
    data: { bookingId: booking.id },
  });

// ══════════════════════════════════════════════════════════════════════════════
// SOS NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

export const notifySOSActivated = (userId, workerName, booking, coords) =>
  createNotification({
    userId,
    title: "🚨 SOS Alert — Worker needs help",
    body: `${workerName} activated an emergency alert on booking "${booking.title}".`,
    type: "SOS_ACTIVATED",
    data: { bookingId: booking.id, lat: coords?.lat, lng: coords?.lng },
  });

export const notifySOSResolved = (workerId, booking) =>
  createNotification({
    userId: workerId,
    title: "✅ SOS Alert resolved",
    body: `Your emergency alert on "${booking.title}" has been resolved.`,
    type: "SOS_RESOLVED",
    data: { bookingId: booking.id },
  });

// ══════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

export const notifySubscriptionActivated = (userId, tier, role) =>
  createNotification({
    userId,
    title: "🚀 Subscription activated",
    body: `Your ${tier} plan for ${role?.toLowerCase()} is now active. Enjoy your premium features!`,
    type: "SUBSCRIPTION_ACTIVATED",
    data: { tier, role },
  });

export const notifySubscriptionExpired = (userId, tier) =>
  createNotification({
    userId,
    title: "⚠️ Subscription expired",
    body: `Your ${tier} plan has expired. Renew now to keep your premium features.`,
    type: "SUBSCRIPTION_EXPIRED",
    data: { tier },
  });

export const notifySubscriptionCancelled = (userId, tier) =>
  createNotification({
    userId,
    title: "Subscription cancelled",
    body: `Your ${tier} plan has been cancelled. You'll retain access until the end of your billing period.`,
    type: "SUBSCRIPTION_CANCELLED",
    data: { tier },
  });

// ══════════════════════════════════════════════════════════════════════════════
// WITHDRAWAL NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

export const notifyWithdrawalProcessed = (
  workerId,
  amount,
  currency,
  reference,
) =>
  createNotification({
    userId: workerId,
    title: "💸 Withdrawal processed",
    body: `Your withdrawal of ${currency} ${Number(amount).toLocaleString()} has been sent. Ref: ${reference}`,
    type: "WITHDRAWAL_COMPLETED",
    data: { amount, currency, reference },
  });

export const notifyWithdrawalFailed = (workerId, amount, currency, reason) =>
  createNotification({
    userId: workerId,
    title: "❌ Withdrawal failed",
    body: `Your withdrawal of ${currency} ${Number(amount).toLocaleString()} failed.${reason ? ` Reason: ${reason}` : ""} Your balance has been restored.`,
    type: "WITHDRAWAL_FAILED",
    data: { amount, currency, reason },
  });

// ══════════════════════════════════════════════════════════════════════════════
// VERIFICATION NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

export const notifyVerificationApproved = (workerId) =>
  createNotification({
    userId: workerId,
    title: "✅ Profile verified",
    body: "Your identity has been verified! Your profile now shows a verified badge — this helps you get more bookings.",
    type: "VERIFICATION_APPROVED",
    data: {},
  });

export const notifyVerificationRejected = (workerId, reason) =>
  createNotification({
    userId: workerId,
    title: "Verification update",
    body: `Your verification was not approved.${reason ? ` Reason: ${reason}` : ""} You can resubmit with updated documents.`,
    type: "VERIFICATION_REJECTED",
    data: { reason },
  });

// ══════════════════════════════════════════════════════════════════════════════
// SECURITY NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

export const notifyPasswordChanged = (userId) =>
  createNotification({
    userId,
    title: "🔒 Password changed",
    body: "Your password was successfully changed. If this wasn't you, please contact support immediately.",
    type: "PASSWORD_CHANGED",
    data: {},
  });

export const notifyNewDevice = (userId, ip, device) =>
  createNotification({
    userId,
    title: "🔐 New login detected",
    body: `A login was detected${device ? ` from ${device}` : ""}${ip ? ` (${ip})` : ""}. If this wasn't you, change your password now.`,
    type: "LOGIN_ALERT",
    data: { ip, device },
  });

// ══════════════════════════════════════════════════════════════════════════════
// JOB MATCH NOTIFICATIONS (workers notified when matching job posted)
// ══════════════════════════════════════════════════════════════════════════════

export const notifyNewJobMatch = (workerId, jobTitle, jobId, categoryName) =>
  createNotification({
    userId: workerId,
    title: `📋 New ${categoryName} job posted`,
    body: `A new job matching your skills was just posted: "${jobTitle}". Apply before it fills up!`,
    type: "JOB_MATCH",
    data: { jobPostId: jobId, categoryName },
  });

// ══════════════════════════════════════════════════════════════════════════════
// FEATURED LISTING NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

export const notifyFeaturedActivated = (userId, expiresAt) =>
  createNotification({
    userId,
    title: "⭐ Featured listing active",
    body: `Your profile is now featured in search results until ${new Date(expiresAt).toLocaleDateString()}.`,
    type: "FEATURED_ACTIVATED",
    data: { expiresAt },
  });

export const notifyFeaturedExpiring = (userId) =>
  createNotification({
    userId,
    title: "⚠️ Featured listing expiring soon",
    body: "Your featured listing expires in 24 hours. Renew to keep your top placement.",
    type: "FEATURED_EXPIRING",
    data: {},
  });
