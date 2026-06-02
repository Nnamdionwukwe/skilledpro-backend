// src/controllers/referral.controller.js
// SkilledProz Referral Program — v1.0
//
// ─── Required Prisma schema additions ────────────────────────────────────────
//
// Add to User model:
//   referralCode        String?          @unique
//   referredById        String?
//   referredBy          User?            @relation("UserReferrals", fields: [referredById], references: [id])
//   referrals           User[]           @relation("UserReferrals")
//   walletBalance       Float            @default(0)
//   walletLifetimeTotal Float            @default(0)
//   referralTier        ReferralTier     @default(BRONZE)
//   totalReferrals      Int              @default(0)
//   successfulReferrals Int              @default(0)

//
//   model WalletTransaction {
//     id          String   @id @default(uuid())
//     userId      String
//     user        User     @relation(fields:[userId], references:[id])
//     type        String   // "REFERRAL_BONUS" | "WITHDRAWAL" | "ADJUSTMENT" | "EXPIRED"
//     amount      Float
//     currency    String   @default("NGN")
//     description String
//     referralId  String?
//     meta        Json?
//     createdAt   DateTime @default(now())
//   }
//
//   enum ReferralStatus { PENDING QUALIFIED CONVERTED REWARDED EXPIRED FLAGGED }
//   enum ReferralTier   { BRONZE SILVER GOLD DIAMOND }
//
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import crypto from "crypto";
import { FEE_CONFIG } from "../config/fees.js";
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
// ── Tier & reward configuration ───────────────────────────────────────────────

// ── Tier base bonuses (Phase-1 amounts — scale via getBonusForPhase) ──────────
const TIER_BASE_BONUSES = {
  BRONZE: { workerBonus: 800, hirerBonus: 600 },
  SILVER: { workerBonus: 1_200, hirerBonus: 900 },
  GOLD: { workerBonus: 2_000, hirerBonus: 1_500 },
  DIAMOND: { workerBonus: 3_500, hirerBonus: 2_500 },
};

const PHASE_MULTIPLIERS = { 1: 1.0, 2: 1.6, 3: 2.2 };

export function getBonusForPhase(tierKey) {
  const base = TIER_BASE_BONUSES[tierKey] || TIER_BASE_BONUSES.BRONZE;
  const mult = PHASE_MULTIPLIERS[FEE_CONFIG.phase] || 1.0;
  return {
    workerBonus: Math.round((base.workerBonus * mult) / 50) * 50,
    hirerBonus: Math.round((base.hirerBonus * mult) / 50) * 50,
  };
}

export const TIERS = {
  BRONZE: {
    label: "🥉 Bronze",
    min: 0,
    max: 5,
    ...getBonusForPhase("BRONZE"),
    badge: "bronze",
  },
  SILVER: {
    label: "🥈 Silver",
    min: 6,
    max: 20,
    ...getBonusForPhase("SILVER"),
    badge: "silver",
  },
  GOLD: {
    label: "🥇 Gold",
    min: 21,
    max: 50,
    ...getBonusForPhase("GOLD"),
    badge: "gold",
  },
  DIAMOND: {
    label: "💎 Diamond",
    min: 51,
    max: Infinity,
    ...getBonusForPhase("DIAMOND"),
    badge: "diamond",
  },
};

export const REFEREE_PERKS = {
  WORKER: {
    type: "BOOST_PLUS_FEE_WAIVER",
    featuredBoostDays: 30,
    platformFeeWaiverJobs: 3,
    cashBonus: 0,
    description: "30-day profile boost + fee waived on your first 3 jobs",
  },
  HIRER: {
    type: "FIRST_BOOKING_DISCOUNT",
    discountRate: 0.05,
    maxDiscountAmount: 2_500,
    cashBonus: 150,
    description: "5% off first booking (up to ₦2,500) + ₦150 wallet credit",
  },
};

export const REFERRAL_CONFIG = {
  CURRENCY: "NGN",
  CONVERSION_WINDOW_DAYS: 90,
  REWARD_EXPIRY_DAYS: 180,
  CODE_LENGTH: 8,
  MIN_WITHDRAWAL: 5_000,
  MAX_PENDING_REFERRALS: 50,
  APP_URL: process.env.APP_BASE_URL || "https://skilledproz.com",
  // ── Sustainability guardrails ─────────────────────────────────────────────
  MIN_FIRST_BOOKING_VALUE: 5_000,
  MAX_SINGLE_BOOKING_PAYOUT_PCT: 0.85,
};

// ── Internal helpers ──────────────────────────────────────────────────────────

function makeCode() {
  const hex = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `SP${hex}`; // e.g. "SPA3F2B8C1"
}

function resolveTier(successfulCount) {
  for (const [key, cfg] of Object.entries(TIERS)) {
    if (successfulCount >= cfg.min && successfulCount <= cfg.max) return key;
  }
  return "DIAMOND";
}

function tierBonus(tier, role) {
  const cfg = TIERS[tier] || TIERS.BRONZE;
  return role === "WORKER" ? cfg.workerBonus : cfg.hirerBonus;
}

function expiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + REFERRAL_CONFIG.CONVERSION_WINDOW_DAYS);
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GENERATE / GET REFERRAL CODE   GET /referral/code
// ─────────────────────────────────────────────────────────────────────────────
export const getMyReferralCode = async (req, res) => {
  try {
    let user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, referralCode: true, firstName: true },
    });

    if (!user) return sendError(res, "User not found", 404);

    // Generate code if user doesn't have one yet
    if (!user.referralCode) {
      let code;
      let attempts = 0;
      do {
        code = makeCode();
        attempts++;
        const existing = await prisma.user.findUnique({
          where: { referralCode: code },
        });
        if (!existing) break;
      } while (attempts < 10);

      user = await prisma.user.update({
        where: { id: req.user.id },
        data: { referralCode: code },
        select: { id: true, referralCode: true, firstName: true },
      });
    }

    const referralLink = `${REFERRAL_CONFIG.APP_URL}/signup?ref=${user.referralCode}`;

    return sendResponse(res, {
      data: {
        code: user.referralCode,
        link: referralLink,
        shareText: `Join SkilledProz and earn more! Use my referral code ${user.referralCode} or sign up at ${referralLink}`,
        shareMessage: `Hey! I'm on SkilledProz — the easiest way to hire skilled workers or get hired. Sign up with my code ${user.referralCode} and get exclusive perks. ${referralLink}`,
      },
    });
  } catch (err) {
    console.error("getMyReferralCode:", err);
    return sendError(res, "Failed to retrieve referral code");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. VALIDATE A CODE (public)       GET /referral/validate/:code
// ─────────────────────────────────────────────────────────────────────────────
export const validateReferralCode = async (req, res) => {
  try {
    const { code } = req.params;
    if (!code?.trim()) return sendError(res, "Code is required", 400);

    const referrer = await prisma.user.findUnique({
      where: { referralCode: code.toUpperCase().trim() },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
        referralTier: true,
        successfulReferrals: true,
        isBanned: true,
        isActive: true,
      },
    });

    if (!referrer || !referrer.isActive || referrer.isBanned) {
      return sendError(res, "Invalid or inactive referral code", 404);
    }

    const tier = TIERS[referrer.referralTier] || TIERS.BRONZE;

    return sendResponse(res, {
      data: {
        valid: true,
        code,
        referrer: {
          name: `${referrer.firstName} ${referrer.lastName}`,
          avatar: referrer.avatar,
          tier: tier.label,
        },
        perks: {
          worker: REFEREE_PERKS.WORKER.description,
          hirer: REFEREE_PERKS.HIRER.description,
        },
      },
    });
  } catch (err) {
    return sendError(res, "Code validation failed");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. APPLY CODE ON SIGNUP (internal — called from auth.controller)
//    Call this AFTER creating the new user record.
// ─────────────────────────────────────────────────────────────────────────────
export const applyReferralOnSignup = async (newUserId, referralCode) => {
  if (!referralCode) return null;

  try {
    const code = referralCode.toUpperCase().trim();

    const referrer = await prisma.user.findUnique({
      where: { referralCode: code },
      select: {
        id: true,
        isActive: true,
        isBanned: true,
        referralTier: true,
        successfulReferrals: true,
        role: true,
      },
    });

    if (!referrer || !referrer.isActive || referrer.isBanned) return null;
    if (referrer.id === newUserId) return null; // self-referral guard

    // Check fraud: referrer hasn't exceeded MAX_PENDING_REFERRALS open referrals
    const openCount = await prisma.referral.count({
      where: {
        referrerId: referrer.id,
        status: { in: ["PENDING", "QUALIFIED"] },
      },
    });
    if (openCount >= REFERRAL_CONFIG.MAX_PENDING_REFERRALS) return null;

    const newUser = await prisma.user.findUnique({
      where: { id: newUserId },
      select: { role: true },
    });
    if (!newUser) return null;

    const perk = REFEREE_PERKS[newUser.role] || REFEREE_PERKS.HIRER;
    const bonus = tierBonus(referrer.referralTier, newUser.role);

    // Create referral record
    const referral = await prisma.referral.create({
      data: {
        referrerId: referrer.id,
        referredId: newUserId,
        code,
        status: "PENDING",
        referredRole: newUser.role,
        referrerBonus: bonus,
        refereePerk: JSON.stringify(perk),
        currency: REFERRAL_CONFIG.CURRENCY,
        expiresAt: expiryDate(),
      },
    });

    // Link the new user to their referrer
    await prisma.user.update({
      where: { id: newUserId },
      data: { referredById: referrer.id },
    });

    // Increment referrer's total count
    await prisma.user.update({
      where: { id: referrer.id },
      data: { totalReferrals: { increment: 1 } },
    });

    // Immediate cash bonus for HIRER referee (₦500 signup credit)
    if (newUser.role === "HIRER" && perk.cashBonus > 0) {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: newUserId },
          data: {
            walletBalance: { increment: perk.cashBonus },
            walletLifetimeTotal: { increment: perk.cashBonus },
          },
        }),
        prisma.walletTransaction.create({
          data: {
            userId: newUserId,
            type: "REFERRAL_BONUS",
            amount: perk.cashBonus,
            currency: REFERRAL_CONFIG.CURRENCY,
            description: `Welcome bonus — signed up with referral code ${code}`,
            referralId: referral.id,
            meta: { code, type: "SIGNUP_CREDIT" },
          },
        }),
      ]);
    }

    // Notify referrer
    await prisma.notification.create({
      data: {
        userId: referrer.id,
        title: "New Referral 🎉",
        body: `Someone just signed up using your referral code ${code}! You'll earn ₦${bonus.toLocaleString()} when they complete their first booking.`,
        type: "REFERRAL_SIGNUP",
        data: { referralId: referral.id, code },
      },
    });

    return referral;
  } catch (err) {
    console.error("applyReferralOnSignup error:", err);
    return null; // non-blocking — don't fail signup
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. QUALIFY REFERRAL (internal — call from auth.controller after email verify)
//    Marks the referred user as "profile qualified".
// ─────────────────────────────────────────────────────────────────────────────
export const qualifyReferral = async (userId) => {
  try {
    const referral = await prisma.referral.findUnique({
      where: { referredId: userId },
    });
    if (!referral || referral.status !== "PENDING") return;
    if (new Date() > referral.expiresAt) {
      await prisma.referral.update({
        where: { id: referral.id },
        data: { status: "EXPIRED" },
      });
      return;
    }

    await prisma.referral.update({
      where: { id: referral.id },
      data: { status: "QUALIFIED", qualifiedAt: new Date() },
    });
  } catch (err) {
    console.error("qualifyReferral error:", err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. CONVERT REFERRAL (internal — call from payment.controller on first payout
//    OR from booking.controller when first booking reaches COMPLETED)
//    Pass the userId of the referred user.
// ─────────────────────────────────────────────────────────────────────────────
export const convertReferral = async (
  referredUserId,
  firstBookingAmount = null,
) => {
  try {
    const referral = await prisma.referral.findUnique({
      where: { referredId: referredUserId },
      include: {
        referrer: {
          select: {
            id: true,
            referralTier: true,
            successfulReferrals: true,
            role: true,
          },
        },
        referred: { select: { id: true, role: true, firstName: true } },
      },
    });

    if (!referral) return;
    if (referral.status === "CONVERTED" || referral.status === "REWARDED")
      return;
    if (referral.status === "FLAGGED") return;
    if (new Date() > referral.expiresAt) {
      await prisma.referral.update({
        where: { id: referral.id },
        data: { status: "EXPIRED" },
      });
      return;
    }

    const { referrer, referred } = referral;

    // Base bonus for referrer's current tier at conversion time
    const currentTier = resolveTier(referrer.successfulReferrals);
    let earnedBonus = tierBonus(currentTier, referred.role);

    // ── Sustainability cap ────────────────────────────────────────────────────
    // Cap the payout to 85% of the platform revenue earned on this specific booking
    // so we never pay out more than we earned from it.
    if (
      firstBookingAmount &&
      firstBookingAmount >= REFERRAL_CONFIG.MIN_FIRST_BOOKING_VALUE
    ) {
      const fees = FEE_CONFIG.compute(firstBookingAmount);
      const maxFromBook = Math.floor(
        fees.totalPlatformRevenue *
          REFERRAL_CONFIG.MAX_SINGLE_BOOKING_PAYOUT_PCT,
      );
      if (maxFromBook < earnedBonus) {
        earnedBonus = Math.max(maxFromBook, 200); // floor at ₦200 to keep payout meaningful
      }
    }

    // Round to nearest ₦50 for cleaner display
    earnedBonus = Math.round(earnedBonus / 50) * 50;

    const rewardExpiry = new Date(
      Date.now() + REFERRAL_CONFIG.REWARD_EXPIRY_DAYS * 86_400_000,
    );

    await prisma.$transaction(async (tx) => {
      await tx.referral.update({
        where: { id: referral.id },
        data: {
          status: "REWARDED",
          referrerBonus: earnedBonus,
          convertedAt: new Date(),
          paidAt: new Date(),
        },
      });

      await tx.user.update({
        where: { id: referrer.id },
        data: {
          walletBalance: { increment: earnedBonus },
          walletLifetimeTotal: { increment: earnedBonus },
          successfulReferrals: { increment: 1 },
          referralTier: resolveTier(referrer.successfulReferrals + 1),
        },
      });

      await tx.walletTransaction.create({
        data: {
          userId: referrer.id,
          type: "REFERRAL_BONUS",
          amount: earnedBonus,
          currency: REFERRAL_CONFIG.CURRENCY,
          description: `Referral bonus — ${referred.firstName} completed their first booking`,
          referralId: referral.id,
          meta: {
            tier: currentTier,
            referredRole: referred.role,
            feePhase: FEE_CONFIG.phase, // ← NEW: tracks which phase paid this
            firstBookingAmount: firstBookingAmount || null, // ← NEW: for audit trail
            expiresAt: rewardExpiry,
          },
        },
      });

      const perk = REFEREE_PERKS[referred.role];
      if (referred.role === "WORKER" && perk.featuredBoostDays > 0) {
        const boostExpiry = new Date(
          Date.now() + perk.featuredBoostDays * 86_400_000,
        );
        await tx.featuredListing
          .create({
            data: {
              userId: referred.id,
              type: "REFERRAL_BOOST",
              price: 0,
              isPaid: true,
              expiresAt: boostExpiry,
              source: "REFERRAL",
            },
          })
          .catch(() => {});
      }

      await tx.notification.createMany({
        data: [
          {
            userId: referrer.id,
            title: `You earned ₦${earnedBonus.toLocaleString()}! 💰`,
            body: `${referred.firstName} completed their first booking. Bonus credited to your wallet. Tier: ${TIERS[currentTier]?.label}.`,
            type: "REFERRAL_CONVERTED",
            data: {
              referralId: referral.id,
              amount: earnedBonus,
              tier: currentTier,
            },
          },
          {
            userId: referred.id,
            title: "Your referral perks are now active! 🎁",
            body:
              perk.type === "BOOST_PLUS_FEE_WAIVER"
                ? `Your profile is featured for ${perk.featuredBoostDays} days and fees waived on your first ${perk.platformFeeWaiverJobs} jobs.`
                : `Your 5% discount is active on your next booking.`,
            type: "REFERRAL_PERK_ACTIVATED",
            data: { perk, referralId: referral.id },
          },
        ],
      });
    });

    return { success: true, earnedBonus };
  } catch (err) {
    console.error("convertReferral error:", err);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. MY REFERRAL DASHBOARD          GET /referral/dashboard
// ─────────────────────────────────────────────────────────────────────────────
export const getMyReferralDashboard = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        referralCode: true,
        referralTier: true,
        totalReferrals: true,
        successfulReferrals: true,
        walletBalance: true,
        walletLifetimeTotal: true,
        firstName: true,
        lastName: true,
      },
    });
    if (!user) return sendError(res, "User not found", 404);

    // Auto-generate code if missing
    if (!user.referralCode) {
      const code = makeCode();
      await prisma.user.update({
        where: { id: req.user.id },
        data: { referralCode: code },
      });
      user.referralCode = code;
    }

    const [referrals, walletTransactions, leaderboardRank] = await Promise.all([
      prisma.referral.findMany({
        where: { referrerId: req.user.id },
        include: {
          referred: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              role: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.walletTransaction.findMany({
        where: { userId: req.user.id, type: "REFERRAL_BONUS" },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      // Leaderboard rank by successful referrals
      prisma.user.count({
        where: {
          successfulReferrals: { gt: user.successfulReferrals },
          isActive: true,
        },
      }),
    ]);

    const currentTier = resolveTier(user.successfulReferrals);
    const tier = TIERS[currentTier];
    const nextTierKey = Object.keys(TIERS).find(
      (k) => TIERS[k].min > user.successfulReferrals,
    );
    const nextTier = nextTierKey ? TIERS[nextTierKey] : null;

    const referralsByStatus = referrals.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});

    return sendResponse(res, {
      data: {
        code: user.referralCode,
        link: `${REFERRAL_CONFIG.APP_URL}/signup?ref=${user.referralCode}`,
        shareText: `Sign up on SkilledProz with my code ${user.referralCode} and get exclusive perks! ${REFERRAL_CONFIG.APP_URL}/signup?ref=${user.referralCode}`,

        stats: {
          totalReferrals: user.totalReferrals,
          successfulReferrals: user.successfulReferrals,
          pendingReferrals: referralsByStatus.PENDING || 0,
          qualifiedReferrals: referralsByStatus.QUALIFIED || 0,
          convertedReferrals: referralsByStatus.CONVERTED || 0,
          rewardedReferrals: referralsByStatus.REWARDED || 0,
        },

        tier: {
          current: tier.label,
          key: currentTier,
          badge: tier.badge,
          workerBonus: tier.workerBonus,
          hirerBonus: tier.hirerBonus,
          successCount: user.successfulReferrals,
          nextTierLabel: nextTier?.label || "You're at the top!",
          nextTierAt: nextTier?.min || null,
          referralsToNext: nextTier
            ? Math.max(0, nextTier.min - user.successfulReferrals)
            : 0,
          progressPct: nextTier
            ? Math.min(
                100,
                Math.round(
                  ((user.successfulReferrals - tier.min) /
                    (nextTier.min - tier.min)) *
                    100,
                ),
              )
            : 100,
        },

        wallet: {
          balance: user.walletBalance,
          lifetimeTotal: user.walletLifetimeTotal,
          currency: REFERRAL_CONFIG.CURRENCY,
          canWithdraw: user.walletBalance >= REFERRAL_CONFIG.MIN_WITHDRAWAL,
          minWithdrawal: REFERRAL_CONFIG.MIN_WITHDRAWAL,
        },

        perks: {
          whatYouEarn: {
            worker: `₦${tier.workerBonus.toLocaleString()} per worker who completes their first job`,
            hirer: `₦${tier.hirerBonus.toLocaleString()} per hirer who completes their first booking`,
          },
          whatTheyGet: {
            worker: REFEREE_PERKS.WORKER.description,
            hirer: REFEREE_PERKS.HIRER.description,
          },
        },

        leaderboardRank: leaderboardRank + 1,
        referrals: referrals.map((r) => ({
          id: r.id,
          status: r.status,
          role: r.referredRole,
          name: `${r.referred.firstName} ${r.referred.lastName}`,
          avatar: r.referred.avatar,
          bonus: r.referrerBonus,
          paidAt: r.paidAt,
          joinedAt: r.referred.createdAt,
          convertedAt: r.convertedAt,
          expiresAt: r.expiresAt,
        })),
        recentEarnings: walletTransactions,
      },
    });
  } catch (err) {
    console.error("getMyReferralDashboard:", err);
    return sendError(res, "Failed to load referral dashboard");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. GET MY WALLET                  GET /referral/wallet
// ─────────────────────────────────────────────────────────────────────────────
export const getMyWallet = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);

    const [user, transactions, total] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.user.id },
        select: { walletBalance: true, walletLifetimeTotal: true },
      }),
      prisma.walletTransaction.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.walletTransaction.count({ where: { userId: req.user.id } }),
    ]);

    return sendResponse(res, {
      data: {
        balance: user.walletBalance,
        lifetimeTotal: user.walletLifetimeTotal,
        currency: REFERRAL_CONFIG.CURRENCY,
        canWithdraw: user.walletBalance >= REFERRAL_CONFIG.MIN_WITHDRAWAL,
        minWithdrawal: REFERRAL_CONFIG.MIN_WITHDRAWAL,
        transactions,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to load wallet");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. WITHDRAW REFERRAL EARNINGS     POST /referral/withdraw
// ─────────────────────────────────────────────────────────────────────────────
export const withdrawReferralEarnings = async (req, res) => {
  try {
    const { amount, bankName, accountNumber, accountName } = req.body;

    if (!amount || !bankName || !accountNumber || !accountName) {
      return sendError(
        res,
        "amount, bankName, accountNumber and accountName are required",
        400,
      );
    }

    const withdrawAmount = parseFloat(amount);
    if (
      isNaN(withdrawAmount) ||
      withdrawAmount < REFERRAL_CONFIG.MIN_WITHDRAWAL
    ) {
      return sendError(
        res,
        `Minimum withdrawal is ₦${REFERRAL_CONFIG.MIN_WITHDRAWAL.toLocaleString()}`,
        400,
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { walletBalance: true, firstName: true, lastName: true },
    });

    if (!user) return sendError(res, "User not found", 404);
    if (user.walletBalance < withdrawAmount) {
      return sendError(
        res,
        `Insufficient wallet balance. Available: ₦${user.walletBalance.toLocaleString()}`,
        400,
      );
    }

    // Debit wallet and create pending withdrawal
    await prisma.$transaction([
      prisma.user.update({
        where: { id: req.user.id },
        data: { walletBalance: { decrement: withdrawAmount } },
      }),
      prisma.walletTransaction.create({
        data: {
          userId: req.user.id,
          type: "WITHDRAWAL",
          amount: -withdrawAmount,
          currency: REFERRAL_CONFIG.CURRENCY,
          description: `Wallet withdrawal to ${bankName} — ${accountNumber}`,
          meta: { bankName, accountNumber, accountName, status: "PENDING" },
        },
      }),
      // Also create a system withdrawal request (reuses existing Withdrawal model)
      prisma.withdrawal
        .create({
          data: {
            workerId: req.user.id,
            amount: withdrawAmount,
            currency: REFERRAL_CONFIG.CURRENCY,
            method: "BANK_TRANSFER",
            destination: accountNumber,
            status: "PENDING",
            meta: JSON.stringify({
              source: "REFERRAL_WALLET",
              bankName,
              accountName,
            }),
          },
        })
        .catch(() => {}), // graceful fallback if Withdrawal model differs
    ]);

    await prisma.notification.create({
      data: {
        userId: req.user.id,
        title: "Withdrawal Request Submitted 💸",
        body: `Your withdrawal of ₦${withdrawAmount.toLocaleString()} is being processed. It will reflect in your ${bankName} account within 1–3 business days.`,
        type: "WALLET_WITHDRAWAL",
        data: { amount: withdrawAmount, bankName, accountNumber },
      },
    });

    return sendResponse(res, {
      message:
        "Withdrawal request submitted. Processing within 1–3 business days.",
      data: {
        amount: withdrawAmount,
        newBalance: parseFloat(
          (user.walletBalance - withdrawAmount).toFixed(2),
        ),
        currency: REFERRAL_CONFIG.CURRENCY,
        bankName,
        accountNumber,
      },
    });
  } catch (err) {
    console.error("withdrawReferralEarnings:", err);
    return sendError(res, "Withdrawal failed");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. LEADERBOARD (public)           GET /referral/leaderboard
// ─────────────────────────────────────────────────────────────────────────────

export const getReferralLeaderboard = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100); // cap at 100
    const userId = req.user.id;

    // Fetch the current user's count first so we can use it in the parallel query
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { successfulReferrals: true },
    });
    const myCount = me?.successfulReferrals || 0;

    const [topReferrers, usersAhead] = await Promise.all([
      prisma.user.findMany({
        where: {
          successfulReferrals: { gt: 0 },
          isActive: true,
          isBanned: false,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
          referralTier: true,
          successfulReferrals: true,
          walletLifetimeTotal: true,
        },
        orderBy: { successfulReferrals: "desc" },
        take: limit, // ← was `take` (undefined) — now correctly `limit`
      }),
      prisma.user.count({
        where: { successfulReferrals: { gt: myCount }, isActive: true },
      }),
    ]);

    return sendResponse(res, {
      data: {
        leaderboard: topReferrers.map((u, i) => ({
          rank: i + 1,
          name: `${u.firstName} ${u.lastName}`,
          avatar: u.avatar,
          tier: TIERS[u.referralTier]?.label || "🥉 Bronze",
          badge: TIERS[u.referralTier]?.badge || "bronze",
          referrals: u.successfulReferrals,
          earned: u.walletLifetimeTotal,
          isMe: u.id === userId,
        })),
        myRank: usersAhead + 1,
        currency: REFERRAL_CONFIG.CURRENCY,
        tiers: Object.entries(TIERS).map(([key, cfg]) => ({
          key,
          label: cfg.label,
          badge: cfg.badge,
          minReferrals: cfg.min,
          workerBonus: cfg.workerBonus,
          hirerBonus: cfg.hirerBonus,
        })),
      },
    });
  } catch (err) {
    console.error("getReferralLeaderboard:", err);
    return sendError(res, "Failed to load leaderboard");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. APPLY REFEREE DISCOUNT (internal — call from payment.controller)
//     Returns the discount amount to deduct from the hirer's first booking.
// ─────────────────────────────────────────────────────────────────────────────
export const getHirerFirstBookingDiscount = async (hirerId, bookingAmount) => {
  try {
    // Only applies if user was referred AND has never completed a booking before
    const [referral, completedBookings] = await Promise.all([
      prisma.referral.findUnique({
        where: { referredId: hirerId },
        select: { id: true, status: true, referredRole: true },
      }),
      prisma.booking.count({
        where: { hirerId, status: "COMPLETED" },
      }),
    ]);

    if (!referral || referral.referredRole !== "HIRER") return 0;
    if (completedBookings > 0) return 0; // only on very first booking
    if (!["PENDING", "QUALIFIED"].includes(referral.status)) return 0;

    const perk = REFEREE_PERKS.HIRER;
    const discount = Math.min(
      bookingAmount * perk.discountRate,
      perk.maxDiscountAmount,
    );

    return parseFloat(discount.toFixed(2));
  } catch {
    return 0;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ── ADMIN ENDPOINTS ───────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// GET /admin/referrals
export const adminGetAllReferrals = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;
    const { skip, take } = paginate(page, limit);
    const where = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { referrer: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [referrals, total, stats] = await Promise.all([
      prisma.referral.findMany({
        where,
        skip,
        take,
        include: {
          referrer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              referralTier: true,
            },
          },
          referred: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.referral.count({ where }),
      prisma.referral.groupBy({
        by: ["status"],
        _count: true,
        _sum: { referrerBonus: true },
      }),
    ]);

    return sendResponse(res, {
      data: {
        referrals,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
        stats: stats.reduce((acc, s) => {
          acc[s.status] = { count: s._count, totalBonus: s._sum.referrerBonus };
          return acc;
        }, {}),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch referrals");
  }
};

// GET /admin/referrals/stats
export const adminGetReferralStats = async (req, res) => {
  try {
    const [
      totalReferrals,
      totalPaid,
      topReferrers,
      recentConversions,
      walletStats,
    ] = await Promise.all([
      prisma.referral.count(),
      prisma.referral.aggregate({
        where: { status: "REWARDED" },
        _sum: { referrerBonus: true },
        _count: true,
      }),
      prisma.user.findMany({
        where: { successfulReferrals: { gt: 0 } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          successfulReferrals: true,
          walletLifetimeTotal: true,
          referralTier: true,
        },
        orderBy: { successfulReferrals: "desc" },
        take: 10,
      }),
      prisma.referral.findMany({
        where: { status: "REWARDED" },
        orderBy: { convertedAt: "desc" },
        take: 10,
        include: {
          referrer: { select: { firstName: true, lastName: true } },
          referred: { select: { firstName: true, role: true } },
        },
      }),
      prisma.user.aggregate({
        _sum: { walletBalance: true, walletLifetimeTotal: true },
      }),
    ]);

    const byStatus = await prisma.referral.groupBy({
      by: ["status"],
      _count: true,
    });

    return sendResponse(res, {
      data: {
        overview: {
          totalReferrals,
          totalConverted: totalPaid._count,
          totalPaidOut: totalPaid._sum.referrerBonus || 0,
          totalWalletBalance: walletStats._sum.walletBalance || 0,
          totalWalletEarned: walletStats._sum.walletLifetimeTotal || 0,
          currency: REFERRAL_CONFIG.CURRENCY,
        },
        byStatus: byStatus.reduce(
          (acc, s) => ({ ...acc, [s.status]: s._count }),
          {},
        ),
        topReferrers,
        recentConversions,
        tierBreakdown: Object.fromEntries(
          Object.entries(TIERS).map(([k, v]) => [k, v.label]),
        ),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch referral stats");
  }
};

// PATCH /admin/referrals/:id/flag
export const adminFlagReferral = async (req, res) => {
  try {
    const { reason } = req.body;
    const referral = await prisma.referral.findUnique({
      where: { id: req.params.id },
    });
    if (!referral) return sendError(res, "Referral not found", 404);

    await prisma.referral.update({
      where: { id: req.params.id },
      data: { status: "FLAGGED" },
    });

    // If already rewarded, claw back the bonus
    if (referral.status === "REWARDED" && referral.referrerBonus > 0) {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: referral.referrerId },
          data: {
            walletBalance: { decrement: referral.referrerBonus },
            successfulReferrals: { decrement: 1 },
          },
        }),
        prisma.walletTransaction.create({
          data: {
            userId: referral.referrerId,
            type: "ADJUSTMENT",
            amount: -referral.referrerBonus,
            currency: REFERRAL_CONFIG.CURRENCY,
            description: `Referral bonus reversed — flagged as fraudulent. Reason: ${reason || "Policy violation"}`,
            referralId: referral.id,
          },
        }),
      ]);
    }

    await prisma.notification.create({
      data: {
        userId: referral.referrerId,
        title: "Referral Flagged",
        body: `One of your referrals has been flagged for review. ${reason ? "Reason: " + reason : ""}`,
        type: "REFERRAL_FLAGGED",
      },
    });

    return sendResponse(res, {
      message: "Referral flagged and bonus reversed if applicable",
    });
  } catch (err) {
    return sendError(res, "Failed to flag referral");
  }
};

// POST /admin/referrals/adjust-wallet
export const adminAdjustWallet = async (req, res) => {
  try {
    const { userId, amount, description, type = "ADJUSTMENT" } = req.body;
    if (!userId || !amount || !description) {
      return sendError(res, "userId, amount and description required", 400);
    }

    const amt = parseFloat(amount);
    if (isNaN(amt)) return sendError(res, "Invalid amount", 400);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { walletBalance: true },
    });
    if (!user) return sendError(res, "User not found", 404);

    const newBalance = Math.max(0, user.walletBalance + amt);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          walletBalance: newBalance,
          walletLifetimeTotal: amt > 0 ? { increment: amt } : undefined,
        },
      }),
      prisma.walletTransaction.create({
        data: {
          userId,
          type,
          amount: amt,
          currency: REFERRAL_CONFIG.CURRENCY,
          description,
          meta: { adminAdjustment: true, adminId: req.user.id },
        },
      }),
    ]);

    return sendResponse(res, {
      message: "Wallet adjusted successfully",
      data: {
        userId,
        adjustment: amt,
        newBalance,
        currency: REFERRAL_CONFIG.CURRENCY,
      },
    });
  } catch (err) {
    return sendError(res, "Wallet adjustment failed");
  }
};

// PATCH /admin/referrals/:id/manual-reward
export const adminManualReward = async (req, res) => {
  try {
    const { bonusOverride, notes } = req.body;
    const referral = await prisma.referral.findUnique({
      where: { id: req.params.id },
      include: {
        referrer: true,
        referred: { select: { firstName: true, role: true } },
      },
    });
    if (!referral) return sendError(res, "Referral not found", 404);
    if (referral.status === "REWARDED")
      return sendError(res, "Already rewarded", 400);
    if (referral.status === "FLAGGED")
      return sendError(res, "Referral is flagged", 400);

    const bonus = bonusOverride
      ? parseFloat(bonusOverride)
      : tierBonus(referral.referrer.referralTier, referral.referredRole);

    await prisma.$transaction([
      prisma.referral.update({
        where: { id: referral.id },
        data: {
          status: "REWARDED",
          referrerBonus: bonus,
          paidAt: new Date(),
          convertedAt: new Date(),
        },
      }),
      prisma.user.update({
        where: { id: referral.referrerId },
        data: {
          walletBalance: { increment: bonus },
          walletLifetimeTotal: { increment: bonus },
          successfulReferrals: { increment: 1 },
          referralTier: resolveTier(referral.referrer.successfulReferrals + 1),
        },
      }),
      prisma.walletTransaction.create({
        data: {
          userId: referral.referrerId,
          type: "REFERRAL_BONUS",
          amount: bonus,
          currency: REFERRAL_CONFIG.CURRENCY,
          description: `Manual referral reward — ${referral.referred.firstName}. ${notes || "Admin approved."}`,
          referralId: referral.id,
          meta: { manual: true, adminId: req.user.id, notes },
        },
      }),
      prisma.notification.create({
        data: {
          userId: referral.referrerId,
          title: `Referral Reward Credited — ₦${bonus.toLocaleString()}`,
          body: `Your referral reward of ₦${bonus.toLocaleString()} has been manually approved and added to your wallet.`,
          type: "REFERRAL_CONVERTED",
          data: { referralId: referral.id, amount: bonus },
        },
      }),
    ]);

    return sendResponse(res, {
      message: "Referral manually rewarded",
      data: { bonus, referralId: referral.id },
    });
  } catch (err) {
    return sendError(res, "Manual reward failed");
  }
};

// PATCH /admin/referrals/:id/expire
export const adminExpireReferral = async (req, res) => {
  try {
    const referral = await prisma.referral.findUnique({
      where: { id: req.params.id },
    });
    if (!referral) return sendError(res, "Referral not found", 404);
    if (["REWARDED", "FLAGGED"].includes(referral.status)) {
      return sendError(res, `Cannot expire a ${referral.status} referral`, 400);
    }

    await prisma.referral.update({
      where: { id: req.params.id },
      data: { status: "EXPIRED" },
    });

    return sendResponse(res, { message: "Referral marked as expired" });
  } catch (err) {
    return sendError(res, "Failed to expire referral");
  }
};
