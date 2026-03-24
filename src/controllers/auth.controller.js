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
} from "../services/email.service.js";

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
export const register = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password, role, phone, country, city } =
    req.body;

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
    return res
      .status(400)
      .json({
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

  // Create the matching profile
  if (role === "WORKER") {
    await prisma.workerProfile.create({
      data: {
        userId: user.id,
        title: `${firstName} ${lastName}`,
        hourlyRate: 0,
      },
    });
  } else {
    await prisma.hirerProfile.create({ data: { userId: user.id } });
  }

  // Send verification email
  await sendVerificationEmail({
    to: email,
    firstName,
    token: emailVerifyToken,
  });

  const { accessToken, refreshToken } = generateTokens(user.id);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken },
  });

  res.status(201).json({
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
    return res
      .status(200)
      .json({
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

  res
    .status(200)
    .json({
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
    return res
      .status(400)
      .json({
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

  res
    .status(200)
    .json({
      success: true,
      message: "Password reset successful. Please log in.",
    });
});

// import bcrypt from "bcryptjs";
// import jwt from "jsonwebtoken";
// import { v4 as uuidv4 } from "uuid";
// import prisma from "../config/database.js";
// import { sendResponse, sendError } from "../utils/response.js";

// const generateTokens = (userId) => {
//   const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
//     expiresIn: process.env.JWT_EXPIRES_IN,
//   });
//   const refreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
//     expiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
//   });
//   return { accessToken, refreshToken };
// };

// export const register = async (req, res) => {
//   try {
//     const { email, password, firstName, lastName, role, phone, country, city, currency } = req.body;
//     if (!email || !password || !firstName || !lastName || !role) {
//       return sendError(res, "Please provide all required fields", 400);
//     }
//     if (!["HIRER", "WORKER"].includes(role)) {
//       return sendError(res, "Role must be HIRER or WORKER", 400);
//     }
//     const existing = await prisma.user.findUnique({ where: { email } });
//     if (existing) return sendError(res, "Email already registered", 409);

//     const hashed = await bcrypt.hash(password, 12);
//     const emailVerifyToken = uuidv4();

//     const user = await prisma.user.create({
//       data: {
//         email, password: hashed, firstName, lastName, role,
//         phone, country, city,
//         currency: currency || "USD",
//         emailVerifyToken,
//         workerProfile: role === "WORKER" ? { create: { title: firstName + " " + lastName, hourlyRate: 0 } } : undefined,
//         hirerProfile: role === "HIRER" ? { create: {} } : undefined,
//       },
//       select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true },
//     });

//     const { accessToken, refreshToken } = generateTokens(user.id);
//     await prisma.user.update({
//       where: { id: user.id },
//       data: { refreshToken: await bcrypt.hash(refreshToken, 8) },
//     });

//     return sendResponse(res, {
//       status: 201,
//       message: "Account created successfully",
//       data: { user, accessToken, refreshToken },
//     });
//   } catch (err) {
//     console.error(err);
//     return sendError(res, "Registration failed");
//   }
// };

// export const login = async (req, res) => {
//   try {
//     const { email, password } = req.body;
//     if (!email || !password) return sendError(res, "Email and password required", 400);

//     const user = await prisma.user.findUnique({ where: { email } });
//     if (!user) return sendError(res, "Invalid credentials", 401);
//     if (user.isBanned) return sendError(res, "Account suspended", 403);

//     const valid = await bcrypt.compare(password, user.password);
//     if (!valid) return sendError(res, "Invalid credentials", 401);

//     const { accessToken, refreshToken } = generateTokens(user.id);
//     await prisma.user.update({
//       where: { id: user.id },
//       data: { refreshToken: await bcrypt.hash(refreshToken, 8), lastSeen: new Date() },
//     });

//     const { password: _, refreshToken: __, emailVerifyToken: ___, ...safeUser } = user;
//     return sendResponse(res, { message: "Login successful", data: { user: safeUser, accessToken, refreshToken } });
//   } catch (err) {
//     console.error(err);
//     return sendError(res, "Login failed");
//   }
// };

// export const verifyEmail = async (req, res) => {
//   try {
//     const { token } = req.body;
//     if (!token) return sendError(res, "Token required", 400);
//     const user = await prisma.user.findFirst({ where: { emailVerifyToken: token } });
//     if (!user) return sendError(res, "Invalid or expired token", 400);
//     await prisma.user.update({ where: { id: user.id }, data: { isEmailVerified: true, emailVerifyToken: null } });
//     return sendResponse(res, { message: "Email verified successfully" });
//   } catch (err) {
//     return sendError(res, "Verification failed");
//   }
// };

// export const forgotPassword = async (req, res) => {
//   try {
//     const { email } = req.body;
//     if (!email) return sendError(res, "Email required", 400);
//     const user = await prisma.user.findUnique({ where: { email } });
//     if (user) {
//       const token = uuidv4();
//       const expiry = new Date(Date.now() + 60 * 60 * 1000);
//       await prisma.user.update({ where: { id: user.id }, data: { passwordResetToken: token, passwordResetExpiry: expiry } });
//     }
//     return sendResponse(res, { message: "If that email exists, a reset link has been sent" });
//   } catch (err) {
//     return sendError(res, "Request failed");
//   }
// };

// export const resetPassword = async (req, res) => {
//   try {
//     const { token, password } = req.body;
//     if (!token || !password) return sendError(res, "Token and password required", 400);
//     if (password.length < 8) return sendError(res, "Password must be at least 8 characters", 400);
//     const user = await prisma.user.findFirst({
//       where: { passwordResetToken: token, passwordResetExpiry: { gt: new Date() } },
//     });
//     if (!user) return sendError(res, "Invalid or expired reset token", 400);
//     const hashed = await bcrypt.hash(password, 12);
//     await prisma.user.update({
//       where: { id: user.id },
//       data: { password: hashed, passwordResetToken: null, passwordResetExpiry: null, refreshToken: null },
//     });
//     return sendResponse(res, { message: "Password reset successfully" });
//   } catch (err) {
//     return sendError(res, "Reset failed");
//   }
// };

// export const refreshToken = async (req, res) => {
//   try {
//     const { refreshToken } = req.body;
//     if (!refreshToken) return sendError(res, "Refresh token required", 400);
//     const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
//     const user = await prisma.user.findUnique({ where: { id: decoded.id } });
//     if (!user || !user.refreshToken) return sendError(res, "Invalid token", 401);
//     const valid = await bcrypt.compare(refreshToken, user.refreshToken);
//     if (!valid) return sendError(res, "Invalid token", 401);
//     const tokens = generateTokens(user.id);
//     await prisma.user.update({
//       where: { id: user.id },
//       data: { refreshToken: await bcrypt.hash(tokens.refreshToken, 8) },
//     });
//     return sendResponse(res, { message: "Token refreshed", data: tokens });
//   } catch (err) {
//     return sendError(res, "Token refresh failed", 401);
//   }
// };

// export const logout = async (req, res) => {
//   try {
//     await prisma.user.update({ where: { id: req.user.id }, data: { refreshToken: null } });
//     return sendResponse(res, { message: "Logged out successfully" });
//   } catch (err) {
//     return sendError(res, "Logout failed");
//   }
// };

// export const getMe = async (req, res) => {
//   try {
//     const user = await prisma.user.findUnique({
//       where: { id: req.user.id },
//       select: {
//         id: true, email: true, firstName: true, lastName: true,
//         role: true, avatar: true, phone: true, country: true,
//         city: true, currency: true, isEmailVerified: true,
//         createdAt: true, lastSeen: true,
//         workerProfile: true, hirerProfile: true,
//       },
//     });
//     return sendResponse(res, { data: { user } });
//   } catch (err) {
//     return sendError(res, "Failed to fetch profile");
//   }
// };
