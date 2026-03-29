import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

export const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatar: true,
        bio: true,
        country: true,
        city: true,
        currency: true,
        isEmailVerified: true,
        createdAt: true,
        lastSeen: true,
        workerProfile: {
          include: {
            categories: { include: { category: true } },
            portfolio: true,
            certifications: true,
          },
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

export const updateProfile = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      bio,
      country,
      city,
      state,
      address,
      phone,
      currency,
      language,
      latitude,
      longitude,
    } = req.body;

    // ✅ Only update fields that were actually sent
    const data = {};
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;
    if (bio !== undefined) data.bio = bio;
    if (country !== undefined) data.country = country;
    if (city !== undefined) data.city = city;
    if (state !== undefined) data.state = state;
    if (address !== undefined) data.address = address;
    if (phone !== undefined) data.phone = phone;
    if (currency !== undefined) data.currency = currency;
    if (language !== undefined) data.language = language;
    if (latitude !== undefined)
      data.latitude = latitude ? parseFloat(latitude) : null;
    if (longitude !== undefined)
      data.longitude = longitude ? parseFloat(longitude) : null;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: {
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
        avatar: true,
        updatedAt: true,
      },
    });

    return sendResponse(res, { message: "Profile updated", data: { user } });
  } catch (err) {
    console.error("updateProfile error:", err.message, err.code);
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
    await prisma.user.update({
      where: { id: req.user.id },
      data: { isActive: false },
    });
    return sendResponse(res, { message: "Account deactivated" });
  } catch (err) {
    return sendError(res, "Delete failed");
  }
};
