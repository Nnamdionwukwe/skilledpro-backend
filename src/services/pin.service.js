// src/services/pin.service.js
// ── Withdrawal PIN service ────────────────────────────────────────────────────
// Shared by payment, referral, and campaign controllers. One PIN, three wallets.

import bcrypt from "bcryptjs";
import prisma from "../config/database.js";

export const PIN_MAX_ATTEMPTS = 3;
export const PIN_LOCKOUT_MINS = 30;
export const PIN_DIGITS_RE = /^\d{4}$/;

/**
 * Verify a withdrawal PIN against the user's stored hash.
 *
 * Handles:
 *   - PIN not set → { ok: false, reason: "no_pin" }
 *   - Locked out → { ok: false, reason: "locked", mins }
 *   - Wrong PIN → { ok: false, reason: "wrong_pin", remaining, locked }
 *   - Correct → { ok: true } (resets attempts)
 *
 * Every withdrawal path (worker payout, referral wallet, campaign wallet)
 * goes through this function so attempts and lockouts are counted globally.
 */
export async function verifyWithdrawalPin(user, pin) {
  if (!user.withdrawalPinSet || !user.withdrawalPin) {
    return { ok: false, reason: "no_pin" };
  }

  if (
    user.withdrawalPinLockedUntil &&
    new Date() < user.withdrawalPinLockedUntil
  ) {
    const mins = Math.ceil(
      (user.withdrawalPinLockedUntil - Date.now()) / 60000,
    );
    return { ok: false, reason: "locked", mins };
  }

  const match = await bcrypt.compare(String(pin), user.withdrawalPin);

  if (!match) {
    const attempts = user.withdrawalPinAttempts + 1;
    const lockedUntil =
      attempts >= PIN_MAX_ATTEMPTS
        ? new Date(Date.now() + PIN_LOCKOUT_MINS * 60000)
        : null;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        withdrawalPinAttempts: attempts,
        withdrawalPinLockedUntil: lockedUntil,
      },
    });

    const remaining = PIN_MAX_ATTEMPTS - attempts;
    return {
      ok: false,
      reason: "wrong_pin",
      remaining: Math.max(0, remaining),
      locked: attempts >= PIN_MAX_ATTEMPTS,
    };
  }

  // Correct — reset attempts and lockout
  await prisma.user.update({
    where: { id: user.id },
    data: { withdrawalPinAttempts: 0, withdrawalPinLockedUntil: null },
  });

  return { ok: true };
}
