// src/utils/auditLog.js
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight non-blocking audit logger.
// Import this into any controller that performs admin actions.
//
// USAGE:
//   import { logAdminAction } from "../utils/auditLog.js";
//
//   await logAdminAction({
//     req,
//     adminId:     req.user.id,
//     action:      "USER_BANNED",
//     targetType:  "USER",
//     targetId:    userId,
//     description: `Banned user ${user.email} — Reason: ${reason}`,
//     before:      { isBanned: false, isActive: true },
//     after:       { isBanned: true,  isActive: false },
//     meta:        { reason },
//   });
//
// DESIGN PRINCIPLES:
//   - Never throws — errors are caught and logged to console only
//   - Never blocks the main response — awaited but won't fail the request
//   - IP address and user-agent extracted automatically from req
//   - before/after are optional JSON snapshots for diffing
//   - meta is a free-form object for any extra context
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../config/database.js";

/**
 * Write an audit log entry.
 *
 * @param {object} opts
 * @param {object}  opts.req          - Express request (for IP + UA extraction)
 * @param {string}  opts.adminId      - ID of the admin performing the action
 * @param {string}  opts.action       - AuditAction enum value
 * @param {string}  opts.targetType   - AuditTargetType enum value
 * @param {string}  [opts.targetId]   - ID of the affected record (null for system actions)
 * @param {string}  opts.description  - Human-readable one-line summary
 * @param {object}  [opts.before]     - State snapshot before the action
 * @param {object}  [opts.after]      - State snapshot after the action
 * @param {object}  [opts.meta]       - Extra context (reason, amount, note, etc.)
 * @param {string}  [opts.result]     - "SUCCESS" | "FAILED" | "PARTIAL"
 * @param {string}  [opts.errorMessage] - Error detail when result = "FAILED"
 */
export async function logAdminAction({
  req,
  adminId,
  action,
  targetType,
  targetId = null,
  description,
  before = null,
  after = null,
  meta = null,
  result = "SUCCESS",
  errorMessage = null,
}) {
  try {
    // Extract client IP — handle proxies, load balancers, Railway
    const ipAddress = req
      ? req.headers["x-real-ip"] ||
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.socket?.remoteAddress ||
        null
      : null;

    // Truncate user-agent to avoid DB column overflow
    const userAgent = req
      ? req.headers["user-agent"]?.slice(0, 255) || null
      : null;

    // Sanitise JSON fields — strip circular references, undefined, functions
    const sanitise = (obj) => {
      if (!obj) return null;
      try {
        return JSON.parse(JSON.stringify(obj));
      } catch {
        return null;
      }
    };

    await prisma.auditLog.create({
      data: {
        adminId,
        action,
        targetType,
        targetId: targetId || null,
        description: String(description).slice(0, 500),
        before: sanitise(before),
        after: sanitise(after),
        meta: sanitise(meta),
        result,
        errorMessage: errorMessage ? String(errorMessage).slice(0, 500) : null,
        ipAddress,
        userAgent,
      },
    });
  } catch (err) {
    // Audit logging must NEVER crash the main request
    console.error("[AuditLog] Write failed:", err.message);
  }
}

/**
 * Convenience wrapper for logging a FAILED admin action.
 */
export async function logAdminFailure({
  req,
  adminId,
  action,
  targetType,
  targetId,
  description,
  errorMessage,
  meta,
}) {
  return logAdminAction({
    req,
    adminId,
    action,
    targetType,
    targetId,
    description,
    meta,
    result: "FAILED",
    errorMessage,
  });
}

/**
 * Extract a clean user snapshot for the before/after fields.
 * Strips password, tokens, and other sensitive fields.
 */
export function userSnapshot(user) {
  if (!user) return null;
  const {
    password,
    refreshToken,
    emailVerifyToken,
    passwordResetToken,
    passwordResetExpiry,
    ...safe
  } = user;
  return safe;
}
