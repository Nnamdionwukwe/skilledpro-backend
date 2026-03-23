import jwt from "jsonwebtoken";
import prisma from "../config/database.js";

export const protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.startsWith("Bearer")
      ? req.headers.authorization.split(" ")[1]
      : null;

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "Not authorised" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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

    if (!user || !user.isActive || user.isBanned) {
      return res
        .status(401)
        .json({ success: false, message: "Account unavailable" });
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ success: false, message: "Invalid token" });
  }
};

export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    next();
  };
