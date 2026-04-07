// src/controllers/settings.controller.js
import prisma from "../config/database.js";
import bcrypt from "bcryptjs";
import { sendResponse, sendError } from "../utils/response.js";
import cloudinary from "../config/cloudinary.js";

// ── GET /api/settings/profile ─────────────────────────────────────────────────
export const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        avatar: true,
        bio: true,
        country: true,
        city: true,
        state: true,
        address: true,
        latitude: true,
        longitude: true,
        currency: true,
        language: true,
        gender: true,
        role: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        createdAt: true,
        workerProfile: {
          select: {
            id: true,
            title: true,
            description: true,
            hourlyRate: true,
            currency: true,
            yearsExperience: true,
            serviceRadius: true,
            isAvailable: true,
            verificationStatus: true,
            videoIntroUrl: true,
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

// ── PATCH /api/settings/profile ───────────────────────────────────────────────
export const updateProfile = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      bio,
      country,
      city,
      state,
      address,
      latitude,
      longitude,
      currency,
      language,
      gender,
    } = req.body;

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(firstName !== undefined && { firstName: firstName.trim() }),
        ...(lastName !== undefined && { lastName: lastName.trim() }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(bio !== undefined && { bio: bio?.trim() || null }),
        ...(country !== undefined && { country: country?.trim() || null }),
        ...(city !== undefined && { city: city?.trim() || null }),
        ...(state !== undefined && { state: state?.trim() || null }),
        ...(address !== undefined && { address: address?.trim() || null }),
        ...(latitude !== undefined && {
          latitude: latitude ? parseFloat(latitude) : null,
        }),
        ...(longitude !== undefined && {
          longitude: longitude ? parseFloat(longitude) : null,
        }),
        ...(currency !== undefined && { currency: currency }),
        ...(language !== undefined && { language: language }),
        ...(gender !== undefined && { gender: gender || null }),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        bio: true,
        avatar: true,
        country: true,
        city: true,
        state: true,
        address: true,
        currency: true,
        language: true,
        gender: true,
        role: true,
      },
    });

    return sendResponse(res, {
      message: "Profile updated",
      data: { user: updated },
    });
  } catch (err) {
    if (err.code === "P2002")
      return sendError(res, "Phone number already in use", 400);
    console.error("updateProfile error:", err);
    return sendError(res, "Failed to update profile");
  }
};

// ── POST /api/settings/avatar ─────────────────────────────────────────────────
export const updateAvatar = async (req, res) => {
  try {
    if (!req.file) return sendError(res, "No image file provided", 400);

    const current = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { avatar: true },
    });

    // Delete old avatar from Cloudinary if it exists
    if (current?.avatar) {
      const match = current.avatar.match(/\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
      if (match) {
        try {
          await cloudinary.uploader.destroy(match[1]);
        } catch {}
      }
    }

    const b64 = Buffer.from(req.file.buffer).toString("base64");
    const dataUri = `data:${req.file.mimetype};base64,${b64}`;

    const upload = await cloudinary.uploader.upload(dataUri, {
      folder: "avatars",
      transformation: [
        { width: 400, height: 400, crop: "fill", gravity: "face" },
      ],
    });

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatar: upload.secure_url },
      select: { id: true, avatar: true },
    });

    return sendResponse(res, {
      message: "Avatar updated",
      data: { avatar: updated.avatar },
    });
  } catch (err) {
    console.error("updateAvatar error:", err);
    return sendError(res, "Failed to upload avatar");
  }
};

// ── PATCH /api/settings/worker-profile ───────────────────────────────────────
export const updateWorkerProfile = async (req, res) => {
  try {
    if (req.user.role !== "WORKER") return sendError(res, "Forbidden", 403);

    const {
      title,
      description,
      hourlyRate,
      currency,
      yearsExperience,
      serviceRadius,
      isAvailable,
    } = req.body;

    const existing = await prisma.workerProfile.findUnique({
      where: { userId: req.user.id },
    });

    if (!existing) return sendError(res, "Worker profile not found", 404);

    const updated = await prisma.workerProfile.update({
      where: { userId: req.user.id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && {
          description: description?.trim() || null,
        }),
        ...(hourlyRate !== undefined && { hourlyRate: parseFloat(hourlyRate) }),
        ...(currency !== undefined && { currency }),
        ...(yearsExperience !== undefined && {
          yearsExperience: parseInt(yearsExperience),
        }),
        ...(serviceRadius !== undefined && {
          serviceRadius: parseInt(serviceRadius),
        }),
        ...(isAvailable !== undefined && { isAvailable: Boolean(isAvailable) }),
      },
    });

    return sendResponse(res, {
      message: "Worker profile updated",
      data: { workerProfile: updated },
    });
  } catch (err) {
    console.error("updateWorkerProfile error:", err);
    return sendError(res, "Failed to update worker profile");
  }
};

// ── PATCH /api/settings/hirer-profile ────────────────────────────────────────
export const updateHirerProfile = async (req, res) => {
  try {
    if (req.user.role !== "HIRER") return sendError(res, "Forbidden", 403);

    const { companyName, companySize, website } = req.body;

    const existing = await prisma.hirerProfile.findUnique({
      where: { userId: req.user.id },
    });

    if (!existing) {
      await prisma.hirerProfile.create({
        data: {
          userId: req.user.id,
          companyName: companyName?.trim() || null,
          companySize: companySize || null,
          website: website?.trim() || null,
        },
      });
    } else {
      await prisma.hirerProfile.update({
        where: { userId: req.user.id },
        data: {
          ...(companyName !== undefined && {
            companyName: companyName?.trim() || null,
          }),
          ...(companySize !== undefined && {
            companySize: companySize || null,
          }),
          ...(website !== undefined && { website: website?.trim() || null }),
        },
      });
    }

    return sendResponse(res, { message: "Company profile updated" });
  } catch (err) {
    console.error("updateHirerProfile error:", err);
    return sendError(res, "Failed to update company profile");
  }
};

// ── PATCH /api/settings/password ──────────────────────────────────────────────
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return sendError(res, "Current and new passwords are required", 400);
    }
    if (newPassword.length < 8) {
      return sendError(res, "New password must be at least 8 characters", 400);
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return sendError(res, "Current password is incorrect", 400);

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashed },
    });

    return sendResponse(res, { message: "Password changed successfully" });
  } catch (err) {
    console.error("changePassword error:", err);
    return sendError(res, "Failed to change password");
  }
};

// ── GET /api/settings/notifications ──────────────────────────────────────────
// We store notification preferences as a JSON blob in a user meta field.
// Since schema doesn't have a NotificationPref model, we store as bio-adjacent JSON
// using a dedicated approach — we'll use a simple upsert on a settings "meta" via
// a lightweight key-value on the user record using a dedicated table check.
// For now, we return sane defaults if not set, stored in the notification data field.

const DEFAULT_NOTIF_PREFS = {
  emailBookingUpdates: true,
  emailPaymentReceipts: true,
  emailReviewRequests: true,
  emailMarketing: false,
  pushBookings: true,
  pushMessages: true,
  pushPayments: true,
  pushSOS: true,
};

export const getNotificationPrefs = async (req, res) => {
  try {
    // We store prefs as a special notification record type "USER_PREFS"
    const prefsRecord = await prisma.notification.findFirst({
      where: { userId: req.user.id, type: "USER_NOTIFICATION_PREFS" },
      orderBy: { createdAt: "desc" },
    });

    const prefs = prefsRecord?.data
      ? { ...DEFAULT_NOTIF_PREFS, ...prefsRecord.data }
      : DEFAULT_NOTIF_PREFS;

    return sendResponse(res, { data: { prefs } });
  } catch (err) {
    return sendError(res, "Failed to fetch notification preferences");
  }
};

// ── PATCH /api/settings/notifications ────────────────────────────────────────
export const updateNotificationPrefs = async (req, res) => {
  try {
    const prefs = { ...DEFAULT_NOTIF_PREFS, ...req.body };

    // Delete old pref record and upsert new
    await prisma.notification.deleteMany({
      where: { userId: req.user.id, type: "USER_NOTIFICATION_PREFS" },
    });

    await prisma.notification.create({
      data: {
        userId: req.user.id,
        title: "Notification preferences",
        body: "User notification preferences",
        type: "USER_NOTIFICATION_PREFS",
        data: prefs,
      },
    });

    return sendResponse(res, {
      message: "Notification preferences saved",
      data: { prefs },
    });
  } catch (err) {
    return sendError(res, "Failed to save notification preferences");
  }
};

// ── GET /api/settings/privacy ─────────────────────────────────────────────────
const DEFAULT_PRIVACY = {
  profilePublic: true,
  showPhone: false,
  showLocation: true,
  showEarnings: false,
  allowMessagesFrom: "all", // all | verified | none
  showOnlineStatus: true,
  indexableBySearch: true,
};

export const getPrivacySettings = async (req, res) => {
  try {
    const record = await prisma.notification.findFirst({
      where: { userId: req.user.id, type: "USER_PRIVACY_PREFS" },
      orderBy: { createdAt: "desc" },
    });

    const privacy = record?.data
      ? { ...DEFAULT_PRIVACY, ...record.data }
      : DEFAULT_PRIVACY;

    return sendResponse(res, { data: { privacy } });
  } catch (err) {
    return sendError(res, "Failed to fetch privacy settings");
  }
};

// ── PATCH /api/settings/privacy ──────────────────────────────────────────────
export const updatePrivacySettings = async (req, res) => {
  try {
    const privacy = { ...DEFAULT_PRIVACY, ...req.body };

    await prisma.notification.deleteMany({
      where: { userId: req.user.id, type: "USER_PRIVACY_PREFS" },
    });

    await prisma.notification.create({
      data: {
        userId: req.user.id,
        title: "Privacy settings",
        body: "User privacy settings",
        type: "USER_PRIVACY_PREFS",
        data: privacy,
      },
    });

    return sendResponse(res, {
      message: "Privacy settings saved",
      data: { privacy },
    });
  } catch (err) {
    return sendError(res, "Failed to save privacy settings");
  }
};

// ── GET /api/settings/security ────────────────────────────────────────────────
export const getSecurityInfo = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        isEmailVerified: true,
        isPhoneVerified: true,
        lastSeen: true,
        createdAt: true,
        email: true,
        phone: true,
      },
    });

    // Recent login sessions — we approximate from lastSeen
    const sessions = [
      {
        id: "current",
        device: "Current session",
        location: "Unknown",
        lastSeen: user.lastSeen || new Date(),
        isCurrent: true,
      },
    ];

    return sendResponse(res, {
      data: {
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
        email: user.email,
        phone: user.phone,
        twoFactorEnabled: false, // extend later
        sessions,
        accountCreated: user.createdAt,
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch security info");
  }
};

// ── DELETE /api/settings/account ──────────────────────────────────────────────
export const deleteAccount = async (req, res) => {
  try {
    const { password, reason } = req.body;

    if (!password) return sendError(res, "Password confirmation required", 400);

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return sendError(res, "Incorrect password", 400);

    // Soft delete — mark as inactive rather than hard delete
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        isActive: false,
        isBanned: false,
        email: `deleted_${Date.now()}_${user.email}`,
        refreshToken: null,
        bio: reason ? `Deleted: ${reason}` : "Account deleted",
      },
    });

    return sendResponse(res, { message: "Account deleted successfully" });
  } catch (err) {
    console.error("deleteAccount error:", err);
    return sendError(res, "Failed to delete account");
  }
};

// ── GET /api/settings/payment-methods ────────────────────────────────────────
export const getPaymentMethods = async (req, res) => {
  try {
    // Return saved payment methods from withdrawal records as proxy
    const withdrawals = await prisma.withdrawal.findMany({
      where: { workerId: req.user.id },
      select: {
        method: true,
        destination: true,
        details: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    // Deduplicate by destination
    const seen = new Set();
    const methods = [];
    for (const w of withdrawals) {
      const key = `${w.method}:${w.destination}`;
      if (!seen.has(key)) {
        seen.add(key);
        methods.push({
          method: w.method,
          destination: w.destination,
          details: w.details,
          addedAt: w.createdAt,
        });
      }
    }

    return sendResponse(res, { data: { methods } });
  } catch (err) {
    return sendError(res, "Failed to fetch payment methods");
  }
};

// ── GET /api/settings/activity ────────────────────────────────────────────────
export const getActivitySummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    const [notifCount, bookingCount, reviewCount] = await Promise.all([
      prisma.notification.count({
        where: { userId, isRead: false },
      }),
      prisma.booking.count({
        where: role === "HIRER" ? { hirerId: userId } : { workerId: userId },
      }),
      prisma.review.count({
        where: { receiverId: userId },
      }),
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
    return sendError(res, "Failed to fetch activity summary");
  }
};
