import { errorResponse } from "../utils/response.js";

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, "Not authenticated", 401);
    }

    if (!roles.includes(req.user.role)) {
      return errorResponse(
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
