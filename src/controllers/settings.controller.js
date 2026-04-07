import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import bcrypt from "bcryptjs";

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
  avatar: true,
  role: true,
  isEmailVerified: true,
  createdAt: true,
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
          include: { categories: { include: { category: true } } },
        },
        hirerProfile: true,
      },
    });
    if (!user) return sendError(res, "User not found", 404);
    return sendResponse(res, { data: { user } });
  } catch (err) {
    return sendError(res, "Failed to fetch profile");
  }
};

// PATCH /api/settings/profile
export const updateProfile = async (req, res) => {
  try {
    const fields = [
      "firstName",
      "lastName",
      "bio",
      "country",
      "city",
      "state",
      "address",
      "phone",
      "currency",
      "language",
      "theme",
    ];
    const data = {};
    for (const f of fields) {
      if (req.body[f] !== undefined) data[f] = req.body[f];
    }
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
    console.error("updateProfile error:", err.message);
    return sendError(res, "Update failed");
  }
};

// POST /api/settings/avatar
export const updateAvatar = async (req, res) => {
  try {
    if (!req.file) return sendError(res, "No file uploaded", 400);
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatar: req.file.path },
      select: { id: true, avatar: true },
    });
    return sendResponse(res, { message: "Avatar updated", data: { user } });
  } catch (err) {
    return sendError(res, "Avatar update failed");
  }
};

// PATCH /api/settings/worker-profile
export const updateWorkerProfile = async (req, res) => {
  try {
    const { hourlyRate, bio, yearsOfExperience, location, isAvailable } =
      req.body;
    const data = {};
    if (hourlyRate !== undefined) data.hourlyRate = parseFloat(hourlyRate);
    if (bio !== undefined) data.bio = bio;
    if (yearsOfExperience !== undefined)
      data.yearsOfExperience = parseInt(yearsOfExperience);
    if (location !== undefined) data.location = location;
    if (isAvailable !== undefined) data.isAvailable = isAvailable;

    const profile = await prisma.workerProfile.update({
      where: { userId: req.user.id },
      data,
    });
    return sendResponse(res, {
      message: "Worker profile updated",
      data: { profile },
    });
  } catch (err) {
    return sendError(res, "Update failed");
  }
};

// PATCH /api/settings/hirer-profile
export const updateHirerProfile = async (req, res) => {
  try {
    const { companyName, companySize, industry, website } = req.body;
    const data = {};
    if (companyName !== undefined) data.companyName = companyName;
    if (companySize !== undefined) data.companySize = companySize;
    if (industry !== undefined) data.industry = industry;
    if (website !== undefined) data.website = website;

    const profile = await prisma.hirerProfile.update({
      where: { userId: req.user.id },
      data,
    });
    return sendResponse(res, {
      message: "Hirer profile updated",
      data: { profile },
    });
  } catch (err) {
    return sendError(res, "Update failed");
  }
};

// PATCH /api/settings/password
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return sendError(res, "Both current and new password are required", 400);
    if (newPassword.length < 8)
      return sendError(res, "Password must be at least 8 characters", 400);

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return sendError(res, "Current password is incorrect", 401);

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashed },
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
        twoFactorEnabled: true,
        lastSeen: true,
        createdAt: true,
      },
    });
    return sendResponse(res, { data: { security: user } });
  } catch (err) {
    return sendError(res, "Failed to fetch security info");
  }
};

// DELETE /api/settings/account
export const deleteAccount = async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { isActive: false },
    });
    return sendResponse(res, { message: "Account deactivated" });
  } catch (err) {
    return sendError(res, "Deactivation failed");
  }
};

// GET /api/settings/payment-methods
export const getPaymentMethods = async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { userId: req.user.id },
      select: { provider: true, status: true, createdAt: true },
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

    const [bookingCount, reviewCount, notifCount] = await Promise.all([
      prisma.booking.count({
        where: role === "HIRER" ? { hirerId: userId } : { workerId: userId },
      }),
      prisma.review.count({ where: { giverId: userId } }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return sendResponse(res, {
      data: {
        activity: {
          bookingCount,
          reviewCount,
          unreadNotifications: notifCount,
        },
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch activity");
  }
};
