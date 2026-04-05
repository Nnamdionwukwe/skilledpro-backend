import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

export const getCategories = async (req, res) => {
  try {
    const { search, limit = 200 } = req.query;
    const where = {
      parentId: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ],
      }),
    };
    const categories = await prisma.category.findMany({
      where,
      include: {
        children: true,
        _count: { select: { workers: true, bookings: true } },
      },
      orderBy: [{ isUserSubmitted: "asc" }, { name: "asc" }],
      take: parseInt(limit),
    });
    return sendResponse(res, { data: { categories } });
  } catch (err) {
    return sendError(res, "Failed to fetch categories");
  }
};

export const getCategory = async (req, res) => {
  try {
    const category = await prisma.category.findUnique({
      where: { slug: req.params.slug },
      include: {
        children: true,
        _count: { select: { workers: true, bookings: true } },
      },
    });
    if (!category) return sendError(res, "Category not found", 404);
    return sendResponse(res, { data: { category } });
  } catch (err) {
    return sendError(res, "Failed to fetch category");
  }
};

// POST /api/categories/suggest — User submits a custom category
export const suggestCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) return sendError(res, "Category name is required", 400);

    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");

    // Check if already exists
    const existing = await prisma.category.findFirst({
      where: {
        OR: [{ slug }, { name: { equals: name, mode: "insensitive" } }],
      },
    });

    if (existing) {
      return sendResponse(res, {
        message: "Category already exists",
        data: { category: existing, alreadyExists: true },
      });
    }

    const category = await prisma.category.create({
      data: {
        name: name.trim(),
        slug,
        description: description || `${name} services`,
        icon: "🔧",
        isUserSubmitted: true,
        submittedBy: req.user?.id || null,
      },
    });

    return sendResponse(res, {
      status: 201,
      message: "Category added successfully",
      data: { category, alreadyExists: false },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to add category");
  }
};
