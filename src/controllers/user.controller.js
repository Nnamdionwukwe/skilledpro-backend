import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

export const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, avatar: true, bio: true, country: true, city: true,
        currency: true, isEmailVerified: true, createdAt: true, lastSeen: true,
        workerProfile: { include: { categories: { include: { category: true } }, portfolio: true, certifications: true } },
        hirerProfile: true,
      },
    });
    if (!user) return sendError(res, "User not found", 404);
    return sendResponse(res, { data: { user } });
  } catch (err) {
    return sendError(res, "Failed to fetch profile");
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, bio, country, city, state, address, phone, currency, language, latitude, longitude } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { firstName, lastName, bio, country, city, state, address, phone, currency, language, latitude, longitude },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        bio: true, country: true, city: true, currency: true, updatedAt: true,
      },
    });
    return sendResponse(res, { message: "Profile updated", data: { user } });
  } catch (err) {
    return sendError(res, "Update failed");
  }
};

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

export const deleteAccount = async (req, res) => {
  try {
    await prisma.user.update({ where: { id: req.user.id }, data: { isActive: false } });
    return sendResponse(res, { message: "Account deactivated" });
  } catch (err) {
    return sendError(res, "Delete failed");
  }
};
