// src/services/auth.service.js
// ─────────────────────────────────────────────────────────────────────────────
// JWT + token management for SkilledProz authentication.
//
// Security model:
//   • Access tokens  — short-lived (7d default), signed with JWT_SECRET
//   • Refresh tokens — long-lived (30d default), stored as SHA-256 hash in DB
//   • Email/password-reset tokens — random 64-hex bytes, stored as SHA-256 hash
//
// Why hash refresh tokens in the DB?
//   If the database is ever leaked, attackers cannot use the hashed values to
//   make authenticated requests. The plain token only exists in the HTTP-only
//   cookie / response for the duration of the request.
// ─────────────────────────────────────────────────────────────────────────────

import jwt from "jsonwebtoken";
import crypto from "crypto";
import prisma from "../config/database.js";

// ─────────────────────────────────────────────────────────────────────────────
// § 1  TOKEN GENERATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Issues a signed JWT access token.
 * Payload: { id }
 */
export const generateAccessToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

/**
 * Issues a signed JWT refresh token.
 * Payload: { id }
 */
export const generateRefreshToken = (id) =>
  jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  });

/**
 * Generates a cryptographically secure random hex token.
 * Used for email verification and password reset links.
 *
 * @param {number} bytes  default 32 → 64-char hex string
 */
export const generateRandomToken = (bytes = 32) =>
  crypto.randomBytes(bytes).toString("hex");

// ─────────────────────────────────────────────────────────────────────────────
// § 2  TOKEN HASHING (secure DB storage)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One-way SHA-256 hash of a token string.
 * Use this before storing any token in the database.
 *
 * SHA-256 is appropriate here because the tokens are already high-entropy
 * random values (unlike passwords). bcrypt would be slower without benefit.
 *
 * @param {string} token  plain-text token
 * @returns {string}      64-char hex hash
 */
export const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

/**
 * Constant-time comparison of two strings.
 * Prevents timing attacks when comparing tokens.
 */
export const safeCompare = (a, b) => {
  try {
    const bufA = Buffer.from(String(a), "utf8");
    const bufB = Buffer.from(String(b), "utf8");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 3  REFRESH TOKEN DB STORAGE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hashes and stores the refresh token against the user record.
 * Only the hash is persisted — the plain token is never stored.
 *
 * @param {string} userId
 * @param {string} plainToken  the token returned to the client
 */
export const saveRefreshToken = async (userId, plainToken) => {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshToken: hashToken(plainToken) },
  });
};

/**
 * Clears the stored refresh token (on logout or password change).
 */
export const clearRefreshToken = async (userId) => {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshToken: null },
  });
};

/**
 * Verifies that a plain refresh token matches the stored hash.
 * Returns the user record if valid, null otherwise.
 *
 * @param {string} userId
 * @param {string} plainToken  token from the client
 * @returns {object|null}      user row or null
 */
export const verifyStoredRefreshToken = async (userId, plainToken) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, refreshToken: true, isActive: true, isBanned: true },
  });
  if (!user || !user.refreshToken) return null;
  if (!user.isActive || user.isBanned) return null;
  if (!safeCompare(hashToken(plainToken), user.refreshToken)) return null;
  return user;
};

// ─────────────────────────────────────────────────────────────────────────────
// § 4  TOKEN VERIFICATION (JWT)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifies a JWT access token.
 * Throws on invalid/expired token — callers should wrap in try/catch.
 *
 * @param {string} token
 * @returns {{ id: string }}
 * @throws {jwt.JsonWebTokenError | jwt.TokenExpiredError}
 */
export const verifyAccessToken = (token) =>
  jwt.verify(token, process.env.JWT_SECRET);

/**
 * Verifies a JWT refresh token.
 * Throws on invalid/expired token.
 *
 * @param {string} token
 * @returns {{ id: string }}
 * @throws {jwt.JsonWebTokenError | jwt.TokenExpiredError}
 */
export const verifyRefreshToken = (token) =>
  jwt.verify(token, process.env.JWT_REFRESH_SECRET);

/**
 * Safe wrapper for verifyAccessToken that returns null instead of throwing.
 * Useful for optional-auth middleware.
 *
 * @param {string} token
 * @returns {{ id: string }|null}
 */
export const tryVerifyAccessToken = (token) => {
  try {
    return verifyAccessToken(token);
  } catch {
    return null;
  }
};

/**
 * Safe wrapper for verifyRefreshToken that returns null instead of throwing.
 */
export const tryVerifyRefreshToken = (token) => {
  try {
    return verifyRefreshToken(token);
  } catch {
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 5  TOKEN PAIR (access + refresh together)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates both tokens, hashes and stores the refresh token, and returns
 * the plain-text pair to be sent to the client.
 *
 * Call this on login, registration, and token refresh.
 *
 * @param {string} userId
 * @returns {{ token: string, refreshToken: string }}
 */
export const generateTokenPair = async (userId) => {
  const token = generateAccessToken(userId);
  const refreshToken = generateRefreshToken(userId);
  await saveRefreshToken(userId, refreshToken); // stores hash, not plain
  return { token, refreshToken };
};

// ─────────────────────────────────────────────────────────────────────────────
// § 6  EMAIL VERIFICATION TOKENS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates an email verification token, hashes it, stores it on the user,
 * and returns the plain token to include in the verification link.
 *
 * @param {string} userId
 * @returns {string}  plain 64-char hex token for the email link
 */
export const generateEmailVerifyToken = async (userId) => {
  const plain = generateRandomToken();
  const hashed = hashToken(plain);

  await prisma.user.update({
    where: { id: userId },
    data: { emailVerifyToken: hashed },
  });

  return plain;
};

/**
 * Verifies an email verification token and marks the user as email-verified.
 * Returns the user if valid, null if invalid/not found.
 *
 * @param {string} plainToken
 * @returns {object|null}  user row or null
 */
export const consumeEmailVerifyToken = async (plainToken) => {
  const hashed = hashToken(plainToken);

  const user = await prisma.user.findFirst({
    where: { emailVerifyToken: hashed },
    select: { id: true, isEmailVerified: true },
  });

  if (!user) return null;

  await prisma.user.update({
    where: { id: user.id },
    data: { isEmailVerified: true, emailVerifyToken: null },
  });

  return user;
};

// ─────────────────────────────────────────────────────────────────────────────
// § 7  PASSWORD RESET TOKENS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a password-reset token, hashes it, stores it with an expiry,
 * and returns the plain token for the reset link.
 *
 * @param {string} userId
 * @param {number} expiryMinutes  default 60 minutes
 * @returns {string}  plain 64-char hex token
 */
export const generatePasswordResetToken = async (
  userId,
  expiryMinutes = 60,
) => {
  const plain = generateRandomToken();
  const hashed = hashToken(plain);
  const expires = new Date(Date.now() + expiryMinutes * 60_000);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordResetToken: hashed, passwordResetExpiry: expires },
  });

  return plain;
};

/**
 * Validates a password-reset token.
 * Returns the user if valid and not expired, null otherwise.
 * Does NOT clear the token — call clearPasswordResetToken after the reset.
 *
 * @param {string} plainToken
 * @returns {object|null}
 */
export const verifyPasswordResetToken = async (plainToken) => {
  const hashed = hashToken(plainToken);

  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: hashed,
      passwordResetExpiry: { gt: new Date() }, // not expired
    },
    select: { id: true, email: true },
  });

  return user || null;
};

/**
 * Clears password reset token fields after a successful reset.
 */
export const clearPasswordResetToken = async (userId) => {
  await prisma.user.update({
    where: { id: userId },
    data: { passwordResetToken: null, passwordResetExpiry: null },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// § 8  COOKIE HELPERS (sets tokens as HTTP-only cookies)
// ─────────────────────────────────────────────────────────────────────────────

const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Sets access + refresh tokens as HTTP-only, Secure cookies on the response.
 * Eliminates the need for the client to store tokens in localStorage.
 *
 * @param {object} res          Express response object
 * @param {string} token        access token
 * @param {string} refreshToken refresh token
 */
export const setTokenCookies = (res, token, refreshToken) => {
  const baseOpts = {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? "strict" : "lax",
    path: "/",
  };

  res.cookie("token", token, {
    ...baseOpts,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.cookie("refreshToken", refreshToken, {
    ...baseOpts,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: "/api/auth/refresh", // restrict refresh cookie to refresh endpoint
  });
};

/**
 * Clears both auth cookies (call on logout).
 */
export const clearTokenCookies = (res) => {
  res.clearCookie("token", { httpOnly: true, path: "/" });
  res.clearCookie("refreshToken", {
    httpOnly: true,
    path: "/api/auth/refresh",
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// § 9  JWT EXPIRY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if a JWT token is expired without throwing.
 *
 * @param {string} token
 * @returns {boolean}
 */
export const isTokenExpired = (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded?.exp) return true;
    return Date.now() >= decoded.exp * 1000;
  } catch {
    return true;
  }
};

/**
 * Returns the expiry Date of a JWT, or null if invalid.
 *
 * @param {string} token
 * @returns {Date|null}
 */
export const getTokenExpiry = (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded?.exp) return null;
    return new Date(decoded.exp * 1000);
  } catch {
    return null;
  }
};
