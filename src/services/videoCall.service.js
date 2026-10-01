// src/services/videoCall.service.js
// ─────────────────────────────────────────────────────────────────────────────
// Central helper for generating video call room URLs.
//
// The actual video calling is handled by a self-hosted MiroTalk P2P server
// running on the same VPS. This service just builds the URL that clients
// (web or mobile app) navigate to.
//
// To swap providers later (LiveKit, Daily, etc.), change CALL_BASE_URL in
// .env and this file — nothing else needs to change.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base URL of the self-hosted MiroTalk P2P server.
 * Set CALL_BASE_URL in .env on the server. Defaults to a subdomain of
 * skilledproz.com that you'll set up via Caddy.
 */
export const CALL_BASE_URL =
  process.env.CALL_BASE_URL || "https://call.skilledproz.com";

/**
 * Build the full room URL for a video call.
 *
 * MiroTalk P2P accepts a simple GET URL format:
 *   https://call.skilledproz.com/<roomId>
 *
 * Any user who opens that URL with a valid camera/mic gets dropped into
 * the room. First user = broadcaster, subsequent users = peers.
 *
 * @param {string} roomId  Room identifier stored on VideoCall.roomId
 * @returns {string}       Full URL clients can navigate to
 */
export function buildCallUrl(roomId) {
  if (!roomId) throw new Error("buildCallUrl: roomId is required");
  // MiroTalk P2P uses `/<room>` format. Clean the roomId just in case.
  const safe = encodeURIComponent(roomId.replace(/[^a-zA-Z0-9_-]/g, "-"));
  return `${CALL_BASE_URL}/${safe}`;
}

/**
 * Extract a display-friendly title for a call.
 * Currently unused but reserved for future "incoming call" UIs.
 */
export function buildCallTitle({ bookingTitle, callerName }) {
  return `📹 ${callerName} — ${bookingTitle}`;
}
