// src/services/voiceCall.service.js
// ─────────────────────────────────────────────────────────────────────────────
// Helper for building voice call room URLs.
//
// Reuses the self-hosted MiroTalk instance on call.skilledproz.com. Video
// calls use `skp-<uuid>` room IDs; voice calls use `skp-voice-<uuid>` so
// they're visually distinguishable in logs and analytics.
//
// The MiroTalk query params below trigger audio-only mode (no camera).
// ─────────────────────────────────────────────────────────────────────────────

const CALL_BASE_URL =
  process.env.CALL_BASE_URL || "https://call.skilledproz.com";

/**
 * Build the public MiroTalk URL for a voice call.
 *
 * @param {string} roomId - The room ID stored in the DB (e.g. "skp-voice-abc123")
 * @returns {string} Full URL to open in a browser or WebView
 */
export function buildVoiceCallUrl(roomId) {
  if (!roomId) return null;

  const url = new URL(`${CALL_BASE_URL}/${roomId}`);
  // MiroTalk uses these params to trigger the audio-only join flow.
  url.searchParams.set("audio", "1");
  url.searchParams.set("video", "0");
  url.searchParams.set("noti", "0"); // suppress share modal on entry
  return url.toString();
}

/**
 * Build a fresh room ID for a new voice call.
 * Prefixed with `skp-voice-` to distinguish from video calls (`skp-`).
 *
 * @param {string} uuid - A generated UUID (shortened to 12 chars)
 * @returns {string} Room ID like "skp-voice-a1b2c3d4e5f6"
 */
export function buildVoiceRoomId(uuid) {
  return `skp-voice-${uuid.slice(0, 12)}`;
}
