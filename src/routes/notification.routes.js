// src/routes/notification.routes.js
import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { notificationRequestLimiter } from "../middleware/rateLimit.middleware.js";
import {
  // In-app notifications
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
  // Device token management (push notifications)
  registerDeviceToken,
  removeDeviceToken,
  removeAllDeviceTokens,
  getDeviceTokens,
  // Support request
  submitNotificationRequest,
} from "../controllers/notification.controller.js";

const router = Router();
router.use(protect);

// ── In-app notifications ──────────────────────────────────────────────────────
router.get("/", getNotifications);
router.patch("/read-all", markAllAsRead);
router.patch("/:id/read", markAsRead);
router.delete("/clear-all", clearAllNotifications);
router.delete("/:id", deleteNotification);

// ── Support / custom requests ─────────────────────────────────────────────────
// Rate limited — prevents users from spamming support requests
router.post("/request", notificationRequestLimiter, submitNotificationRequest);

// ── Device token management (mobile push notifications) ───────────────────────
//
// Register a push token (call on every app launch after login):
//   POST /api/notifications/token
//   Body: { token: "ExponentPushToken[...]", platform: "ios" | "android" }
router.post("/token", registerDeviceToken);

// Remove a specific token (call on logout):
//   DELETE /api/notifications/token
//   Body: { token: "ExponentPushToken[...]" }
router.delete("/token", removeDeviceToken);

// Remove all tokens for this user (logout from all devices):
//   DELETE /api/notifications/tokens
router.delete("/tokens", removeAllDeviceTokens);

// View registered tokens (useful for debugging):
//   GET /api/notifications/tokens
router.get("/tokens", getDeviceTokens);

export default router;
