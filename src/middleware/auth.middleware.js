// src/middleware/auth.middleware.js
import jwt from "jsonwebtoken";
import prisma from "../config/database.js";

// ─── protect ──────────────────────────────────────────────────────────────────
// Requires a valid Bearer JWT. Attaches user to req.user.
//
// On every request, we:
//   1. Verify the JWT signature.
//   2. Load the user from the DB (fast — indexed by UUID PK).
//   3. Reject banned / deleted / missing users with specific codes so the
//      frontend can force-logout and show the right message.
//
// We deliberately DO NOT cache the user here. A banned user must be locked
// out on the very next request, not 60 seconds later.
//
// Response codes:
//   NO_TOKEN            → 401  no Authorization header
//   TOKEN_EXPIRED       → 401  JWT expired
//   TOKEN_INVALID       → 401  JWT signature invalid
//   ACCOUNT_NOT_FOUND   → 401  user row deleted from DB
//   ACCOUNT_DELETED     → 403  user.isActive === false
//   ACCOUNT_BANNED      → 403  user.isBanned === true
export const protect = async (req, res, next) => {
  try {
    // ── 1. Extract token ────────────────────────────────────────────────────
    const token = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        code: "NO_TOKEN",
        message: "Not authorised — token missing",
      });
    }

    // ── 2. Verify JWT ───────────────────────────────────────────────────────
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      if (jwtErr.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          code: "TOKEN_EXPIRED",
          message: "Token expired",
        });
      }
      return res.status(401).json({
        success: false,
        code: "TOKEN_INVALID",
        message: "Invalid token",
      });
    }

    // ── 3. Load user & check account state (ALWAYS from DB — no cache) ──────
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        isActive: true,
        isBanned: true,
      },
    });

    // 3a — user was hard-deleted
    if (!user) {
      return res.status(401).json({
        success: false,
        code: "ACCOUNT_NOT_FOUND",
        message:
          "This account has been deleted. Contact support if this is a mistake.",
      });
    }

    // 3b — soft-deleted / deactivated
    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_DELETED",
        message:
          "This account has been deactivated. Contact support to restore access.",
      });
    }

    // 3c — banned
    if (user.isBanned === true) {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_BANNED",
        message:
          "This account has been suspended. Contact support if you believe this is a mistake.",
      });
    }

    // ── 4. Attach user & continue ───────────────────────────────────────────
    req.user = user;
    next();
  } catch (err) {
    console.error("protect middleware error:", err.message);
    return res.status(401).json({
      success: false,
      code: "AUTH_CHECK_FAILED",
      message: "Authentication failed",
    });
  }
};

// ─── optionalProtect ──────────────────────────────────────────────────────────
// Attaches user to req.user if a valid token is present, but does not block
// the request if no token or an invalid token is provided.
// Use for public routes that have enhanced behaviour for authenticated users.
//
// NOTE: banned/deleted users are treated as guests here (req.user = null),
// so public routes remain usable by everyone, and the frontend will still
// see them as logged out on the next authenticated request.
export const optionalProtect = async (req, res, next) => {
  req.user = null; // default — guest
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return next();

    const token = authHeader.split(" ")[1];
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        role: true,
        email: true,
        firstName: true,
        isActive: true,
        isBanned: true,
      },
    });

    // Only attach if the account is fully valid
    if (user && user.isActive !== false && user.isBanned !== true) {
      req.user = user;
    }
  } catch {
    // Invalid / expired token — treat as guest, don't block
  }
  next();
};

// ─── requireRole ─────────────────────────────────────────────────────────────
// Must be used AFTER protect middleware.
// Guards a route to specific roles.
//
// Usage:
//   router.get("/admin", protect, requireRole("ADMIN"), handler);
//   router.post("/job",  protect, requireRole("HIRER", "ADMIN"), handler);
export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        code: "NO_TOKEN",
        message: "Not authorised — please log in",
      });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        code: "INSUFFICIENT_ROLE",
        message: `Access denied. Required role: ${roles.join(" or ")}`,
      });
    }
    next();
  };
