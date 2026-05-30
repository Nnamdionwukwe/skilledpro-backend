// src/services/push.service.js
// ─────────────────────────────────────────────────────────────────────────────
// Expo Push Notification service for SkilledProz mobile app.
//
// No SDK needed — uses Expo's REST API directly.
// Handles: batching, error handling, automatic invalid-token cleanup.
//
// Expo push token format:  ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]
// FCM token format:        long string starting with "f" (for Android via Expo)
//
// Usage from any service/controller:
//   import { sendPushToUser, sendPushToMany } from "./push.service.js";
//
//   await sendPushToUser(userId, {
//     title: "New booking request 📅",
//     body:  "Emeka wants to book you for Plumbing",
//     data:  { bookingId: "abc-123", screen: "BookingDetail" },
//   });
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../config/database.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPT_URL = "https://exp.host/--/api/v2/push/getReceipts";
const BATCH_SIZE = 100; // Expo recommends max 100 per request

// ── Validate Expo push token format ──────────────────────────────────────────
function isValidExpoPushToken(token) {
  return (
    typeof token === "string" &&
    (token.startsWith("ExponentPushToken[") ||
      token.startsWith("ExpoPushToken[") ||
      // FCM tokens are long strings without spaces
      (token.length > 50 && !token.includes(" ")))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// § 1  LOW-LEVEL: Send to a list of raw token strings
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {string[]} tokens   - Array of Expo push tokens
 * @param {object}   payload  - { title, body, data?, badge?, sound? }
 * @returns {string[]}        - List of invalid tokens (so caller can clean DB)
 */
export async function sendRawPushBatch(tokens, payload) {
  if (!tokens || tokens.length === 0) return [];

  const valid = tokens.filter(isValidExpoPushToken);
  if (valid.length === 0) return [];

  const { title, body, data = {}, badge, sound = "default" } = payload;

  // Chunk into batches of 100
  const batches = [];
  for (let i = 0; i < valid.length; i += BATCH_SIZE) {
    batches.push(valid.slice(i, i + BATCH_SIZE));
  }

  const invalidTokens = [];

  for (const batch of batches) {
    const messages = batch.map((token) => ({
      to: token,
      sound,
      title,
      body,
      data,
      ...(badge !== undefined ? { badge } : {}),
    }));

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
        },
        body: JSON.stringify(messages),
      });

      if (!res.ok) {
        console.error(
          `[Push] Expo API error ${res.status}: ${await res.text()}`,
        );
        continue;
      }

      const result = await res.json();

      // Check each ticket for invalid tokens
      if (Array.isArray(result.data)) {
        result.data.forEach((ticket, idx) => {
          if (ticket.status === "error") {
            const detail = ticket.details?.error;
            if (
              detail === "DeviceNotRegistered" ||
              detail === "InvalidCredentials"
            ) {
              invalidTokens.push(batch[idx]);
            }
            console.warn(
              `[Push] Token ${batch[idx]?.slice(0, 30)}… error: ${detail}`,
            );
          }
        });
      }
    } catch (err) {
      console.error("[Push] Batch send failed:", err.message);
    }
  }

  return invalidTokens;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 2  Send push to a single user (looks up their device tokens from DB)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {string} userId
 * @param {object} payload  - { title, body, data?, badge?, sound? }
 */
export async function sendPushToUser(userId, payload) {
  try {
    const records = await prisma.deviceToken.findMany({
      where: { userId, active: true },
      select: { id: true, token: true },
    });
    if (records.length === 0) return;

    const tokens = records.map((r) => r.token);
    const invalid = await sendRawPushBatch(tokens, payload);

    // Deactivate invalid tokens so we don't keep trying them
    if (invalid.length > 0) {
      await prisma.deviceToken.updateMany({
        where: { userId, token: { in: invalid } },
        data: { active: false },
      });
    }
  } catch (err) {
    console.error(`[Push] sendPushToUser(${userId}) failed:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3  Send push to multiple users at once
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {string[]} userIds
 * @param {object}   payload
 */
export async function sendPushToMany(userIds, payload) {
  if (!userIds || userIds.length === 0) return;
  try {
    const records = await prisma.deviceToken.findMany({
      where: { userId: { in: userIds }, active: true },
      select: { id: true, token: true },
    });
    if (records.length === 0) return;

    const tokens = records.map((r) => r.token);
    const invalid = await sendRawPushBatch(tokens, payload);

    if (invalid.length > 0) {
      await prisma.deviceToken.updateMany({
        where: { token: { in: invalid } },
        data: { active: false },
      });
    }
  } catch (err) {
    console.error("[Push] sendPushToMany failed:", err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 4  Broadcast push to all active users (or filtered by role)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {object} payload
 * @param {string?} role  - "HIRER" | "WORKER" | null (all users)
 */
export async function broadcastPush(payload, role = null) {
  try {
    const records = await prisma.deviceToken.findMany({
      where: {
        active: true,
        ...(role ? { user: { role } } : {}),
        user: { isActive: true, isBanned: false },
      },
      select: { token: true },
    });
    if (records.length === 0) return;

    const tokens = records.map((r) => r.token);
    const invalid = await sendRawPushBatch(tokens, payload);

    if (invalid.length > 0) {
      await prisma.deviceToken.updateMany({
        where: { token: { in: invalid } },
        data: { active: false },
      });
    }

    console.log(
      `[Push] Broadcast sent to ${tokens.length} device(s)${role ? ` (${role})` : ""}`,
    );
  } catch (err) {
    console.error("[Push] Broadcast failed:", err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5  Device token management helpers (called from notification.controller.js)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register or reactivate a device token for a user.
 * Safe to call on every app launch — upserts, so no duplicates.
 */
export async function upsertDeviceToken(userId, token, platform = null) {
  if (!isValidExpoPushToken(token)) {
    throw new Error("Invalid push token format");
  }
  return prisma.deviceToken.upsert({
    where: { userId_token: { userId, token } },
    update: { active: true, platform, updatedAt: new Date() },
    create: { userId, token, platform, active: true },
  });
}

/**
 * Deactivate a specific token (call on logout).
 */
export async function deactivateDeviceToken(userId, token) {
  return prisma.deviceToken.updateMany({
    where: { userId, token },
    data: { active: false },
  });
}

/**
 * Deactivate ALL tokens for a user (call when banning / account deletion).
 */
export async function deactivateAllUserTokens(userId) {
  return prisma.deviceToken.updateMany({
    where: { userId },
    data: { active: false },
  });
}
