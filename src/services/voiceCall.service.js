// src/services/voiceCall.service.js
// ─────────────────────────────────────────────────────────────────────────────
// Helper for building call room URLs.
//
// Reuses the self-hosted MiroTalk instance on call.skilledproz.com.
//
//   • "voice" calls → audio=1 & video=0 (mic only, no camera prompt)
//   • "video" calls → audio=1 & video=1 (camera + mic enabled)
//
// Room IDs are prefixed with `skp-voice-` regardless of type — the callType
// column on the VoiceCall row is the source of truth, not the room ID.
// ─────────────────────────────────────────────────────────────────────────────

const CALL_BASE_URL =
  process.env.CALL_BASE_URL || "https://call.skilledproz.com";

/**
 * Build the public MiroTalk URL for a call.
 *
 * @param {string} roomId - The room ID stored in the DB (e.g. "skp-voice-abc123")
 * @param {"voice"|"video"} callType - Audio-only vs. video-enabled
 * @returns {string|null} Full URL to open in a browser or WebView
 */
export function buildVoiceCallUrl(roomId, callType = "voice") {
  if (!roomId) return null;

  const url = new URL(`${CALL_BASE_URL}/${roomId}`);
  url.searchParams.set("noti", "0"); // suppress share modal

  if (callType === "video") {
    // Video call — enable camera and mic
    url.searchParams.set("audio", "1");
    url.searchParams.set("video", "1");
  } else {
    // Voice call — mic only, no camera prompt
    url.searchParams.set("audio", "1");
    url.searchParams.set("video", "0");
  }

  return url.toString();
}

/**
 * Build a fresh room ID for a new call.
 * Prefixed with `skp-voice-` to distinguish from booking video calls (`skp-`).
 *
 * @param {string} uuid - A generated UUID (shortened to 12 chars)
 * @returns {string} Room ID like "skp-voice-a1b2c3d4e5f6"
 */
export function buildVoiceRoomId(uuid) {
  return `skp-voice-${uuid.slice(0, 12)}`;
}
