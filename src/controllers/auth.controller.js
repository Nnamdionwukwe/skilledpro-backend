// src/controllers/auth.controller.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import prisma from "../config/database.js";
import { asyncHandler } from "../middleware/error.middleware.js";
import {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendLoginAlertEmail,
} from "../services/email.service.js";

import {
  notifyPasswordChanged,
  notifyNewDevice,
} from "../services/notification.service.js";

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateToken(id, secret, expiresIn) {
  return jwt.sign({ id }, secret, { expiresIn });
}

function generateTokens(userId) {
  const accessToken = generateToken(
    userId,
    process.env.JWT_SECRET,
    process.env.JWT_EXPIRES_IN || "7d",
  );
  const refreshToken = generateToken(
    userId,
    process.env.JWT_REFRESH_SECRET,
    process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  );
  return { accessToken, refreshToken };
}

// ── Register ──────────────────────────────────────────────────────────────────
// POST /api/auth/register
// src/controllers/auth.controller.js — replace the register export only
export const register = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    password,
    role,
    phone,
    country,
    city,
    workerProfile: workerProfileData, // nested worker data from frontend
    categories, // [{categoryId, isPrimary}]
  } = req.body;

  // ── Validation ─────────────────────────────────────────────────────────────
  if (!firstName || !lastName || !email || !password || !role) {
    return res
      .status(400)
      .json({ success: false, message: "All fields are required" });
  }
  if (!["HIRER", "WORKER"].includes(role)) {
    return res
      .status(400)
      .json({ success: false, message: "Role must be HIRER or WORKER" });
  }
  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 8 characters",
    });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res
      .status(409)
      .json({ success: false, message: "Email already registered" });
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const emailVerifyToken = crypto.randomBytes(32).toString("hex");

  // ── Create user ─────────────────────────────────────────────────────────────
  const user = await prisma.user.create({
    data: {
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role,
      phone,
      country,
      city,
      emailVerifyToken,
    },
  });

  // ── Create role profile ─────────────────────────────────────────────────────
  if (role === "WORKER") {
    const wp = await prisma.workerProfile.create({
      data: {
        userId: user.id,
        title: workerProfileData?.title || `${firstName} ${lastName}`,
        description: workerProfileData?.description || null,
        hourlyRate: workerProfileData?.hourlyRate
          ? parseFloat(workerProfileData.hourlyRate)
          : 0,
        currency: workerProfileData?.currency || "USD",
        yearsExperience: workerProfileData?.yearsExperience
          ? parseInt(workerProfileData.yearsExperience)
          : 0,
        serviceRadius: workerProfileData?.serviceRadius
          ? parseInt(workerProfileData.serviceRadius)
          : 25,
        // Multi-rate pricing
        dailyRate: workerProfileData?.dailyRate
          ? parseFloat(workerProfileData.dailyRate)
          : null,
        weeklyRate: workerProfileData?.weeklyRate
          ? parseFloat(workerProfileData.weeklyRate)
          : null,
        monthlyRate: workerProfileData?.monthlyRate
          ? parseFloat(workerProfileData.monthlyRate)
          : null,
        customRate: workerProfileData?.customRate
          ? parseFloat(workerProfileData.customRate)
          : null,
        customRateLabel: workerProfileData?.customRateLabel || null,
        pricingNote: workerProfileData?.pricingNote || null,
      },
    });

    // ── Attach categories ────────────────────────────────────────────────────
    if (categories?.length > 0) {
      const validCats = await prisma.category.findMany({
        where: { id: { in: categories.map((c) => c.categoryId) } },
        select: { id: true },
      });
      const validIds = new Set(validCats.map((c) => c.id));
      const catData = categories
        .filter((c) => validIds.has(c.categoryId))
        .map((c) => ({
          workerProfileId: wp.id,
          categoryId: c.categoryId,
          isPrimary: c.isPrimary ?? false,
        }));

      if (catData.length > 0) {
        await prisma.workerCategory.createMany({
          data: catData,
          skipDuplicates: true,
        });
      }
    }
  } else {
    await prisma.hirerProfile.create({ data: { userId: user.id } });
  }

  // ── Email verification ──────────────────────────────────────────────────────
  try {
    await sendVerificationEmail({
      to: email,
      firstName,
      token: emailVerifyToken,
    });
  } catch (emailErr) {
    console.error("Verification email failed:", emailErr.message);
    // Don't block registration if email fails
  }

  // ── Tokens ──────────────────────────────────────────────────────────────────
  const accessToken = generateToken(
    user.id,
    process.env.JWT_SECRET,
    process.env.JWT_EXPIRES_IN || "7d",
  );
  const refreshToken = generateToken(
    user.id,
    process.env.JWT_REFRESH_SECRET,
    process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  );

  await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

  return res.status(201).json({
    success: true,
    message: "Account created. Please verify your email.",
    data: {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    },
  });
});

// ── Verify email ──────────────────────────────────────────────────────────────
// GET /api/auth/verify-email?token=xxx
export const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ success: false, message: "Token required" });
  }

  const user = await prisma.user.findFirst({
    where: { emailVerifyToken: token },
  });

  if (!user) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid or expired token" });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { isEmailVerified: true, emailVerifyToken: null },
  });

  // Send welcome email
  await sendWelcomeEmail({
    to: user.email,
    firstName: user.firstName,
    role: user.role,
  });

  res
    .status(200)
    .json({ success: true, message: "Email verified successfully" });
});

// ── Resend verification ───────────────────────────────────────────────────────
// POST /api/auth/resend-verification
export const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user)
    return res.status(404).json({ success: false, message: "User not found" });
  if (user.isEmailVerified) {
    return res
      .status(400)
      .json({ success: false, message: "Email already verified" });
  }

  const token = crypto.randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifyToken: token },
  });

  await sendVerificationEmail({ to: email, firstName: user.firstName, token });

  res.status(200).json({ success: true, message: "Verification email resent" });
});

// ── Login ─────────────────────────────────────────────────────────────────────
// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ success: false, message: "Email and password required" });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid credentials" });
  }

  if (user.isBanned) {
    return res
      .status(403)
      .json({ success: false, message: "Account suspended" });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid credentials" });
  }

  const { accessToken, refreshToken } = generateTokens(user.id);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken, lastSeen: new Date() },
  });

  res.status(200).json({
    success: true,
    message: "Login successful",
    data: {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        isEmailVerified: user.isEmailVerified,
      },
    },
  });

  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const device = req.headers["user-agent"]?.slice(0, 80) || "Unknown device";
  sendLoginAlertEmail({
    to: user.email,
    name: user.firstName,
    ip,
    device,
    time: new Date().toLocaleString(),
  }).catch(() => {});
  notifyNewDevice(user.id, ip, device).catch(() => {});
});

// ── Refresh token ─────────────────────────────────────────────────────────────
// POST /api/auth/refresh
export const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Refresh token required" });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    return res
      .status(401)
      .json({ success: false, message: "Invalid refresh token" });
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (!user || user.refreshToken !== token) {
    return res
      .status(401)
      .json({ success: false, message: "Refresh token revoked" });
  }

  const { accessToken, refreshToken: newRefreshToken } = generateTokens(
    user.id,
  );

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: newRefreshToken },
  });

  res.status(200).json({
    success: true,
    data: { accessToken, refreshToken: newRefreshToken },
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
export const logout = asyncHandler(async (req, res) => {
  await prisma.user.update({
    where: { id: req.user.id },
    data: { refreshToken: null },
  });

  res.status(200).json({ success: true, message: "Logged out successfully" });
});

// ── Get current user ──────────────────────────────────────────────────────────
// GET /api/auth/me
export const getMe = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      role: true,
      avatar: true,
      bio: true,
      country: true,
      city: true,
      state: true,
      currency: true,
      language: true,
      isEmailVerified: true,
      isPhoneVerified: true,
      createdAt: true,
      workerProfile: true,
      hirerProfile: true,
    },
  });

  res.status(200).json({ success: true, data: user });
});

// ── Forgot password ───────────────────────────────────────────────────────────
// POST /api/auth/forgot-password
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });

  // Always return success to prevent email enumeration
  if (!user) {
    return res.status(200).json({
      success: true,
      message: "If that email exists, a reset link has been sent",
    });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetToken: token, passwordResetExpiry: expiry },
  });

  await sendPasswordResetEmail({ to: email, firstName: user.firstName, token });

  res.status(200).json({
    success: true,
    message: "If that email exists, a reset link has been sent",
  });
});

// ── Reset password ────────────────────────────────────────────────────────────
// POST /api/auth/reset-password
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res
      .status(400)
      .json({ success: false, message: "Token and new password required" });
  }

  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 8 characters",
    });
  }

  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: token,
      passwordResetExpiry: { gt: new Date() },
    },
  });

  if (!user) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid or expired reset token" });
  }

  const hashed = await bcrypt.hash(password, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashed,
      passwordResetToken: null,
      passwordResetExpiry: null,
      refreshToken: null, // invalidate all sessions
    },
  });

  res.status(200).json({
    success: true,
    message: "Password reset successful. Please log in.",
  });

  sendPasswordChangedEmail({ to: user.email, name: user.firstName }).catch(
    () => {},
  );
  notifyPasswordChanged(user.id).catch(() => {});
});
