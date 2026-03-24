import prisma from "../config/database.js";

export const createNotification = async ({
  userId,
  title,
  body,
  type,
  data = {},
}) => {
  try {
    const notification = await prisma.notification.create({
      data: { userId, title, body, type, data },
    });
    return notification;
  } catch (err) {
    console.error("createNotification error:", err);
  }
};

export const NOTIFICATION_TYPES = {
  BOOKING_REQUEST: "BOOKING_REQUEST",
  BOOKING_ACCEPTED: "BOOKING_ACCEPTED",
  BOOKING_REJECTED: "BOOKING_REJECTED",
  BOOKING_COMPLETED: "BOOKING_COMPLETED",
  BOOKING_CANCELLED: "BOOKING_CANCELLED",
  PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
  PAYMENT_RELEASED: "PAYMENT_RELEASED",
  NEW_MESSAGE: "NEW_MESSAGE",
  NEW_REVIEW: "NEW_REVIEW",
  ACCOUNT_VERIFIED: "ACCOUNT_VERIFIED",
};

export const notifyBookingRequest = (workerId, hirerName, jobTitle) =>
  createNotification({
    userId: workerId,
    title: "New booking request",
    body: `${hirerName} wants to book you for: ${jobTitle}`,
    type: NOTIFICATION_TYPES.BOOKING_REQUEST,
  });

export const notifyBookingAccepted = (hirerId, workerName, jobTitle) =>
  createNotification({
    userId: hirerId,
    title: "Booking accepted",
    body: `${workerName} accepted your booking: ${jobTitle}`,
    type: NOTIFICATION_TYPES.BOOKING_ACCEPTED,
  });

export const notifyBookingRejected = (hirerId, workerName, jobTitle) =>
  createNotification({
    userId: hirerId,
    title: "Booking declined",
    body: `${workerName} declined your booking: ${jobTitle}`,
    type: NOTIFICATION_TYPES.BOOKING_REJECTED,
  });

export const notifyBookingCompleted = (hirerId, workerName) =>
  createNotification({
    userId: hirerId,
    title: "Job completed",
    body: `${workerName} has marked the job as complete. Please leave a review.`,
    type: NOTIFICATION_TYPES.BOOKING_COMPLETED,
  });

export const notifyPaymentReceived = (hirerId, amount, currency) =>
  createNotification({
    userId: hirerId,
    title: "Payment held in escrow",
    body: `${currency} ${amount} is held securely until the job is complete.`,
    type: NOTIFICATION_TYPES.PAYMENT_RECEIVED,
  });

export const notifyPaymentReleased = (workerId, amount, currency) =>
  createNotification({
    userId: workerId,
    title: "Payment released",
    body: `${currency} ${amount} has been released to your account.`,
    type: NOTIFICATION_TYPES.PAYMENT_RELEASED,
  });

export const notifyNewMessage = (receiverId, senderName) =>
  createNotification({
    userId: receiverId,
    title: "New message",
    body: `You have a new message from ${senderName}`,
    type: NOTIFICATION_TYPES.NEW_MESSAGE,
  });

export const notifyNewReview = (workerId, hirerName, rating) =>
  createNotification({
    userId: workerId,
    title: "New review received",
    body: `${hirerName} left you a ${rating}-star review.`,
    type: NOTIFICATION_TYPES.NEW_REVIEW,
  });
