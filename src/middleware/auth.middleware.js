// src/middleware/auth.middleware.js
import jwt from "jsonwebtoken";
import prisma from "../config/database.js";

// ─── protect ──────────────────────────────────────────────────────────────────
// Requires a valid Bearer JWT. Attaches user to req.user.
export const protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : null;

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "Not authorised — token missing" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      // Give a specific message for expired tokens so clients can refresh
      if (jwtErr.name === "TokenExpiredError") {
        return res
          .status(401)
          .json({
            success: false,
            message: "Token expired",
            code: "TOKEN_EXPIRED",
          });
      }
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

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

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Account not found" });
    }
    if (user.isBanned) {
      return res
        .status(403)
        .json({ success: false, message: "Account has been suspended" });
    }
    if (!user.isActive) {
      return res
        .status(403)
        .json({ success: false, message: "Account is inactive" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("protect middleware error:", err.message);
    res.status(401).json({ success: false, message: "Authentication failed" });
  }
};

// ─── optionalProtect ──────────────────────────────────────────────────────────
// Attaches user to req.user if a valid token is present, but does not block
// the request if no token or an invalid token is provided.
// Use for public routes that have enhanced behaviour for authenticated users.
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

    if (user?.isActive && !user?.isBanned) {
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
    // Guard: protect should always run first, but be defensive
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Not authorised — please log in" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(" or ")}`,
      });
    }
    next();
  };
