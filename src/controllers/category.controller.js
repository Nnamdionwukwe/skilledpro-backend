import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

export const getCategories = async (req, res) => {
  try {
    const { search, limit = 500 } = req.query; // ← default 500, not 200

    const where = {
      // ← REMOVED parentId: null — this was silently hiding user-submitted
      //   categories if they somehow got a parentId, and artificially capping results
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
      take: Math.min(parseInt(limit), 1000), // hard cap at 1000
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

export const suggestCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) return sendError(res, "Category name is required", 400);

    // ── Build slug ────────────────────────────────────────────────────────────
    const baseSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, ""); // strip leading/trailing dashes

    // ── Check if already exists by name ──────────────────────────────────────
    const existingByName = await prisma.category.findFirst({
      where: { name: { equals: name.trim(), mode: "insensitive" } },
    });
    if (existingByName) {
      return sendResponse(res, {
        message: "Category already exists",
        data: { category: existingByName, alreadyExists: true },
      });
    }

    // ── Handle slug collisions by appending a suffix ──────────────────────────
    let slug = baseSlug;
    let attempt = 0;
    while (true) {
      const existingBySlug = await prisma.category.findUnique({
        where: { slug },
      });
      if (!existingBySlug) break; // slug is free
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }

    // ── Create ────────────────────────────────────────────────────────────────
    const category = await prisma.category.create({
      data: {
        name: name.trim(),
        slug,
        description: description?.trim() || `${name.trim()} services`,
        icon: "🔧",
        isUserSubmitted: true,
        submittedBy: req.user?.id || null,
      },
      include: {
        _count: { select: { workers: true, bookings: true } },
      },
    });

    return sendResponse(res, {
      status: 201,
      message: "Category added successfully",
      data: { category, alreadyExists: false },
    });
  } catch (err) {
    console.error("suggestCategory error:", err);
    return sendError(res, "Failed to add category");
  }
};
