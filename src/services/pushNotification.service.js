// src/services/pushNotification.service.js
import { Expo } from "expo-server-sdk";
import prisma from "../config/database.js"; // Adjust path if needed

// Create a new Expo SDK client
const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN, // Optional, but recommended for security
});

/**
 * Sends a high-priority push notification to a user to trigger a native call UI.
 * @param {string} recipientUserId - The ID of the user who should receive the call.
 * @param {object} callData - The data payload for the call.
 */
export async function sendIncomingCallPush(recipientUserId, callData) {
  try {
    // 1. Fetch the recipient's Expo Push Token from your database
    // Assuming you have a DeviceToken model as seen in previous schemas
    const deviceTokens = await prisma.deviceToken.findMany({
      where: { userId: recipientUserId, active: true },
      select: { token: true },
    });

    if (!deviceTokens || deviceTokens.length === 0) {
      console.log(`No push token found for user ${recipientUserId}`);
      return;
    }

    // 2. Build the message payload
    const messages = deviceTokens
      .map((dt) => {
        const pushToken = dt.token;

        // Check that the token is valid
        if (!Expo.isExpoPushToken(pushToken)) {
          console.error(
            `Push token ${pushToken} is not a valid Expo push token`,
          );
          return null;
        }

        return {
          to: pushToken,
          // High priority is CRITICAL for waking the app on Android
          priority: "high",
          // The 'data' object is what your app will receive in the background
          data: {
            type: "INCOMING_CALL", // Custom identifier
            callType: callData.callType, // "BOOKING" or "JOB_INTERVIEW"
            callId: callData.callId,
            roomId: callData.roomId,
            callUrl: callData.callUrl,
            callerName: callData.callerName,
            title: callData.title,
            // Include context IDs
            bookingId: callData.bookingId || null,
            jobApplicationId: callData.jobApplicationId || null,
          },
          // iOS requires contentAvailable to wake the app
          contentAvailable: true,
          // Optional: You can add a title/body for a fallback notification
          // title: "Incoming Call",
          // body: `${callData.callerName} is calling you...`,
          // channelId: "incoming_calls", // Required for Android 8.0+
        };
      })
      .filter(Boolean); // Remove nulls

    // 3. Send the notifications
    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        console.log("Push tickets sent:", ticketChunk);
      } catch (error) {
        console.error("Error sending push chunk:", error);
      }
    }
  } catch (error) {
    console.error("Error in sendIncomingCallPush:", error);
  }
}
