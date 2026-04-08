import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import bcrypt from "bcryptjs";
import cloudinary from "../config/cloudinary.js";

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
  notifBookings: true,
  notifMessages: true,
  notifPayments: true,
  notifReviews: true,
  notifMarketing: true,
  profileVisible: true,
  showPhone: true,
  showLocation: true,
  twoFactorEnabled: true,
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
            customRate: true,
            customRateLabel: true,
            pricingNote: true,
            currency: true,
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
    // firstName/lastName must not be null
    if (data.firstName === null) delete data.firstName;
    if (data.lastName === null) delete data.lastName;

    if (req.body.latitude !== undefined)
      data.latitude = req.body.latitude ? parseFloat(req.body.latitude) : null;
    if (req.body.longitude !== undefined)
      data.longitude = req.body.longitude
        ? parseFloat(req.body.longitude)
        : null;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: USER_SELECT,
    });
    return sendResponse(res, { message: "Profile updated", data: { user } });
  } catch (err) {
    if (err.code === "P2002")
      return sendError(res, "Phone number already in use", 400);
    console.error("updateProfile error:", err);
    return sendError(res, "Failed to update profile");
  }
};

// POST /api/settings/avatar — uploads to Cloudinary and returns new URL
export const updateAvatar = async (req, res) => {
  try {
    if (!req.file) return sendError(res, "No image file provided", 400);

    // Delete old avatar
    const current = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { avatar: true },
    });
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
      folder: "skilledpro/avatars",
      transformation: [
        { width: 400, height: 400, crop: "fill", gravity: "face" },
      ],
    });

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatar: upload.secure_url },
      select: { id: true, avatar: true },
    });
    // Return both avatar and full user so frontend can patch store immediately
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
      customRate,
      customRateLabel,
      pricingNote,
      currency,
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
    if (customRate !== undefined)
      data.customRate = customRate ? parseFloat(customRate) : null;
    if (customRateLabel !== undefined)
      data.customRateLabel = customRateLabel?.trim() || null;
    if (pricingNote !== undefined)
      data.pricingNote = pricingNote?.trim() || null;
    if (currency !== undefined) data.currency = currency;
    if (yearsExperience !== undefined)
      data.yearsExperience = parseInt(yearsExperience);
    if (serviceRadius !== undefined)
      data.serviceRadius = parseInt(serviceRadius);
    if (isAvailable !== undefined) data.isAvailable = Boolean(isAvailable);

    const profile = await prisma.workerProfile.update({
      where: { userId: req.user.id },
      data,
    });
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

// GET /api/settings/notifications — reads directly from User row
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
      message: "Notification preferences updated",
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
      select: { profileVisible: true, showPhone: true, showLocation: true },
    });
    return sendResponse(res, { data: { privacy: user } });
  } catch (err) {
    return sendError(res, "Failed to fetch privacy settings");
  }
};

// PATCH /api/settings/privacy
export const updatePrivacySettings = async (req, res) => {
  try {
    const { profileVisible, showPhone, showLocation } = req.body;
    const data = {};
    if (profileVisible !== undefined) data.profileVisible = profileVisible;
    if (showPhone !== undefined) data.showPhone = showPhone;
    if (showLocation !== undefined) data.showLocation = showLocation;
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

// DELETE /api/settings/account
export const deleteAccount = async (req, res) => {
  try {
    const { password, reason } = req.body;
    if (!password) return sendError(res, "Password confirmation required", 400);
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return sendError(res, "Incorrect password", 400);
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        isActive: false,
        email: `deleted_${Date.now()}_${user.email}`,
        refreshToken: null,
        bio: reason ? `Deleted: ${reason}` : "Account deleted",
      },
    });
    return sendResponse(res, { message: "Account deleted" });
  } catch (err) {
    return sendError(res, "Failed to delete account");
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
