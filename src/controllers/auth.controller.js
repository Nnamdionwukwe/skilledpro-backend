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
import {
  applyReferralOnSignup,
  qualifyReferral,
} from "./referral.controller.js";
import { registerCampaignReferral } from "./campaign.controller.js";
import { logAdminAction } from "../utils/auditLog.js"; // ← FIXED: was missing
import {
  paginate,
  paginationMeta,
  fullName,
  formatCurrency,
  truncate,
  slugify,
  uniqueRef,
  parseJSON,
  extractIP,
  timeAgo,
  safeUser,
} from "../utils/helpers.js";
import {
  generateTokenPair,
  generateAccessToken,
  verifyAccessToken,
  verifyRefreshToken,
  tryVerifyRefreshToken,
  clearRefreshToken,
  generateEmailVerifyToken,
  consumeEmailVerifyToken,
  generatePasswordResetToken,
  verifyPasswordResetToken,
  clearPasswordResetToken,
  verifyStoredRefreshToken,
  setTokenCookies,
  clearTokenCookies,
} from "../services/auth.service.js";

import {
  getGoogleUserFromCode,
  verifyGoogleIdToken,
  getGoogleAuthUrl,
  getGoogleUserFromAccessToken,
} from "../services/google.service.js";
// ─── Token helpers ─────────────────────────────────────────────────────────────
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

// ─── Register ──────────────────────────────────────────────────────────────────
// POST /api/auth/register
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
    workerProfile: workerProfileData,
    categories,
  } = req.body;

  // ── Validation ───────────────────────────────────────────────────────────────
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

  // ── Check for existing active user (exclude tombstones) ────────────────────
  // A tombstone is a soft-deleted row whose email has been prefixed with
  // "deleted_". Those rows occupy the email UNIQUE slot only for their own
  // prefixed email, so they don't block re-registration with the original.
  const existing = await prisma.user.findFirst({
    where: {
      email,
      NOT: { email: { startsWith: "deleted_" } },
    },
  });

  if (existing) {
    if (existing.isBanned === true) {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_BANNED",
        message:
          "This email is associated with a suspended account. Contact support if you believe this is a mistake.",
      });
    }
    if (existing.isActive === false) {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_DELETED",
        message:
          "This email is associated with a deactivated account. Contact support to restore access.",
      });
    }
    return res
      .status(409)
      .json({ success: false, message: "Email already registered" });
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const emailVerifyToken = crypto.randomBytes(32).toString("hex");

  // ── Create user ──────────────────────────────────────────────────────────────
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

  if (req.body.referralCode) {
    await applyReferralOnSignup(user.id, req.body.referralCode);
    await registerCampaignReferral(user.id, req.body.referralCode);
  }

  // ── Create role profile ──────────────────────────────────────────────────────
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

  // ── Verification email ───────────────────────────────────────────────────────
  try {
    await sendVerificationEmail({
      to: email,
      firstName,
      token: emailVerifyToken,
    });
  } catch (emailErr) {
    console.error("Verification email failed:", emailErr.message);
  }

  // ── Tokens ───────────────────────────────────────────────────────────────────
  const { accessToken, refreshToken } = generateTokens(user.id);
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
        referralCode: user.referralCode ?? null,
      },
    },
  });
});

// ─── Verify email ──────────────────────────────────────────────────────────────
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

  await qualifyReferral(user.id);

  await sendWelcomeEmail({
    to: user.email,
    firstName: user.firstName,
    role: user.role,
  });

  res
    .status(200)
    .json({ success: true, message: "Email verified successfully" });
});

// ─── Resend verification ───────────────────────────────────────────────────────
// POST /api/auth/resend-verification
export const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user)
    return res.status(404).json({ success: false, message: "User not found" });
  if (user.isEmailVerified)
    return res
      .status(400)
      .json({ success: false, message: "Email already verified" });

  const token = crypto.randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifyToken: token },
  });
  await sendVerificationEmail({ to: email, firstName: user.firstName, token });

  res.status(200).json({ success: true, message: "Verification email resent" });
});

// ─── Login ─────────────────────────────────────────────────────────────────────
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
    return res.status(403).json({
      success: false,
      code: "ACCOUNT_BANNED",
      message: "Account suspended",
    });
  }
  if (user.isActive === false) {
    return res.status(403).json({
      success: false,
      code: "ACCOUNT_DELETED",
      message: "Account has been deactivated. Contact support.",
    });
  }

  const isMatch = await bcrypt.compare(password, user.password);

  // ── Password mismatch ────────────────────────────────────────────────────
  if (!isMatch) {
    // If the account was created via Google and the user never set a
    // password, guide them to use Google OR to set a password.
    if (user.authProvider === "GOOGLE") {
      return res.status(409).json({
        success: false,
        code: "GOOGLE_ACCOUNT_NO_PASSWORD",
        message:
          "This account was created with Google. Sign in with Google, or set a password to log in manually.",
        canResetPassword: true,
      });
    }
    return res
      .status(401)
      .json({ success: false, message: "Invalid credentials" });
  }

  const { accessToken, refreshToken } = generateTokens(user.id);
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken, lastSeen: new Date() },
  });

  // ── FIXED: send response first, then fire-and-forget side effects ────────
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
        referralCode: user.referralCode,
      },
    },
  });

  // ── Fire-and-forget: none of these should delay the login response ────────
  const ip =
    req.headers["x-real-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress;
  const device = req.headers["user-agent"]?.slice(0, 80) || "Unknown device";

  // Audit log — admin logins only (fire-and-forget, no await needed here)
  if (user.role === "ADMIN") {
    logAdminAction({
      req,
      adminId: user.id,
      action: "ADMIN_LOGIN",
      targetType: "SYSTEM",
      description: `Admin ${user.email} logged in`,
      meta: { email: user.email, ip, device },
    }).catch(() => {}); // logAdminAction catches internally, this is extra safety
  }

  sendLoginAlertEmail({
    to: user.email,
    name: user.firstName,
    ip,
    device,
    time: new Date().toLocaleString(),
  }).catch(() => {});
  notifyNewDevice(user.id, ip, device).catch(() => {});
});

// ─── Refresh token ─────────────────────────────────────────────────────────────
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

// ─── Logout ────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
export const logout = asyncHandler(async (req, res) => {
  await prisma.user.update({
    where: { id: req.user.id },
    data: { refreshToken: null },
  });
  res.status(200).json({ success: true, message: "Logged out successfully" });
});

// ─── Get current user ──────────────────────────────────────────────────────────
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
      referralCode: true, // ← included (fixed in earlier session)
      workerProfile: true,
      hirerProfile: true,
    },
  });

  res.status(200).json({ success: true, data: user });
});

// ─── Forgot password ───────────────────────────────────────────────────────────
// POST /api/auth/forgot-password
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });

  // Always return success — prevents email enumeration attacks
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

// ─── Reset password ────────────────────────────────────────────────────────────
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
      refreshToken: null,
    },
  });

  res.status(200).json({
    success: true,
    message: "Password reset successful. Please log in.",
  });

  // Fire-and-forget notifications
  sendPasswordChangedEmail({ to: user.email, name: user.firstName }).catch(
    () => {},
  );
  notifyPasswordChanged(user.id).catch(() => {});
});

// ADD to src/controllers/auth.controller.js
// ADD to src/routes/auth.routes.js
// ─────────────────────────────────────────────────────────────────────────────

// ── CONTROLLER (paste into auth.controller.js) ────────────────────────────────

// POST /api/auth/logout-all
// Invalidates ALL active sessions for the current user across every device.
// Use case: "I think my account was compromised" / "Sign out everywhere"
export const logoutAll = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Clear the stored refresh token hash (kills web/mobile JWT sessions)
    await prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });

    // 2. Deactivate all push notification tokens (kills background push too)
    try {
      await prisma.deviceToken.updateMany({
        where: { userId },
        data: { active: false },
      });
    } catch (_) {
      // DeviceToken table may not exist yet in older environments — non-fatal
    }

    // 3. Clear any auth cookies if the app uses them
    res.clearCookie("token", { httpOnly: true, path: "/" });
    res.clearCookie("refreshToken", {
      httpOnly: true,
      path: "/api/auth/refresh",
    });

    // 4. Notify the user (so they're aware if they didn't do this themselves)
    try {
      await prisma.notification.create({
        data: {
          userId,
          title: "🔐 Signed out from all devices",
          body: "You've been signed out from all devices and sessions. If this wasn't you, change your password immediately.",
          type: "SECURITY_LOGOUT_ALL",
          data: {
            ip:
              req.headers["x-forwarded-for"]?.split(",")[0] ||
              req.socket?.remoteAddress,
          },
        },
      });
    } catch (_) {}

    return res.json({
      success: true,
      message: "Successfully signed out from all devices. Please log in again.",
    });
  } catch (err) {
    console.error("logoutAll error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to sign out from all devices" });
  }
};

// ─── Google OAuth: Get auth URL ───────────────────────────────────────────────
// GET /api/auth/google/url?redirectTo=/dashboard
export const googleAuthUrl = asyncHandler(async (req, res) => {
  const redirectTo = req.query.redirectTo || "/";
  const state = Buffer.from(JSON.stringify({ redirectTo })).toString("base64");

  const url = getGoogleAuthUrl(state);
  return res.json({ success: true, data: { url } });
});

// ─── Google OAuth: Callback ───────────────────────────────────────────────────
// GET /api/auth/google/callback?code=xxx&state=xxx
export const googleCallback = asyncHandler(async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).json({ success: false, message: "Missing code" });
  }

  let redirectTo = "/";
  if (state) {
    try {
      const parsed = JSON.parse(Buffer.from(state, "base64").toString());
      redirectTo = parsed.redirectTo || "/";
    } catch {}
  }

  const frontendUrl = process.env.CLIENT_URL || "http://localhost:5173";

  // ── 1. Exchange code for Google user info ──────────────────────────────────
  let googleUser;
  try {
    googleUser = await getGoogleUserFromCode(code);
  } catch (err) {
    console.error("Google code exchange failed:", err.message);
    // Redirect with error rather than JSON, since this is a browser flow
    return res.redirect(
      `${frontendUrl}/login?code=GOOGLE_AUTH_FAILED&reason=${encodeURIComponent(
        "Google authentication failed",
      )}`,
    );
  }

  if (!googleUser.email) {
    return res.redirect(
      `${frontendUrl}/login?code=GOOGLE_AUTH_FAILED&reason=${encodeURIComponent(
        "Google account has no email",
      )}`,
    );
  }

  // ── 2. Find existing user (by googleId OR email) ───────────────────────────
  let user = await prisma.user.findFirst({
    where: {
      OR: [{ googleId: googleUser.googleId }, { email: googleUser.email }],
    },
  });

  // ── 3. Ban / deactivation gates (BEFORE issuing tokens) ───────────────────
  // Redirect the user to login with the right code so the frontend shows
  // the correct banner.
  if (user) {
    if (user.isBanned === true) {
      const params = new URLSearchParams({
        code: "ACCOUNT_BANNED",
        reason: "This account has been suspended.",
      });
      return res.redirect(`${frontendUrl}/login?${params}`);
    }
    if (user.isActive === false) {
      const params = new URLSearchParams({
        code: "ACCOUNT_DELETED",
        reason: "This account has been deactivated.",
      });
      return res.redirect(`${frontendUrl}/login?${params}`);
    }
  }

  let isNewUser = false;

  if (user) {
    // ── Existing user ────────────────────────────────────────────────────────
    const nameCustom = user.nameCustom === true;
    const avatarCustom = user.avatarCustom === true;

    console.log("[google-auth:callback] existing user", {
      id: user.id,
      email: user.email,
      nameCustom,
      avatarCustom,
      before: {
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
      },
      fromGoogle: {
        firstName: googleUser.firstName,
        lastName: googleUser.lastName,
        avatar: googleUser.avatar,
      },
    });

    const updates = { lastSeen: new Date() };

    if (!user.googleId) {
      updates.googleId = googleUser.googleId;
    }

    if (googleUser.emailVerified && !user.isEmailVerified) {
      updates.isEmailVerified = true;
      updates.emailVerifyToken = null;
    }

    if (nameCustom === false && googleUser.firstName) {
      updates.firstName = googleUser.firstName;
    }
    if (nameCustom === false && googleUser.lastName) {
      updates.lastName = googleUser.lastName;
    }
    if (avatarCustom === false && googleUser.avatar) {
      updates.avatar = googleUser.avatar;
    }

    console.log("[google-auth:callback] willApply", updates);

    user = await prisma.user.update({
      where: { id: user.id },
      data: updates,
    });
  } else {
    // ── New user — create account ────────────────────────────────────────────
    isNewUser = true;

    const randomPassword = crypto.randomBytes(32).toString("hex");
    const hashedPassword = await bcrypt.hash(randomPassword, 12);

    user = await prisma.user.create({
      data: {
        firstName: googleUser.firstName || "User",
        lastName: googleUser.lastName || "",
        email: googleUser.email,
        password: hashedPassword,
        role: "HIRER",
        avatar: googleUser.avatar,
        isEmailVerified: googleUser.emailVerified || false,
        googleId: googleUser.googleId,
        authProvider: "GOOGLE",
        avatarCustom: false,
        nameCustom: false,
      },
    });

    await prisma.hirerProfile
      .create({ data: { userId: user.id } })
      .catch(() => {});

    sendWelcomeEmail({
      to: user.email,
      firstName: user.firstName,
      role: user.role,
    }).catch(() => {});
  }

  // ── 4. Issue tokens ────────────────────────────────────────────────────────
  const { accessToken, refreshToken } = generateTokens(user.id);
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken, lastSeen: new Date() },
  });

  // ── 5. Redirect to frontend with tokens ────────────────────────────────────
  const params = new URLSearchParams({
    accessToken,
    refreshToken,
    isNewUser: isNewUser ? "1" : "0",
  });

  return res.redirect(`${frontendUrl}/auth/google/callback?${params}`);
});

// ─── Google Sign-In (mobile/SPA — verifies ID token OR access token) ─────────
// POST /api/auth/google
// Body: { idToken } OR { accessToken, role? }
//
// Handles three cases:
//   1. Existing user with this googleId → sign in
//   2. Existing user with this email (no googleId yet) → link + sign in
//   3. No user → create new (with the requested role)
//
// Tombstone rows (email starts with "deleted_") are treated as if the
// user doesn't exist, so re-registration through Google works after a
// soft delete.
//
// Banned / deactivated users are blocked BEFORE any token is issued.
export const googleSignIn = asyncHandler(async (req, res) => {
  const { idToken, accessToken, role } = req.body;

  const requestedRole = ["HIRER", "WORKER"].includes(role) ? role : "HIRER";

  if (!idToken && !accessToken) {
    return res
      .status(400)
      .json({ success: false, message: "Missing Google token" });
  }

  // ── 1. Verify token with Google ────────────────────────────────────────────
  let googleUser;
  try {
    googleUser = idToken
      ? await verifyGoogleIdToken(idToken)
      : await getGoogleUserFromAccessToken(accessToken);
  } catch (err) {
    console.error("Google token verification failed:", err.message);
    return res.status(401).json({
      success: false,
      code: "INVALID_GOOGLE_TOKEN",
      message:
        "Could not verify your Google account. Please try signing in again.",
    });
  }

  if (!googleUser.email) {
    return res.status(400).json({
      success: false,
      message: "Google account has no email",
    });
  }

  // ── 2. Find existing user ──────────────────────────────────────────────────
  // 2a. Look up by googleId first, EXCLUDING tombstones.
  let user = await prisma.user.findFirst({
    where: {
      googleId: googleUser.googleId,
      NOT: { email: { startsWith: "deleted_" } },
    },
  });

  // 2b. If not found, look up by email (excluding tombstones).
  if (!user) {
    user = await prisma.user.findFirst({
      where: {
        email: googleUser.email,
        NOT: { email: { startsWith: "deleted_" } },
      },
    });

    // ── Collision guard: if this row already has a DIFFERENT googleId,
    //     the email and Google identity are mismatched. Reject rather than
    //     clobber.
    if (user && user.googleId && user.googleId !== googleUser.googleId) {
      return res.status(409).json({
        success: false,
        code: "GOOGLE_ACCOUNT_MISMATCH",
        message:
          "This email is already linked to a different Google account. Contact support if this is a mistake.",
      });
    }

    // ── Collision guard: if another non-tombstone row already claims this
    //     googleId, we must not steal it. (Extremely rare, but defensive.)
    if (user && !user.googleId) {
      const otherOwner = await prisma.user.findFirst({
        where: {
          googleId: googleUser.googleId,
          NOT: { email: { startsWith: "deleted_" } },
        },
        select: { id: true },
      });
      if (otherOwner && otherOwner.id !== user.id) {
        return res.status(409).json({
          success: false,
          code: "GOOGLE_ACCOUNT_ALREADY_LINKED",
          message:
            "This Google account is already linked to another user. Please sign in with that account instead.",
        });
      }
    }
  }

  let isNewUser = false;

  if (user) {
    // ── 3a. Ban / deactivation gates ────────────────────────────────────────
    if (user.isBanned === true) {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_BANNED",
        message:
          "This account has been suspended. Contact support if you believe this is a mistake.",
      });
    }
    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_DELETED",
        message:
          "This account has been deactivated. Contact support to restore access.",
      });
    }

    // ── 3b. Existing user — update smartly ──────────────────────────────────
    const nameCustom = user.nameCustom === true;
    const avatarCustom = user.avatarCustom === true;

    console.log("[google-auth:signin] existing user", {
      id: user.id,
      email: user.email,
      role: user.role,
      nameCustom,
      avatarCustom,
      before: {
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
      },
      fromGoogle: {
        firstName: googleUser.firstName,
        lastName: googleUser.lastName,
        avatar: googleUser.avatar,
      },
    });

    const updates = { lastSeen: new Date() };

    if (!user.googleId) {
      updates.googleId = googleUser.googleId;
    }

    if (googleUser.emailVerified && !user.isEmailVerified) {
      updates.isEmailVerified = true;
      updates.emailVerifyToken = null;
    }

    if (nameCustom === false && googleUser.firstName) {
      updates.firstName = googleUser.firstName;
    }
    if (nameCustom === false && googleUser.lastName) {
      updates.lastName = googleUser.lastName;
    }
    if (avatarCustom === false && googleUser.avatar) {
      updates.avatar = googleUser.avatar;
    }

    console.log("[google-auth:signin] willApply", updates);

    try {
      user = await prisma.user.update({
        where: { id: user.id },
        data: updates,
      });
    } catch (err) {
      // Race condition: another request just claimed this googleId.
      if (err.code === "P2002" && err.meta?.target?.includes("googleId")) {
        return res.status(409).json({
          success: false,
          code: "GOOGLE_ACCOUNT_ALREADY_LINKED",
          message:
            "This Google account is already linked to another user. Please sign in with that account.",
        });
      }
      throw err;
    }
  } else {
    // ── 4. New user — create account ────────────────────────────────────────
    // Note: tombstones were excluded from the search, so re-registration
    // through Google works after a soft delete. If a tombstone owned this
    // email, we still own it now because the tombstone's email is prefixed.
    isNewUser = true;
    const randomPassword = crypto.randomBytes(32).toString("hex");
    const hashedPassword = await bcrypt.hash(randomPassword, 12);

    try {
      user = await prisma.user.create({
        data: {
          firstName: googleUser.firstName || "User",
          lastName: googleUser.lastName || "",
          email: googleUser.email,
          password: hashedPassword,
          role: requestedRole,
          avatar: googleUser.avatar,
          isEmailVerified: googleUser.emailVerified || false,
          googleId: googleUser.googleId,
          authProvider: "GOOGLE",
          avatarCustom: false,
          nameCustom: false,
        },
      });
    } catch (err) {
      // Race conditions: someone just created this email or Google ID.
      if (err.code === "P2002" && err.meta?.target?.includes("email")) {
        return res.status(409).json({
          success: false,
          message:
            "An account with this email already exists. Please sign in with your existing method.",
        });
      }
      if (err.code === "P2002" && err.meta?.target?.includes("googleId")) {
        return res.status(409).json({
          success: false,
          code: "GOOGLE_ACCOUNT_ALREADY_LINKED",
          message:
            "This Google account is already linked to another user. Please sign in with that account.",
        });
      }
      throw err;
    }

    if (requestedRole === "WORKER") {
      await prisma.workerProfile
        .create({
          data: {
            userId: user.id,
            title:
              `${googleUser.firstName || "User"} ${googleUser.lastName || ""}`.trim() ||
              "Skilled Worker",
            hourlyRate: 0,
            currency: "USD",
          },
        })
        .catch((err) => {
          console.error(
            "Failed to create worker profile for Google user:",
            err.message,
          );
        });
    } else {
      await prisma.hirerProfile
        .create({ data: { userId: user.id } })
        .catch(() => {});
    }

    sendWelcomeEmail({
      to: user.email,
      firstName: user.firstName,
      role: user.role,
    }).catch(() => {});
  }

  // ── 5. Issue tokens ────────────────────────────────────────────────────────
  const { accessToken: ourAccessToken, refreshToken } = generateTokens(user.id);
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken, lastSeen: new Date() },
  });

  return res.status(200).json({
    success: true,
    message: isNewUser ? "Account created" : "Login successful",
    data: {
      accessToken: ourAccessToken,
      refreshToken,
      isNewUser,
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
