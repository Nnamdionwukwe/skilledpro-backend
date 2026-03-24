import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

export const searchWorkers = async (req, res) => {
  try {
    const { category, city, country, minRate, maxRate, rating, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = { isAvailable: true };
    if (city || country) {
      where.user = {};
      if (city) where.user.city = { contains: city, mode: "insensitive" };
      if (country) where.user.country = { contains: country, mode: "insensitive" };
    }
    if (minRate || maxRate) {
      where.hourlyRate = {};
      if (minRate) where.hourlyRate.gte = parseFloat(minRate);
      if (maxRate) where.hourlyRate.lte = parseFloat(maxRate);
    }
    if (rating) where.avgRating = { gte: parseFloat(rating) };
    if (category) {
      where.categories = { some: { category: { slug: category } } };
    }
    const [workers, total] = await Promise.all([
      prisma.workerProfile.findMany({
        where, skip, take: parseInt(limit),
        include: {
          user: { select: { id: true, firstName: true, lastName: true, avatar: true, city: true, country: true } },
          categories: { include: { category: true } },
        },
        orderBy: { avgRating: "desc" },
      }),
      prisma.workerProfile.count({ where }),
    ]);
    return sendResponse(res, { data: { workers, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) {
    console.error(err);
    return sendError(res, "Search failed");
  }
};

export const getWorkerProfile = async (req, res) => {
  try {
    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.params.userId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatar: true, city: true, country: true, createdAt: true } },
        categories: { include: { category: true } },
        portfolio: true,
        certifications: true,
        availability: true,
      },
    });
    if (!worker) return sendError(res, "Worker not found", 404);
    return sendResponse(res, { data: { worker } });
  } catch (err) {
    return sendError(res, "Failed to fetch worker");
  }
};

export const updateWorkerProfile = async (req, res) => {
  try {
    const { title, description, hourlyRate, currency, yearsExperience, serviceRadius, isAvailable } = req.body;
    const worker = await prisma.workerProfile.update({
      where: { userId: req.user.id },
      data: { title, description, hourlyRate: hourlyRate ? parseFloat(hourlyRate) : undefined, currency, yearsExperience: yearsExperience ? parseInt(yearsExperience) : undefined, serviceRadius: serviceRadius ? parseInt(serviceRadius) : undefined, isAvailable },
    });
    return sendResponse(res, { message: "Profile updated", data: { worker } });
  } catch (err) {
    return sendError(res, "Update failed");
  }
};

export const addPortfolio = async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!req.file) return sendError(res, "Image required", 400);
    const worker = await prisma.workerProfile.findUnique({ where: { userId: req.user.id } });
    if (!worker) return sendError(res, "Worker profile not found", 404);
    const item = await prisma.portfolio.create({
      data: { workerProfileId: worker.id, title, description, imageUrl: req.file.path },
    });
    return sendResponse(res, { status: 201, message: "Portfolio item added", data: { item } });
  } catch (err) {
    return sendError(res, "Failed to add portfolio");
  }
};

export const deletePortfolio = async (req, res) => {
  try {
    const worker = await prisma.workerProfile.findUnique({ where: { userId: req.user.id } });
    await prisma.portfolio.deleteMany({ where: { id: req.params.id, workerProfileId: worker.id } });
    return sendResponse(res, { message: "Portfolio item deleted" });
  } catch (err) {
    return sendError(res, "Delete failed");
  }
};

export const addCertification = async (req, res) => {
  try {
    const { name, issuedBy, issueDate, expiryDate } = req.body;
    const worker = await prisma.workerProfile.findUnique({ where: { userId: req.user.id } });
    const cert = await prisma.certification.create({
      data: { workerProfileId: worker.id, name, issuedBy, issueDate: issueDate ? new Date(issueDate) : null, expiryDate: expiryDate ? new Date(expiryDate) : null, documentUrl: req.file?.path },
    });
    return sendResponse(res, { status: 201, data: { cert } });
  } catch (err) {
    return sendError(res, "Failed to add certification");
  }
};

export const updateAvailability = async (req, res) => {
  try {
    const { availability } = req.body;
    const worker = await prisma.workerProfile.findUnique({ where: { userId: req.user.id } });
    await prisma.availability.deleteMany({ where: { workerProfileId: worker.id } });
    const created = await prisma.availability.createMany({
      data: availability.map(a => ({ workerProfileId: worker.id, dayOfWeek: a.dayOfWeek, startTime: a.startTime, endTime: a.endTime, isAvailable: a.isAvailable ?? true })),
    });
    return sendResponse(res, { message: "Availability updated", data: { created } });
  } catch (err) {
    return sendError(res, "Update failed");
  }
};

export const addCategory = async (req, res) => {
  try {
    const { categoryId, isPrimary } = req.body;
    const worker = await prisma.workerProfile.findUnique({ where: { userId: req.user.id } });
    const wc = await prisma.workerCategory.upsert({
      where: { workerProfileId_categoryId: { workerProfileId: worker.id, categoryId } },
      update: { isPrimary: isPrimary ?? false },
      create: { workerProfileId: worker.id, categoryId, isPrimary: isPrimary ?? false },
    });
    return sendResponse(res, { status: 201, data: { wc } });
  } catch (err) {
    return sendError(res, "Failed to add category");
  }
};
