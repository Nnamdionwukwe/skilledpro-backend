import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import bcrypt from "bcryptjs";
import cloudinary from "../config/cloudinary.js";
import { markProfileSetupComplete } from "./campaign.controller.js";
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
const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  bio: true,
  phone: true,
  country: true,
  city: true,
  state: true,
  address: true,
  currency: true,
  language: true,
  theme: true,
  gender: true,
  avatar: true,
  role: true,
  isEmailVerified: true,
  isPhoneVerified: true,
  createdAt: true,
  lastSeen: true,
  // Notification prefs
  notifBookings: true,
  notifMessages: true,
  notifPayments: true,
  notifReviews: true,
  notifMarketing: true,
  // Privacy
  profileVisible: true,
  showPhone: true,
  showLocation: true,
  showEmail: true,
  showGender: true,
  // Security
  twoFactorEnabled: true,
  // Currency system
  dashboardCurrency: true,
  paymentCurrency: true,
  // Hirer prefs
  defaultEstUnit: true,
  defaultEstValue: true,
  // Location
  latitude: true,
  longitude: true,
};

// GET /api/settings/profile
export const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        ...USER_SELECT,
        workerProfile: {
          select: {
            id: true,
            title: true,
            description: true,
            hourlyRate: true,
            dailyRate: true,
            weeklyRate: true,
            monthlyRate: true,
            yearlyRate: true,
            customRate: true,
            customRateLabel: true,
            pricingNote: true,
            currency: true,
            profileCurrency: true,
            yearsExperience: true,
            serviceRadius: true,
            isAvailable: true,
            verificationStatus: true,
            videoIntroUrl: true,
            backgroundCheck: true,
            avgRating: true,
            totalReviews: true,
            completedJobs: true,
            categories: {
              include: {
                category: {
                  select: { id: true, name: true, slug: true, icon: true },
                },
              },
            },
          },
        },
        hirerProfile: {
          select: {
            id: true,
            companyName: true,
            companySize: true,
            website: true,
            totalSpent: true,
            totalHires: true,
            avgRating: true,
          },
        },
      },
    });
    if (!user) return sendError(res, "User not found", 404);
    return sendResponse(res, { data: { user } });
  } catch (err) {
    console.error("getProfile error:", err);
    return sendError(res, "Failed to fetch profile");
  }
};

// PATCH /api/settings/profile
export const updateProfile = async (req, res) => {
  try {
    const allowedFields = [
      "firstName",
      "lastName",
      "bio",
      "phone",
      "country",
      "city",
      "state",
      "address",
      "currency",
      "language",
      "theme",
      "gender",
      "dashboardCurrency",
      "paymentCurrency",
      "defaultEstUnit",
      "defaultEstValue",
    ];
    const data = {};
    for (const f of allowedFields) {
      if (req.body[f] !== undefined) {
        data[f] =
          typeof req.body[f] === "string"
            ? req.body[f].trim() || null
            : req.body[f];
      }
    }
    if (data.firstName === null) delete data.firstName;
    if (data.lastName === null) delete data.lastName;
    if (req.body.latitude !== undefined)
      data.latitude = req.body.latitude ? parseFloat(req.body.latitude) : null;
    if (req.body.longitude !== undefined)
      data.longitude = req.body.longitude
        ? parseFloat(req.body.longitude)
        : null;

    // ── Customization flags ──────────────────────────────────────────────────
    // If the client sent a non-empty firstName/lastName, lock it from OAuth
    // overwrite. Once `nameCustom = true`, Google sign-in will never touch
    // firstName / lastName again.
    const hasNonEmptyName =
      (data.firstName && data.firstName.length > 0) ||
      (data.lastName && data.lastName.length > 0);
    if (hasNonEmptyName) {
      data.nameCustom = true;
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: {
        ...USER_SELECT,
        nameCustom: true,
        avatarCustom: true,
      },
    });

    // ── Campaign: profile setup may now be complete ─────────────────────────
    await markProfileSetupComplete(req.user.id).catch(() => {});

    return sendResponse(res, { message: "Profile updated", data: { user } });
  } catch (err) {
    if (err.code === "P2002")
      return sendError(res, "Phone number already in use", 400);
    console.error("updateProfile error:", err);
    return sendError(res, "Failed to update profile");
  }
};

// POST /api/settings/avatar
export const updateAvatar = async (req, res) => {
  try {
    if (!req.file) return sendError(res, "No image file provided", 400);

    // ── CloudinaryStorage already uploaded the file. ──────────────────────────
    // `req.file.path` is the Cloudinary secure_url. `req.file.filename` is the
    // public_id. We only need to delete the OLD avatar from Cloudinary and
    // save the NEW url to the DB.
    const newUrl = req.file.path || req.file.secure_url;
    if (!newUrl) {
      console.error("updateAvatar: multer did not populate req.file.path");
      return sendError(
        res,
        "Upload failed — no URL returned from storage",
        500,
      );
    }

    // Delete old avatar from Cloudinary (best-effort)
    const current = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { avatar: true },
    });
    if (current?.avatar && current.avatar !== newUrl) {
      const match = current.avatar.match(/\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
      if (match) {
        try {
          await cloudinary.uploader.destroy(match[1]);
        } catch (err) {
          console.warn(
            "Failed to delete old avatar from Cloudinary:",
            err.message,
          );
        }
      }
    }

    // Persist the new URL AND flag the avatar as user-customized so that
    // Google sign-in will never overwrite it.
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        avatar: newUrl,
        avatarCustom: true, // ✅ critical — locks the field from OAuth override
      },
      select: { id: true, avatar: true, avatarCustom: true },
    });

    // ── Campaign: avatar upload may complete profile setup ──────────────────
    await markProfileSetupComplete(req.user.id).catch(() => {});

    return sendResponse(res, {
      message: "Avatar updated",
      data: { avatar: user.avatar, user },
    });
  } catch (err) {
    console.error("updateAvatar error:", err);
    return sendError(res, "Failed to upload avatar");
  }
};

// PATCH /api/settings/worker-profile
export const updateWorkerProfile = async (req, res) => {
  try {
    if (req.user.role !== "WORKER") return sendError(res, "Forbidden", 403);
    const {
      title,
      description,
      hourlyRate,
      dailyRate,
      weeklyRate,
      monthlyRate,
      yearlyRate,
      customRate,
      customRateLabel,
      pricingNote,
      currency,
      profileCurrency,
      yearsExperience,
      serviceRadius,
      isAvailable,
    } = req.body;

    const existing = await prisma.workerProfile.findUnique({
      where: { userId: req.user.id },
    });
    if (!existing) return sendError(res, "Worker profile not found", 404);

    const data = {};
    if (title !== undefined) data.title = title.trim();
    if (description !== undefined)
      data.description = description?.trim() || null;
    if (hourlyRate !== undefined) data.hourlyRate = parseFloat(hourlyRate) || 0;
    if (dailyRate !== undefined)
      data.dailyRate = dailyRate ? parseFloat(dailyRate) : null;
    if (weeklyRate !== undefined)
      data.weeklyRate = weeklyRate ? parseFloat(weeklyRate) : null;
    if (monthlyRate !== undefined)
      data.monthlyRate = monthlyRate ? parseFloat(monthlyRate) : null;
    if (yearlyRate !== undefined)
      data.yearlyRate = yearlyRate ? parseFloat(yearlyRate) : null;
    if (customRate !== undefined)
      data.customRate = customRate ? parseFloat(customRate) : null;
    if (customRateLabel !== undefined)
      data.customRateLabel = customRateLabel?.trim() || null;
    if (pricingNote !== undefined)
      data.pricingNote = pricingNote?.trim() || null;
    if (currency !== undefined) data.currency = currency;
    if (profileCurrency !== undefined) data.profileCurrency = profileCurrency;
    if (yearsExperience !== undefined)
      data.yearsExperience = parseInt(yearsExperience);
    if (serviceRadius !== undefined)
      data.serviceRadius = parseInt(serviceRadius);
    if (isAvailable !== undefined) data.isAvailable = Boolean(isAvailable);

    const profile = await prisma.workerProfile.update({
      where: { userId: req.user.id },
      data,
    });

    // ── Campaign: profile setup may now be complete ─────────────────────────
    await markProfileSetupComplete(req.user.id).catch(() => {});

    return sendResponse(res, {
      message: "Worker profile updated",
      data: { workerProfile: profile },
    });
  } catch (err) {
    console.error("updateWorkerProfile error:", err);
    return sendError(res, "Failed to update worker profile");
  }
};

// PATCH /api/settings/hirer-profile
export const updateHirerProfile = async (req, res) => {
  try {
    if (req.user.role !== "HIRER") return sendError(res, "Forbidden", 403);
    const { companyName, companySize, website } = req.body;
    const existing = await prisma.hirerProfile.findUnique({
      where: { userId: req.user.id },
    });
    const data = {
      ...(companyName !== undefined && {
        companyName: companyName?.trim() || null,
      }),
      ...(companySize !== undefined && { companySize: companySize || null }),
      ...(website !== undefined && { website: website?.trim() || null }),
    };
    if (!existing) {
      await prisma.hirerProfile.create({
        data: { userId: req.user.id, ...data },
      });
    } else {
      await prisma.hirerProfile.update({
        where: { userId: req.user.id },
        data,
      });
    }

    // ── Campaign: profile setup may now be complete ─────────────────────────
    await markProfileSetupComplete(req.user.id).catch(() => {});

    return sendResponse(res, { message: "Company profile updated" });
  } catch (err) {
    console.error("updateHirerProfile error:", err);
    return sendError(res, "Failed to update company profile");
  }
};

// PATCH /api/settings/password
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return sendError(res, "Both passwords are required", 400);
    if (newPassword.length < 8)
      return sendError(res, "Password must be at least 8 characters", 400);
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return sendError(res, "Current password is incorrect", 401);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: await bcrypt.hash(newPassword, 12) },
    });
    return sendResponse(res, { message: "Password changed successfully" });
  } catch (err) {
    return sendError(res, "Password change failed");
  }
};

// GET /api/settings/notifications
export const getNotificationPrefs = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        notifBookings: true,
        notifMessages: true,
        notifPayments: true,
        notifReviews: true,
        notifMarketing: true,
      },
    });
    return sendResponse(res, { data: { prefs: user } });
  } catch (err) {
    return sendError(res, "Failed to fetch notification preferences");
  }
};

// PATCH /api/settings/notifications
export const updateNotificationPrefs = async (req, res) => {
  try {
    const {
      notifBookings,
      notifMessages,
      notifPayments,
      notifReviews,
      notifMarketing,
    } = req.body;
    const data = {};
    if (notifBookings !== undefined) data.notifBookings = notifBookings;
    if (notifMessages !== undefined) data.notifMessages = notifMessages;
    if (notifPayments !== undefined) data.notifPayments = notifPayments;
    if (notifReviews !== undefined) data.notifReviews = notifReviews;
    if (notifMarketing !== undefined) data.notifMarketing = notifMarketing;
    await prisma.user.update({ where: { id: req.user.id }, data });
    return sendResponse(res, {
      message: "Preferences updated",
      data: { prefs: data },
    });
  } catch (err) {
    return sendError(res, "Update failed");
  }
};

// GET /api/settings/privacy
export const getPrivacySettings = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        profileVisible: true,
        showPhone: true,
        showLocation: true,
        showEmail: true,
        showGender: true,
      },
    });
    return sendResponse(res, { data: { privacy: user } });
  } catch (err) {
    return sendError(res, "Failed to fetch privacy settings");
  }
};

// PATCH /api/settings/privacy
export const updatePrivacySettings = async (req, res) => {
  try {
    const { profileVisible, showPhone, showLocation, showEmail, showGender } =
      req.body;
    const data = {};
    if (profileVisible !== undefined) data.profileVisible = profileVisible;
    if (showPhone !== undefined) data.showPhone = showPhone;
    if (showLocation !== undefined) data.showLocation = showLocation;
    if (showEmail !== undefined) data.showEmail = showEmail;
    if (showGender !== undefined) data.showGender = showGender;
    await prisma.user.update({ where: { id: req.user.id }, data });
    return sendResponse(res, {
      message: "Privacy settings updated",
      data: { privacy: data },
    });
  } catch (err) {
    return sendError(res, "Update failed");
  }
};

// GET /api/settings/security
export const getSecurityInfo = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        isEmailVerified: true,
        isPhoneVerified: true,
        twoFactorEnabled: true,
        lastSeen: true,
        createdAt: true,
        email: true,
        phone: true,
      },
    });
    return sendResponse(res, {
      data: {
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
        twoFactorEnabled: user.twoFactorEnabled ?? false,
        email: user.email,
        phone: user.phone,
        lastSeen: user.lastSeen,
        accountCreated: user.createdAt,
        sessions: [
          {
            id: "current",
            device: "Current session",
            lastSeen: user.lastSeen || new Date(),
            isCurrent: true,
          },
        ],
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch security info");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Gather blockers for a user (shared between pause + delete)
// ─────────────────────────────────────────────────────────────────────────────
async function gatherBlockers(userId, role) {
  const blockers = [];

  if (role === "WORKER") {
    const [activeBookings, pendingWithdrawals, heldPayments, openDisputes] =
      await Promise.all([
        prisma.booking.count({
          where: {
            workerId: userId,
            status: {
              in: ["PENDING", "ACCEPTED", "IN_PROGRESS", "DISPUTED"],
            },
          },
        }),
        prisma.withdrawal.count({
          where: {
            workerId: userId,
            status: { in: ["PENDING", "PROCESSING"] },
          },
        }),
        prisma.payment.count({
          where: { booking: { workerId: userId }, status: "HELD" },
        }),
        prisma.dispute.count({
          where: { againstId: userId, status: "PENDING_REVIEW" },
        }),
      ]);

    if (activeBookings > 0)
      blockers.push({
        code: "ACTIVE_BOOKINGS_WORKER",
        count: activeBookings,
        label: `${activeBookings} active booking${activeBookings === 1 ? "" : "s"} as a worker`,
        hint: "Complete or cancel your active bookings before proceeding.",
        route: "/bookings",
      });
    if (pendingWithdrawals > 0)
      blockers.push({
        code: "PENDING_WITHDRAWALS",
        count: pendingWithdrawals,
        label: `${pendingWithdrawals} pending withdrawal${pendingWithdrawals === 1 ? "" : "s"}`,
        hint: "Wait for your withdrawals to be processed or contact support.",
        route: "/dashboard/worker/withdrawals",
      });
    if (heldPayments > 0)
      blockers.push({
        code: "HELD_PAYMENTS",
        count: heldPayments,
        label: `${heldPayments} payment${heldPayments === 1 ? "" : "s"} held in escrow`,
        hint: "Complete the related jobs to release your funds.",
        route: "/bookings",
      });
    if (openDisputes > 0)
      blockers.push({
        code: "OPEN_DISPUTES",
        count: openDisputes,
        label: `${openDisputes} unresolved dispute${openDisputes === 1 ? "" : "s"}`,
        hint: "Wait for disputes to be resolved before proceeding.",
        route: "/disputes",
      });

    const workerProfile = await prisma.workerProfile.findUnique({
      where: { userId },
      select: { debtBalance: true },
    });
    if (workerProfile?.debtBalance > 0)
      blockers.push({
        code: "OUTSTANDING_DEBT",
        count: 1,
        label: `Outstanding balance: ${workerProfile.debtBalance}`,
        hint: "Settle your outstanding balance or contact support to arrange payment.",
        route: "/dashboard/worker/earnings",
      });
  }

  if (role === "HIRER") {
    const [activeBookings, wallet, pendingWithdrawals, openDisputes, openJobs] =
      await Promise.all([
        prisma.booking.count({
          where: {
            hirerId: userId,
            status: {
              in: ["PENDING", "ACCEPTED", "IN_PROGRESS", "DISPUTED"],
            },
          },
        }),
        prisma.hirerWallet.findFirst({
          where: { hirerId: userId, isActive: true },
          select: { balance: true, currency: true },
        }),
        prisma.hirerWithdrawal.count({
          where: {
            hirerId: userId,
            status: { in: ["PENDING", "PROCESSING"] },
          },
        }),
        prisma.dispute.count({
          where: { raisedById: userId, status: "PENDING_REVIEW" },
        }),
        prisma.jobPost.count({
          where: { hirerId: userId, status: "OPEN" },
        }),
      ]);

    if (activeBookings > 0)
      blockers.push({
        code: "ACTIVE_BOOKINGS_HIRER",
        count: activeBookings,
        label: `${activeBookings} active booking${activeBookings === 1 ? "" : "s"}`,
        hint: "Complete or cancel your active bookings before proceeding.",
        route: "/bookings",
      });
    if (wallet?.balance > 0)
      blockers.push({
        code: "WALLET_BALANCE",
        count: 1,
        label: `Wallet balance: ${wallet.currency} ${wallet.balance.toLocaleString()}`,
        hint: "Withdraw or spend your wallet balance before proceeding.",
        route: "/dashboard/hirer/wallet",
      });
    if (pendingWithdrawals > 0)
      blockers.push({
        code: "PENDING_WALLET_WITHDRAWALS",
        count: pendingWithdrawals,
        label: `${pendingWithdrawals} pending withdrawal${pendingWithdrawals === 1 ? "" : "s"}`,
        hint: "Wait for your withdrawals to complete.",
        route: "/dashboard/hirer/wallet",
      });
    if (openDisputes > 0)
      blockers.push({
        code: "OPEN_DISPUTES",
        count: openDisputes,
        label: `${openDisputes} unresolved dispute${openDisputes === 1 ? "" : "s"}`,
        hint: "Wait for disputes to be resolved before proceeding.",
        route: "/disputes",
      });
    if (openJobs > 0)
      blockers.push({
        code: "OPEN_JOB_POSTS",
        count: openJobs,
        label: `${openJobs} open job post${openJobs === 1 ? "" : "s"}`,
        hint: "Close or fill your open job posts before proceeding.",
        route: "/dashboard/hirer/jobs-management",
      });
  }

  const activeSub = await prisma.subscription.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      tier: { not: "FREE" },
    },
    select: { tier: true, expiresAt: true },
  });
  if (activeSub)
    blockers.push({
      code: "ACTIVE_SUBSCRIPTION",
      count: 1,
      label: `${activeSub.tier} subscription is still active`,
      hint: activeSub.expiresAt
        ? `Your plan runs until ${new Date(activeSub.expiresAt).toLocaleDateString("en-GB")}. Cancel it or wait for expiry.`
        : "Cancel your subscription before proceeding.",
      route: "/settings",
    });

  return blockers;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/settings/deactivation-check
// ─────────────────────────────────────────────────────────────────────────────
export const checkDeactivationEligibility = async (req, res) => {
  try {
    const blockers = await gatherBlockers(req.user.id, req.user.role);

    // Return BOTH flow statuses so the UI can show the right options
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        isPaused: true,
        pausedAt: true,
        deletionScheduledAt: true,
      },
    });

    return sendResponse(res, {
      data: {
        canPause: blockers.length === 0,
        canDelete: blockers.length === 0,
        blockers,
        currentState: {
          isPaused: user?.isPaused ?? false,
          pausedAt: user?.pausedAt ?? null,
          deletionScheduledAt: user?.deletionScheduledAt ?? null,
        },
      },
    });
  } catch (err) {
    console.error("checkDeactivationEligibility error:", err);
    return sendError(res, "Failed to check deactivation eligibility");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/settings/pause
// ─────────────────────────────────────────────────────────────────────────────
// OPTION A — Take a Break
// Hides profile, pauses new bookings. Data fully preserved. Reversible by login.
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/settings/pause
// ─────────────────────────────────────────────────────────────────────────────
export const pauseAccount = async (req, res) => {
  try {
    const { password } = req.body || {};
    const userId = req.user?.id;

    if (!userId) return sendError(res, "Not authenticated", 401);
    if (!password) return sendError(res, "Password confirmation required", 400);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return sendError(res, "User not found", 404);
    if (user.isPaused)
      return sendError(res, "Your account is already paused", 400);

    // ── Password check: skip for Google-linked accounts ──────────────────
    const isGoogleUser = !!user.googleId;
    if (!isGoogleUser) {
      if (!user.password) {
        return sendError(
          res,
          "This account has no password set. Use Google sign-in or set a password first.",
          400,
        );
      }
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return sendError(res, "Incorrect password", 400);
    } else {
      // For Google users, still require *some* password field so the UI flow
      // is consistent, but don't bcrypt-compare against the placeholder hash.
      console.log(
        "[pauseAccount] Google-linked user — skipping bcrypt compare",
      );
    }

    const blockers = await gatherBlockers(userId, user.role);
    if (blockers.length > 0) {
      return sendError(
        res,
        `You can't pause your account yet: ${blockers.map((b) => b.label).join(", ")}`,
        409,
      );
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        isPaused: true,
        pausedAt: new Date(),
        profileVisible: false,
        refreshToken: null,
      },
    });

    return sendResponse(res, {
      message:
        "Your account is paused. Log back in any time to reactivate your profile.",
    });
  } catch (err) {
    console.error("pauseAccount error:", err);
    return sendError(res, "Failed to pause account");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/settings/resume
// ─────────────────────────────────────────────────────────────────────────────
export const resumeAccount = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return sendError(res, "Not authenticated", 401);

    await prisma.user.update({
      where: { id: userId },
      data: {
        isPaused: false,
        pausedAt: null,
        profileVisible: true,
      },
    });

    return sendResponse(res, {
      message: "Welcome back! Your account has been reactivated.",
    });
  } catch (err) {
    console.error("resumeAccount error:", err.message);
    return sendError(res, "Failed to resume account");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/settings/account
// ─────────────────────────────────────────────────────────────────────────────
// OPTION B — Permanent Delete (with 30-day grace period)
// Schedules the account for deletion. A cron job wipes it after 30 days.
// Within the window, logging in cancels the deletion.
export const deleteAccount = async (req, res) => {
  try {
    const { password, reason, confirmDelete } = req.body || {};
    const userId = req.user?.id;

    if (!userId) return sendError(res, "Not authenticated", 401);
    if (!password) return sendError(res, "Password confirmation required", 400);
    if (confirmDelete !== true && confirmDelete !== "DELETE")
      return sendError(
        res,
        'You must type "DELETE" to confirm permanent account deletion',
        400,
      );

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return sendError(res, "User not found", 404);

    // ── Password check: skip for Google-linked accounts ──────────────────
    const isGoogleUser = !!user.googleId;
    if (!isGoogleUser) {
      if (!user.password) {
        return sendError(
          res,
          "This account has no password set. Use Google sign-in or set a password first.",
          400,
        );
      }
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return sendError(res, "Incorrect password", 400);
    } else {
      console.log(
        "[deleteAccount] Google-linked user — skipping bcrypt compare",
      );
    }

    if (user.deletionScheduledAt) {
      return sendError(
        res,
        `Your account is already scheduled for deletion on ${new Date(user.deletionScheduledAt).toLocaleDateString("en-GB")}`,
        400,
      );
    }

    const blockers = await gatherBlockers(userId, user.role);
    if (blockers.length > 0) {
      return sendError(
        res,
        `You can't delete your account yet: ${blockers.map((b) => b.label).join(", ")}`,
        409,
      );
    }

    const deletionDate = new Date();
    deletionDate.setDate(deletionDate.getDate() + 30);

    await prisma.user.update({
      where: { id: userId },
      data: {
        profileVisible: false,
        isPaused: true,
        pausedAt: new Date(),
        deletionScheduledAt: deletionDate,
        deletionReason: reason?.trim() || null,
        deletionRequestedAt: new Date(),
        refreshToken: null,
      },
    });

    return sendResponse(res, {
      message: `Your account is scheduled for permanent deletion on ${deletionDate.toLocaleDateString("en-GB")}. Log in within 30 days to cancel this.`,
      data: {
        deletionScheduledAt: deletionDate,
        gracePeriodDays: 30,
      },
    });
  } catch (err) {
    console.error("deleteAccount error:", err);
    return sendError(res, "Failed to schedule account deletion");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/settings/cancel-deletion
// ─────────────────────────────────────────────────────────────────────────────
export const cancelDeletion = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return sendError(res, "Not authenticated", 401);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { deletionScheduledAt: true },
    });

    if (!user?.deletionScheduledAt) {
      return sendError(res, "No deletion scheduled", 400);
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        deletionScheduledAt: null,
        deletionReason: null,
        deletionRequestedAt: null,
        isPaused: false,
        pausedAt: null,
        profileVisible: true,
      },
    });

    return sendResponse(res, {
      message: "Deletion cancelled. Your account is active again.",
    });
  } catch (err) {
    console.error("cancelDeletion error:", err.message);
    return sendError(res, "Failed to cancel deletion");
  }
};

// GET /api/settings/payment-methods
export const getPaymentMethods = async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { userId: req.user.id },
      select: { provider: true, status: true, currency: true, createdAt: true },
      distinct: ["provider"],
      orderBy: { createdAt: "desc" },
    });
    return sendResponse(res, { data: { methods: payments } });
  } catch (err) {
    return sendError(res, "Failed to fetch payment methods");
  }
};

// GET /api/settings/activity
export const getActivitySummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const [notifCount, bookingCount, reviewCount] = await Promise.all([
      prisma.notification.count({ where: { userId, isRead: false } }),
      prisma.booking.count({
        where: role === "HIRER" ? { hirerId: userId } : { workerId: userId },
      }),
      prisma.review.count({ where: { receiverId: userId } }),
    ]);
    const recentActivity = await prisma.notification.findMany({
      where: {
        userId,
        type: { notIn: ["USER_NOTIFICATION_PREFS", "USER_PRIVACY_PREFS"] },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        body: true,
        type: true,
        isRead: true,
        createdAt: true,
      },
    });
    return sendResponse(res, {
      data: {
        summary: {
          unreadNotifications: notifCount,
          totalBookings: bookingCount,
          totalReviews: reviewCount,
        },
        recentActivity,
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch activity");
  }
};
