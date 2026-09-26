// src/middleware/role.middleware.js
import { sendError } from "../utils/response.js";

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, "Not authenticated", 401);
    }

    if (!roles.includes(req.user.role)) {
      return sendError(
        res,
        `Access denied. Required role: ${roles.join(" or ")}`,
        403,
      );
    }

    next();
  };
};

export const requireWorker = requireRole("WORKER");
export const requireHirer = requireRole("HIRER");
export const requireAdmin = requireRole("ADMIN");
