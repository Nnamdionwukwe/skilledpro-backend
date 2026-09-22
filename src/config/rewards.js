// src/config/rewards.js
// ── Central reward configuration ─────────────────────────────────────────────
// Single source of truth for both the Referral Program and the Daily Campaign.
// Import from here instead of hardcoding values in the controllers.

export const REWARDS = {
  // ── Daily Referral Campaign ─────────────────────────────────────────────────
  CAMPAIGN: {
    PER_REFERRAL: 200, // ₦200 per fully qualified campaign referral
    MIN_WITHDRAWAL: 1000, // ₦1,000 minimum campaign wallet withdrawal
    CURRENCY: "NGN",
    MAX_DAILY_REFERRALS: 50, // fraud guard — max per day per referrer
  },

  // ── Main Referral Program ───────────────────────────────────────────────────
  REFERRAL: {
    CURRENCY: "NGN",
    MIN_WITHDRAWAL: 5000, // ₦5,000 minimum referral wallet withdrawal
    CONVERSION_WINDOW_DAYS: 90, // referral expires after 90 days if not converted
    REWARD_EXPIRY_DAYS: 180, // earned bonus expires after 180 days
    MAX_PENDING_REFERRALS: 50, // fraud guard — max open referrals per referrer
    MIN_FIRST_BOOKING_VALUE: 5000,
    MAX_SINGLE_BOOKING_PAYOUT_PCT: 0.85,

    // Tier base bonuses (Phase-1 amounts — scaled by PHASE_MULTIPLIERS at runtime)
    TIER_BASE_BONUSES: {
      BRONZE: { workerBonus: 800, hirerBonus: 600 },
      SILVER: { workerBonus: 1200, hirerBonus: 900 },
      GOLD: { workerBonus: 2000, hirerBonus: 1500 },
      DIAMOND: { workerBonus: 3500, hirerBonus: 2500 },
    },

    // Multipliers applied on top of the base bonuses (Phase 1/2/3 rollout)
    PHASE_MULTIPLIERS: { 1: 1.0, 2: 1.6, 3: 2.2 },
  },
};
