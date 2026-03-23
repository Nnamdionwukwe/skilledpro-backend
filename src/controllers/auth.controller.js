import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
  const refreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
  });
  return { accessToken, refreshToken };
};

export const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, role, phone, country, city, currency } = req.body;
    if (!email || !password || !firstName || !lastName || !role) {
      return sendError(res, "Please provide all required fields", 400);
    }
    if (!["HIRER", "WORKER"].includes(role)) {
      return sendError(res, "Role must be HIRER or WORKER", 400);
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return sendError(res, "Email already registered", 409);

    const hashed = await bcrypt.hash(password, 12);
    const emailVerifyToken = uuidv4();

    const user = await prisma.user.create({
      data: {
        email, password: hashed, firstName, lastName, role,
        phone, country, city,
        currency: currency || "USD",
        emailVerifyToken,
        workerProfile: role === "WORKER" ? { create: { title: firstName + " " + lastName, hourlyRate: 0 } } : undefined,
        hirerProfile: role === "HIRER" ? { create: {} } : undefined,
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true },
    });

    const { accessToken, refreshToken } = generateTokens(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await bcrypt.hash(refreshToken, 8) },
    });

    return sendResponse(res, {
      status: 201,
      message: "Account created successfully",
      data: { user, accessToken, refreshToken },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Registration failed");
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return sendError(res, "Email and password required", 400);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return sendError(res, "Invalid credentials", 401);
    if (user.isBanned) return sendError(res, "Account suspended", 403);

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return sendError(res, "Invalid credentials", 401);

    const { accessToken, refreshToken } = generateTokens(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await bcrypt.hash(refreshToken, 8), lastSeen: new Date() },
    });

    const { password: _, refreshToken: __, emailVerifyToken: ___, ...safeUser } = user;
    return sendResponse(res, { message: "Login successful", data: { user: safeUser, accessToken, refreshToken } });
  } catch (err) {
    console.error(err);
    return sendError(res, "Login failed");
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return sendError(res, "Token required", 400);
    const user = await prisma.user.findFirst({ where: { emailVerifyToken: token } });
    if (!user) return sendError(res, "Invalid or expired token", 400);
    await prisma.user.update({ where: { id: user.id }, data: { isEmailVerified: true, emailVerifyToken: null } });
    return sendResponse(res, { message: "Email verified successfully" });
  } catch (err) {
    return sendError(res, "Verification failed");
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return sendError(res, "Email required", 400);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = uuidv4();
      const expiry = new Date(Date.now() + 60 * 60 * 1000);
      await prisma.user.update({ where: { id: user.id }, data: { passwordResetToken: token, passwordResetExpiry: expiry } });
    }
    return sendResponse(res, { message: "If that email exists, a reset link has been sent" });
  } catch (err) {
    return sendError(res, "Request failed");
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return sendError(res, "Token and password required", 400);
    if (password.length < 8) return sendError(res, "Password must be at least 8 characters", 400);
    const user = await prisma.user.findFirst({
      where: { passwordResetToken: token, passwordResetExpiry: { gt: new Date() } },
    });
    if (!user) return sendError(res, "Invalid or expired reset token", 400);
    const hashed = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, passwordResetToken: null, passwordResetExpiry: null, refreshToken: null },
    });
    return sendResponse(res, { message: "Password reset successfully" });
  } catch (err) {
    return sendError(res, "Reset failed");
  }
};

export const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return sendError(res, "Refresh token required", 400);
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user || !user.refreshToken) return sendError(res, "Invalid token", 401);
    const valid = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!valid) return sendError(res, "Invalid token", 401);
    const tokens = generateTokens(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await bcrypt.hash(tokens.refreshToken, 8) },
    });
    return sendResponse(res, { message: "Token refreshed", data: tokens });
  } catch (err) {
    return sendError(res, "Token refresh failed", 401);
  }
};

export const logout = async (req, res) => {
  try {
    await prisma.user.update({ where: { id: req.user.id }, data: { refreshToken: null } });
    return sendResponse(res, { message: "Logged out successfully" });
  } catch (err) {
    return sendError(res, "Logout failed");
  }
};

export const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, avatar: true, phone: true, country: true,
        city: true, currency: true, isEmailVerified: true,
        createdAt: true, lastSeen: true,
        workerProfile: true, hirerProfile: true,
      },
    });
    return sendResponse(res, { data: { user } });
  } catch (err) {
    return sendError(res, "Failed to fetch profile");
  }
};
