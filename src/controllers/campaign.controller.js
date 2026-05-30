// src/controllers/campaign.controller.js
// ── Daily Referral Campaign — separate from the main referral program ─────────
//
// How it works:
//   1. Referred user signs up using referrer's code → CampaignReferral created
//   2. Referred user completes tasks:
//        a. Download app (auto-true on signup)
//        b. Set up profile (auto-detected from DB)
//        c. Follow Facebook  }
//        d. Follow Instagram }  user self-reports + optional screenshot
//        e. Follow TikTok    }
//   3. Referrer sees TASKS_DONE referrals in their dashboard
//   4. Referrer submits their daily batch (once per day)
//   5. Admin reviews — approves/rejects each referral
//   6. Approved: ₦100 credited to referrer's campaign wallet
//   7. Rejected: deducted from gross payout (admin has final say)
//   8. Referrer can withdraw from campaign wallet (min ₦500) any time
//
// ─── Add to schema.prisma (prisma generate after migration) ──────────────────
//
//  Add to User model:

//
//  model CampaignReferral { ... }  — see migration script
//  model CampaignSubmission { ... }
//  model CampaignTransaction { ... }
//  model CampaignWithdrawal { ... }
//  enum CampaignReferralStatus { PENDING TASKS_DONE SUBMITTED APPROVED REJECTED }
//  enum CampaignSubmissionStatus { PENDING REVIEWING APPROVED PARTIAL REJECTED }
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { paginate, paginationMeta, fullName, formatCurrency, truncate, slugify, uniqueRef, parseJSON, extractIP, timeAgo, safeUser } from "../utils/helpers.js";
// ── Campaign Configuration ────────────────────────────────────────────────────
export const CAMPAIGN_CONFIG = {
  REWARD_PER_REFERRAL: 100, // ₦100 per fully qualified referral
  MIN_WITHDRAWAL: 500, // ₦500 minimum withdrawal
  CURRENCY: "NGN",
  MAX_DAILY_REFERRALS: 50, // fraud guard — max per day per user
  SOCIAL: {
    facebook: process.env.FACEBOOK_URL || "https://facebook.com/skilledproz",
    instagram: process.env.INSTAGRAM_URL || "https://instagram.com/skilledproz",
    tiktok: process.env.TIKTOK_URL || "https://tiktok.com/@skilledproz",
  },
};

// All 5 tasks a referred user must complete
const REQUIRED_TASKS = [
  { key: "hasDownloadedApp", label: "Download the app", auto: true },
  { key: "hasSetupProfile", label: "Set up profile", auto: false },
  { key: "hasFollowedFb", label: "Follow on Facebook", auto: false },
  { key: "hasFollowedIg", label: "Follow on Instagram", auto: false },
  { key: "hasFollowedTt", label: "Follow on TikTok", auto: false },
];

function allTasksDone(ref) {
  return REQUIRED_TASKS.every((t) => ref[t.key] === true);
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL — called from auth.controller after new user is created
// ─────────────────────────────────────────────────────────────────────────────
export const registerCampaignReferral = async (newUserId, referralCode) => {
  if (!referralCode) return null;
  try {
    const code = referralCode.toUpperCase().trim();

    const referrer = await prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true, isActive: true, isBanned: true },
    });
    if (!referrer || !referrer.isActive || referrer.isBanned) return null;
    if (referrer.id === newUserId) return null; // self-referral guard

    // Guard: max daily referrals
    const todayCount = await prisma.campaignReferral.count({
      where: {
        referrerId: referrer.id,
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    });
    if (todayCount >= CAMPAIGN_CONFIG.MAX_DAILY_REFERRALS) return null;

    // Already has a campaign referral?
    const existing = await prisma.campaignReferral.findUnique({
      where: { referredId: newUserId },
    });
    if (existing) return existing;

    const referral = await prisma.campaignReferral.create({
      data: {
        referrerId: referrer.id,
        referredId: newUserId,
        code,
        hasDownloadedApp: true, // auto-true — they just signed up
        rewardAmount: CAMPAIGN_CONFIG.REWARD_PER_REFERRAL,
        currency: CAMPAIGN_CONFIG.CURRENCY,
        status: "PENDING",
      },
    });

    // Notify referrer
    await prisma.notification.create({
      data: {
        userId: referrer.id,
        title: "New campaign referral! 🎯",
        body: "Someone signed up with your code. They need to complete their tasks before you can submit them.",
        type: "CAMPAIGN_REFERRAL_SIGNUP",
        data: { campaignReferralId: referral.id },
      },
    });

    return referral;
  } catch (err) {
    console.error("registerCampaignReferral error:", err);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL — call this when a user completes their profile
//            (e.g. from user.controller after profile update)
// ─────────────────────────────────────────────────────────────────────────────
export const markProfileSetupComplete = async (userId) => {
  try {
    const ref = await prisma.campaignReferral.findUnique({
      where: { referredId: userId },
    });
    if (!ref || ref.hasSetupProfile) return;

    const updated = await prisma.campaignReferral.update({
      where: { id: ref.id },
      data: {
        hasSetupProfile: true,
        // Check if all tasks are now done
        ...(ref.hasFollowedFb && ref.hasFollowedIg && ref.hasFollowedTt
          ? {
              status: "TASKS_DONE",
              tasksCompletedAt: new Date(),
            }
          : {}),
        updatedAt: new Date(),
      },
    });

    // Notify referrer if all tasks are now done
    if (updated.status === "TASKS_DONE") {
      await prisma.notification.create({
        data: {
          userId: ref.referrerId,
          title: "Referral ready! ✅",
          body: "One of your referrals has completed all tasks. Submit your daily batch to earn ₦100.",
          type: "CAMPAIGN_TASKS_DONE",
          data: { campaignReferralId: ref.id },
        },
      });
    }
  } catch (err) {
    console.error("markProfileSetupComplete error:", err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET CAMPAIGN STATUS       GET /campaign/status
// ─────────────────────────────────────────────────────────────────────────────
export const getCampaignStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    const [user, referrals, todaySubmission, pendingWithdrawals] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            campaignWalletBalance: true,
            campaignWalletLifetimeTotal: true,
          },
        }),
        prisma.campaignReferral.findMany({
          where: { referrerId: userId },
          select: {
            id: true,
            status: true,
            hasDownloadedApp: true,
            hasSetupProfile: true,
            hasFollowedFb: true,
            hasFollowedIg: true,
            hasFollowedTt: true,
            rewardAmount: true,
            createdAt: true,
            referred: {
              select: { firstName: true, lastName: true, avatar: true },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.campaignSubmission.findUnique({
          where: {
            referrerId_submissionDate: {
              referrerId: userId,
              submissionDate: todayDateString(),
            },
          },
        }),
        prisma.campaignWithdrawal.count({
          where: { userId, status: "PENDING" },
        }),
      ]);

    // Categorise today's referrals
    const today = new Date().setHours(0, 0, 0, 0);
    const todayReferrals = referrals.filter(
      (r) => new Date(r.createdAt) >= today,
    );

    const readyToSubmit = referrals.filter(
      (r) => r.status === "TASKS_DONE" && !todaySubmission,
    );
    const pendingTasks = referrals.filter((r) => r.status === "PENDING");
    const approvedTotal = referrals.filter(
      (r) => r.status === "APPROVED",
    ).length;

    return sendResponse(res, {
      data: {
        wallet: {
          balance: user?.campaignWalletBalance || 0,
          lifetimeTotal: user?.campaignWalletLifetimeTotal || 0,
          currency: CAMPAIGN_CONFIG.CURRENCY,
          canWithdraw:
            (user?.campaignWalletBalance || 0) >=
            CAMPAIGN_CONFIG.MIN_WITHDRAWAL,
          minWithdrawal: CAMPAIGN_CONFIG.MIN_WITHDRAWAL,
          pendingWithdrawals,
        },
        stats: {
          totalReferred: referrals.length,
          todayReferred: todayReferrals.length,
          readyToSubmit: readyToSubmit.length,
          pendingTasks: pendingTasks.length,
          totalApproved: approvedTotal,
          totalEarnings: approvedTotal * CAMPAIGN_CONFIG.REWARD_PER_REFERRAL,
        },
        todaySubmission: todaySubmission
          ? {
              id: todaySubmission.id,
              status: todaySubmission.status,
              totalSubmitted: todaySubmission.totalSubmitted,
              totalApproved: todaySubmission.totalApproved,
              netAmount: todaySubmission.netAmount,
              submittedAt: todaySubmission.createdAt,
            }
          : null,
        alreadySubmittedToday: !!todaySubmission,
        rewardPerReferral: CAMPAIGN_CONFIG.REWARD_PER_REFERRAL,
        social: CAMPAIGN_CONFIG.SOCIAL,
        tasks: REQUIRED_TASKS,
      },
    });
  } catch (err) {
    console.error("getCampaignStatus:", err);
    return sendError(res, "Failed to load campaign status");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET MY CAMPAIGN REFERRALS   GET /campaign/referrals
// ─────────────────────────────────────────────────────────────────────────────
export const getMyCampaignReferrals = async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const { skip, take } = paginate(page, limit);
    const where = { referrerId: req.user.id };
    if (status) where.status = status;

    const [referrals, total] = await Promise.all([
      prisma.campaignReferral.findMany({
        where,
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
        skip,
        take,
      }),
      prisma.campaignReferral.count({ where }),
    ]);

    return sendResponse(res, {
      data: {
        referrals: referrals.map((r) => ({
          id: r.id,
          status: r.status,
          rewardAmount: r.rewardAmount,
          name: `${r.referred.firstName} ${r.referred.lastName}`,
          avatar: r.referred.avatar,
          role: r.referred.role,
          joinedAt: r.referred.createdAt,
          tasks: {
            hasDownloadedApp: r.hasDownloadedApp,
            hasSetupProfile: r.hasSetupProfile,
            hasFollowedFb: r.hasFollowedFb,
            hasFollowedIg: r.hasFollowedIg,
            hasFollowedTt: r.hasFollowedTt,
            completedCount: [
              r.hasDownloadedApp,
              r.hasSetupProfile,
              r.hasFollowedFb,
              r.hasFollowedIg,
              r.hasFollowedTt,
            ].filter(Boolean).length,
            totalCount: 5,
          },
          adminNote: r.adminNote,
          submittedAt: r.submittedAt,
          reviewedAt: r.reviewedAt,
        })),
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch campaign referrals");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. REFERRED USER REPORTS SOCIAL FOLLOW
//    POST /campaign/my-tasks/social
//    (called by the REFERRED USER on their own dashboard)
// ─────────────────────────────────────────────────────────────────────────────
export const reportSocialFollow = async (req, res) => {
  try {
    const { platform, screenshotUrl } = req.body;
    const validPlatforms = ["facebook", "instagram", "tiktok"];
    if (!validPlatforms.includes(platform)) {
      return sendError(
        res,
        "platform must be: facebook | instagram | tiktok",
        400,
      );
    }

    // Find the campaign referral where THIS user is the referred one
    const ref = await prisma.campaignReferral.findUnique({
      where: { referredId: req.user.id },
    });
    if (!ref)
      return sendError(res, "No campaign referral found for your account", 404);
    if (["SUBMITTED", "APPROVED", "REJECTED"].includes(ref.status)) {
      return sendError(
        res,
        "This referral has already been submitted or reviewed",
        400,
      );
    }

    const fieldMap = {
      facebook: { flag: "hasFollowedFb", proof: "fbScreenshotUrl" },
      instagram: { flag: "hasFollowedIg", proof: "igScreenshotUrl" },
      tiktok: { flag: "hasFollowedTt", proof: "ttScreenshotUrl" },
    };
    const { flag, proof } = fieldMap[platform];

    const updateData = {
      [flag]: true,
      [proof]: screenshotUrl || null,
      updatedAt: new Date(),
    };

    // Fetch fresh to check if all tasks complete after this update
    const fresh = await prisma.campaignReferral.findUnique({
      where: { id: ref.id },
    });
    const afterUpdate = { ...fresh, [flag]: true };

    if (allTasksDone(afterUpdate) && fresh.status === "PENDING") {
      updateData.status = "TASKS_DONE";
      updateData.tasksCompletedAt = new Date();
    }

    const updated = await prisma.campaignReferral.update({
      where: { id: ref.id },
      data: updateData,
    });

    // Notify the referrer when all tasks are done
    if (updated.status === "TASKS_DONE") {
      const you = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { firstName: true },
      });
      await prisma.notification.create({
        data: {
          userId: ref.referrerId,
          title: "Referral tasks completed! ✅",
          body: `${you?.firstName || "Someone"} has completed all campaign tasks. Submit today's batch to earn ₦${ref.rewardAmount}.`,
          type: "CAMPAIGN_TASKS_DONE",
          data: { campaignReferralId: ref.id },
        },
      });
    }

    return sendResponse(res, {
      message: `${platform} follow recorded${updated.status === "TASKS_DONE" ? " — all tasks complete!" : ""}`,
      data: {
        tasksCompleted: [
          updated.hasDownloadedApp,
          updated.hasSetupProfile,
          updated.hasFollowedFb,
          updated.hasFollowedIg,
          updated.hasFollowedTt,
        ].filter(Boolean).length,
        allDone: updated.status === "TASKS_DONE",
        status: updated.status,
      },
    });
  } catch (err) {
    console.error("reportSocialFollow:", err);
    return sendError(res, "Failed to record social follow");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. REFERRED USER GETS THEIR OWN TASK STATUS
//    GET /campaign/my-tasks
// ─────────────────────────────────────────────────────────────────────────────
export const getMyTaskStatus = async (req, res) => {
  try {
    const ref = await prisma.campaignReferral.findUnique({
      where: { referredId: req.user.id },
      select: {
        id: true,
        status: true,
        hasDownloadedApp: true,
        hasSetupProfile: true,
        hasFollowedFb: true,
        hasFollowedIg: true,
        hasFollowedTt: true,
        fbScreenshotUrl: true,
        igScreenshotUrl: true,
        ttScreenshotUrl: true,
        tasksCompletedAt: true,
      },
    });

    if (!ref) {
      return sendResponse(res, {
        data: {
          hasCampaignReferral: false,
          message: "You did not sign up using a referral code.",
        },
      });
    }

    const tasks = [
      {
        key: "hasDownloadedApp",
        label: "Download the SkilledProz app",
        done: ref.hasDownloadedApp,
        auto: true,
      },
      {
        key: "hasSetupProfile",
        label: "Complete your profile setup",
        done: ref.hasSetupProfile,
        auto: true,
        hint: "Fill in your name, role, and profile picture",
      },
      {
        key: "hasFollowedFb",
        label: "Follow us on Facebook",
        done: ref.hasFollowedFb,
        link: CAMPAIGN_CONFIG.SOCIAL.facebook,
        proofUrl: ref.fbScreenshotUrl,
      },
      {
        key: "hasFollowedIg",
        label: "Follow us on Instagram",
        done: ref.hasFollowedIg,
        link: CAMPAIGN_CONFIG.SOCIAL.instagram,
        proofUrl: ref.igScreenshotUrl,
      },
      {
        key: "hasFollowedTt",
        label: "Follow us on TikTok",
        done: ref.hasFollowedTt,
        link: CAMPAIGN_CONFIG.SOCIAL.tiktok,
        proofUrl: ref.ttScreenshotUrl,
      },
    ];

    return sendResponse(res, {
      data: {
        hasCampaignReferral: true,
        status: ref.status,
        allDone:
          ref.status === "TASKS_DONE" ||
          ref.status === "SUBMITTED" ||
          ref.status === "APPROVED",
        completedAt: ref.tasksCompletedAt,
        tasks,
        completedCount: tasks.filter((t) => t.done).length,
        totalCount: tasks.length,
        social: CAMPAIGN_CONFIG.SOCIAL,
      },
    });
  } catch (err) {
    return sendError(res, "Failed to load task status");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. SUBMIT DAILY CAMPAIGN        POST /campaign/submit
//    Submits all TASKS_DONE referrals for admin review.
//    One submission per day per user.
// ─────────────────────────────────────────────────────────────────────────────
export const submitDailyCampaign = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = todayDateString();

    // Already submitted today?
    const existing = await prisma.campaignSubmission.findUnique({
      where: {
        referrerId_submissionDate: {
          referrerId: userId,
          submissionDate: today,
        },
      },
    });
    if (existing) {
      return sendError(
        res,
        "You have already submitted for today. Come back tomorrow!",
        400,
      );
    }

    // Fetch all TASKS_DONE referrals not yet submitted
    const ready = await prisma.campaignReferral.findMany({
      where: {
        referrerId: userId,
        status: "TASKS_DONE",
        submissionId: null,
      },
      include: {
        referred: { select: { firstName: true, lastName: true } },
      },
    });

    if (ready.length === 0) {
      return sendError(
        res,
        "No ready referrals to submit. Your referred users need to complete all tasks first.",
        400,
      );
    }

    const grossAmount = ready.length * CAMPAIGN_CONFIG.REWARD_PER_REFERRAL;

    // Create submission + update all referrals atomically
    const submission = await prisma.$transaction(async (tx) => {
      const sub = await tx.campaignSubmission.create({
        data: {
          referrerId: userId,
          submissionDate: today,
          totalSubmitted: ready.length,
          grossAmount,
          netAmount: 0, // set by admin on review
          status: "PENDING",
        },
      });

      await tx.campaignReferral.updateMany({
        where: { id: { in: ready.map((r) => r.id) } },
        data: {
          status: "SUBMITTED",
          submissionId: sub.id,
          submittedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return sub;
    });

    // Notify admins
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        title: "Daily Campaign Submission 📋",
        body: `User submitted ${ready.length} referral${ready.length !== 1 ? "s" : ""} for review. Gross: ₦${grossAmount.toLocaleString()}`,
        type: "CAMPAIGN_SUBMISSION",
        data: { submissionId: submission.id, count: ready.length, grossAmount },
      })),
    });

    return sendResponse(res, {
      status: 201,
      message: `Submitted ${ready.length} referral${ready.length !== 1 ? "s" : ""} for review. Admin will verify within 24 hours.`,
      data: {
        submissionId: submission.id,
        totalSubmitted: ready.length,
        grossAmount,
        status: "PENDING",
        referrals: ready.map((r) => ({
          id: r.id,
          name: `${r.referred.firstName} ${r.referred.lastName}`,
        })),
      },
    });
  } catch (err) {
    console.error("submitDailyCampaign:", err);
    return sendError(res, "Submission failed");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. GET SUBMISSION HISTORY       GET /campaign/submissions
// ─────────────────────────────────────────────────────────────────────────────
export const getCampaignSubmissions = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);

    const [submissions, total] = await Promise.all([
      prisma.campaignSubmission.findMany({
        where: { referrerId: req.user.id },
        include: {
          referrals: {
            include: {
              referred: {
                select: { firstName: true, lastName: true, avatar: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.campaignSubmission.count({ where: { referrerId: req.user.id } }),
    ]);

    return sendResponse(res, {
      data: {
        submissions: submissions.map((s) => ({
          id: s.id,
          date: s.submissionDate,
          status: s.status,
          totalSubmitted: s.totalSubmitted,
          totalApproved: s.totalApproved,
          totalRejected: s.totalRejected,
          grossAmount: s.grossAmount,
          netAmount: s.netAmount,
          adminNote: s.adminNote,
          reviewedAt: s.reviewedAt,
          creditedAt: s.creditedAt,
          referrals: s.referrals.map((r) => ({
            id: r.id,
            name: `${r.referred.firstName} ${r.referred.lastName}`,
            avatar: r.referred.avatar,
            status: r.status,
            reward: r.rewardAmount,
            note: r.adminNote,
          })),
        })),
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch submissions");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. CAMPAIGN WALLET              GET /campaign/wallet
// ─────────────────────────────────────────────────────────────────────────────
export const getCampaignWallet = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);

    const [user, txns, total, pendingWd] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          campaignWalletBalance: true,
          campaignWalletLifetimeTotal: true,
        },
      }),
      prisma.campaignTransaction.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.campaignTransaction.count({ where: { userId: req.user.id } }),
      prisma.campaignWithdrawal.findMany({
        where: { userId: req.user.id, status: "PENDING" },
        select: { id: true, amount: true, createdAt: true },
      }),
    ]);

    return sendResponse(res, {
      data: {
        balance: user?.campaignWalletBalance || 0,
        lifetimeTotal: user?.campaignWalletLifetimeTotal || 0,
        currency: CAMPAIGN_CONFIG.CURRENCY,
        canWithdraw:
          (user?.campaignWalletBalance || 0) >= CAMPAIGN_CONFIG.MIN_WITHDRAWAL,
        minWithdrawal: CAMPAIGN_CONFIG.MIN_WITHDRAWAL,
        pendingWithdrawals: pendingWd,
        transactions: txns,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to load campaign wallet");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. WITHDRAW CAMPAIGN EARNINGS   POST /campaign/withdraw
// ─────────────────────────────────────────────────────────────────────────────
export const withdrawCampaignEarnings = async (req, res) => {
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
      withdrawAmount < CAMPAIGN_CONFIG.MIN_WITHDRAWAL
    ) {
      return sendError(
        res,
        `Minimum withdrawal is ₦${CAMPAIGN_CONFIG.MIN_WITHDRAWAL.toLocaleString()}`,
        400,
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { campaignWalletBalance: true, firstName: true },
    });
    if (!user) return sendError(res, "User not found", 404);
    if (user.campaignWalletBalance < withdrawAmount) {
      return sendError(
        res,
        `Insufficient campaign wallet balance. Available: ₦${user.campaignWalletBalance.toLocaleString()}`,
        400,
      );
    }

    // Debit + log
    await prisma.$transaction([
      prisma.user.update({
        where: { id: req.user.id },
        data: { campaignWalletBalance: { decrement: withdrawAmount } },
      }),
      prisma.campaignTransaction.create({
        data: {
          userId: req.user.id,
          type: "WITHDRAWAL",
          amount: -withdrawAmount,
          currency: CAMPAIGN_CONFIG.CURRENCY,
          description: `Campaign wallet withdrawal to ${bankName} — ${accountNumber}`,
          meta: { bankName, accountNumber, accountName, status: "PENDING" },
        },
      }),
      prisma.campaignWithdrawal.create({
        data: {
          userId: req.user.id,
          amount: withdrawAmount,
          currency: CAMPAIGN_CONFIG.CURRENCY,
          bankName,
          accountNumber,
          accountName,
          status: "PENDING",
        },
      }),
    ]);

    await prisma.notification.create({
      data: {
        userId: req.user.id,
        title: "Campaign Withdrawal Submitted 💸",
        body: `Your ₦${withdrawAmount.toLocaleString()} campaign withdrawal is being processed. Arrives in 1–3 business days.`,
        type: "CAMPAIGN_WITHDRAWAL",
        data: { amount: withdrawAmount, bankName },
      },
    });

    return sendResponse(res, {
      message: "Withdrawal submitted. Processing in 1–3 business days.",
      data: {
        amount: withdrawAmount,
        newBalance: parseFloat(
          (user.campaignWalletBalance - withdrawAmount).toFixed(2),
        ),
        currency: CAMPAIGN_CONFIG.CURRENCY,
      },
    });
  } catch (err) {
    console.error("withdrawCampaignEarnings:", err);
    return sendError(res, "Withdrawal failed");
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// ── ADMIN ENDPOINTS ───────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

// GET /campaign/admin/submissions
export const adminGetSubmissions = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search, date } = req.query;
    const { skip, take } = paginate(page, limit);
    const where = {};
    if (status) where.status = status;
    if (date) where.submissionDate = date;
    if (search) {
      where.referrer = {
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    const [submissions, total, stats] = await Promise.all([
      prisma.campaignSubmission.findMany({
        where,
        include: {
          referrer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            },
          },
          referrals: {
            include: {
              referred: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  role: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.campaignSubmission.count({ where }),
      prisma.campaignSubmission.groupBy({
        by: ["status"],
        _count: true,
        _sum: { grossAmount: true, netAmount: true },
      }),
    ]);

    return sendResponse(res, {
      data: {
        submissions,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
        stats: stats.reduce(
          (acc, s) => ({
            ...acc,
            [s.status]: {
              count: s._count,
              gross: s._sum.grossAmount,
              net: s._sum.netAmount,
            },
          }),
          {},
        ),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch submissions");
  }
};

// PATCH /campaign/admin/submissions/:id/review
// Body: {
//   decisions: [{ referralId, approved: bool, note?: string }],
//   adminNote?: string  (overall note on the submission)
// }
export const adminReviewSubmission = async (req, res) => {
  try {
    const { decisions, adminNote } = req.body;
    const adminId = req.user.id;

    if (!decisions?.length) {
      return sendError(
        res,
        "decisions array required: [{ referralId, approved, note? }]",
        400,
      );
    }

    const submission = await prisma.campaignSubmission.findUnique({
      where: { id: req.params.id },
      include: { referrals: true, referrer: true },
    });
    if (!submission) return sendError(res, "Submission not found", 404);
    if (!["PENDING", "REVIEWING"].includes(submission.status)) {
      return sendError(
        res,
        `Cannot review a ${submission.status} submission`,
        400,
      );
    }

    let approvedCount = 0;
    let rejectedCount = 0;
    let netAmount = 0;

    await prisma.$transaction(async (tx) => {
      for (const d of decisions) {
        const ref = submission.referrals.find((r) => r.id === d.referralId);
        if (!ref) continue;

        await tx.campaignReferral.update({
          where: { id: d.referralId },
          data: {
            status: d.approved ? "APPROVED" : "REJECTED",
            adminNote: d.note || null,
            reviewedAt: new Date(),
            reviewedById: adminId,
            updatedAt: new Date(),
          },
        });

        if (d.approved) {
          approvedCount++;
          netAmount += ref.rewardAmount;
        } else {
          rejectedCount++;
        }
      }

      // Determine final submission status
      const subStatus =
        approvedCount === decisions.length
          ? "APPROVED"
          : approvedCount === 0
            ? "REJECTED"
            : "PARTIAL";

      await tx.campaignSubmission.update({
        where: { id: submission.id },
        data: {
          status: subStatus,
          totalApproved: approvedCount,
          totalRejected: rejectedCount,
          netAmount,
          adminNote: adminNote || null,
          reviewedAt: new Date(),
          reviewedById: adminId,
          creditedAt: approvedCount > 0 ? new Date() : null,
          updatedAt: new Date(),
        },
      });

      // Credit the referrer's campaign wallet for approved referrals
      if (approvedCount > 0) {
        await tx.user.update({
          where: { id: submission.referrerId },
          data: {
            campaignWalletBalance: { increment: netAmount },
            campaignWalletLifetimeTotal: { increment: netAmount },
          },
        });

        await tx.campaignTransaction.create({
          data: {
            userId: submission.referrerId,
            type: "DAILY_BONUS",
            amount: netAmount,
            currency: CAMPAIGN_CONFIG.CURRENCY,
            description: `Daily campaign payout — ${approvedCount} approved referral${approvedCount !== 1 ? "s" : ""} for ${submission.submissionDate}`,
            submissionId: submission.id,
            meta: {
              approvedCount,
              rejectedCount,
              submissionDate: submission.submissionDate,
              adminId,
            },
          },
        });

        // Notify referrer
        const statusMsg =
          subStatus === "APPROVED"
            ? "All approved"
            : `${approvedCount} of ${decisions.length} approved`;
        await tx.notification.create({
          data: {
            userId: submission.referrerId,
            title: `Campaign payout: ₦${netAmount.toLocaleString()} credited! 💰`,
            body: `Your submission for ${submission.submissionDate} has been reviewed. ${statusMsg}. ₦${netAmount.toLocaleString()} added to your campaign wallet.`,
            type: "CAMPAIGN_PAYOUT",
            data: {
              submissionId: submission.id,
              amount: netAmount,
              approvedCount,
              rejectedCount,
            },
          },
        });
      } else {
        // All rejected — notify
        await tx.notification.create({
          data: {
            userId: submission.referrerId,
            title: "Campaign submission declined",
            body: `Your submission for ${submission.submissionDate} was declined. ${adminNote || "Please ensure referred users complete all required tasks."}`,
            type: "CAMPAIGN_DECLINED",
            data: { submissionId: submission.id },
          },
        });
      }
    });

    return sendResponse(res, {
      message: `Review complete — ${approvedCount} approved, ${rejectedCount} rejected. ₦${netAmount.toLocaleString()} credited.`,
      data: {
        approvedCount,
        rejectedCount,
        netAmount,
        submissionId: submission.id,
      },
    });
  } catch (err) {
    console.error("adminReviewSubmission:", err);
    return sendError(res, "Review failed");
  }
};

// PATCH /campaign/admin/withdrawals/:id/approve
export const adminApproveCampaignWithdrawal = async (req, res) => {
  try {
    const wd = await prisma.campaignWithdrawal.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { id: true, firstName: true } } },
    });
    if (!wd) return sendError(res, "Withdrawal not found", 404);
    if (wd.status !== "PENDING")
      return sendError(res, `Withdrawal is ${wd.status}`, 400);

    await prisma.campaignWithdrawal.update({
      where: { id: wd.id },
      data: {
        status: "APPROVED",
        processedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await prisma.notification.create({
      data: {
        userId: wd.userId,
        title: "Campaign Withdrawal Approved ✅",
        body: `Your ₦${wd.amount.toLocaleString()} withdrawal has been approved. It will reach your ${wd.bankName} account within 1–3 business days.`,
        type: "CAMPAIGN_WITHDRAWAL_APPROVED",
        data: { withdrawalId: wd.id, amount: wd.amount },
      },
    });

    return sendResponse(res, { message: "Withdrawal approved" });
  } catch (err) {
    return sendError(res, "Approval failed");
  }
};

// PATCH /campaign/admin/withdrawals/:id/reject
export const adminRejectCampaignWithdrawal = async (req, res) => {
  try {
    const { reason } = req.body;
    const wd = await prisma.campaignWithdrawal.findUnique({
      where: { id: req.params.id },
    });
    if (!wd) return sendError(res, "Withdrawal not found", 404);
    if (wd.status !== "PENDING")
      return sendError(res, `Withdrawal is ${wd.status}`, 400);

    // Refund the balance
    await prisma.$transaction([
      prisma.campaignWithdrawal.update({
        where: { id: wd.id },
        data: {
          status: "REJECTED",
          adminNote: reason || null,
          processedAt: new Date(),
          updatedAt: new Date(),
        },
      }),
      prisma.user.update({
        where: { id: wd.userId },
        data: { campaignWalletBalance: { increment: wd.amount } },
      }),
      prisma.campaignTransaction.create({
        data: {
          userId: wd.userId,
          type: "ADJUSTMENT",
          amount: wd.amount,
          currency: CAMPAIGN_CONFIG.CURRENCY,
          description: `Withdrawal reversal — ${reason || "rejected by admin"}`,
          meta: { withdrawalId: wd.id, reason },
        },
      }),
      prisma.notification.create({
        data: {
          userId: wd.userId,
          title: "Withdrawal Rejected",
          body: `Your ₦${wd.amount.toLocaleString()} withdrawal was rejected. Your balance has been refunded. ${reason ? "Reason: " + reason : ""}`,
          type: "CAMPAIGN_WITHDRAWAL_REJECTED",
          data: { withdrawalId: wd.id, reason },
        },
      }),
    ]);

    return sendResponse(res, {
      message: "Withdrawal rejected and balance refunded",
    });
  } catch (err) {
    return sendError(res, "Rejection failed");
  }
};

// GET /campaign/admin/stats
export const adminGetCampaignStats = async (req, res) => {
  try {
    const [submissionStats, walletStats, topReferrers, recentSubmissions] =
      await Promise.all([
        prisma.campaignSubmission.aggregate({
          _count: true,
          _sum: {
            grossAmount: true,
            netAmount: true,
            totalSubmitted: true,
            totalApproved: true,
          },
        }),
        prisma.user.aggregate({
          _sum: {
            campaignWalletBalance: true,
            campaignWalletLifetimeTotal: true,
          },
        }),
        prisma.user.findMany({
          where: { campaignWalletLifetimeTotal: { gt: 0 } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            campaignWalletLifetimeTotal: true,
          },
          orderBy: { campaignWalletLifetimeTotal: "desc" },
          take: 10,
        }),
        prisma.campaignSubmission.findMany({
          where: { status: "PENDING" },
          include: {
            referrer: {
              select: { firstName: true, lastName: true, email: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
      ]);

    const byStatus = await prisma.campaignSubmission.groupBy({
      by: ["status"],
      _count: true,
    });

    const pendingWithdrawals = await prisma.campaignWithdrawal.findMany({
      where: { status: "PENDING" },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return sendResponse(res, {
      data: {
        overview: {
          totalSubmissions: submissionStats._count,
          totalGross: submissionStats._sum.grossAmount || 0,
          totalPaidOut: submissionStats._sum.netAmount || 0,
          totalReferralsSubmitted: submissionStats._sum.totalSubmitted || 0,
          totalReferralsApproved: submissionStats._sum.totalApproved || 0,
          totalCampaignWallets: walletStats._sum.campaignWalletBalance || 0,
          totalCampaignEarned:
            walletStats._sum.campaignWalletLifetimeTotal || 0,
          currency: CAMPAIGN_CONFIG.CURRENCY,
          rewardPerReferral: CAMPAIGN_CONFIG.REWARD_PER_REFERRAL,
        },
        byStatus: byStatus.reduce(
          (acc, s) => ({ ...acc, [s.status]: s._count }),
          {},
        ),
        pendingSubmissions: recentSubmissions,
        pendingWithdrawals,
        topReferrers,
      },
    });
  } catch (err) {
    return sendError(res, "Failed to load campaign stats");
  }
};

// GET /campaign/admin/withdrawals
export const adminGetCampaignWithdrawals = async (req, res) => {
  try {
    const { status = "PENDING", page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);

    const [withdrawals, total] = await Promise.all([
      prisma.campaignWithdrawal.findMany({
        where: status !== "ALL" ? { status } : {},
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: "asc" },
        skip,
        take,
      }),
      prisma.campaignWithdrawal.count({
        where: status !== "ALL" ? { status } : {},
      }),
    ]);

    return sendResponse(res, {
      data: {
        withdrawals,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch withdrawals");
  }
};
