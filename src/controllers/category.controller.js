import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
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

// GET /api/categories?page=1&limit=100&search=foo
// Paginated list of categories. User-submitted categories sort first
// so any newly added ones are always on page 1.
export const getCategories = async (req, res) => {
  try {
    const { search } = req.query;

    // Clamp: default 100 per page, hard cap 200. Small enough to be
    // fast on the DB and the client, large enough that a user browsing
    // a category list feels instant.
    const take = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 100, 1),
      200,
    );
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const skip = (page - 1) * take;

    const where = {
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [categories, total] = await Promise.all([
      prisma.category.findMany({
        where,
        include: {
          children: true,
          _count: { select: { workers: true, bookings: true } },
        },
        // desc = user-submitted (true) before seeded (false),
        // then alphabetical within each group
        orderBy: [{ isUserSubmitted: "desc" }, { name: "asc" }],
        skip,
        take,
      }),
      prisma.category.count({ where }),
    ]);

    return sendResponse(res, {
      data: {
        categories,
        total,
        page,
        pages: Math.max(1, Math.ceil(total / take)),
        limit: take,
      },
    });
  } catch (err) {
    console.error("getCategories error:", err);
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

// GET /api/categories/:slug/workers
// Lists all workers linked to a category.
// Relation chain: WorkerCategory → WorkerProfile → User
export const getCategoryWorkers = async (req, res) => {
  try {
    const { slug } = req.params;
    const { page = 1, limit = 40 } = req.query;

    const category = await prisma.category.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, icon: true },
    });
    if (!category) return sendError(res, "Category not found", 404);

    const take = Math.min(parseInt(limit, 10) || 40, 100);
    const skip = ((parseInt(page, 10) || 1) - 1) * take;

    const where = {
      categoryId: category.id,
      workerProfile: {
        user: {
          role: "WORKER",
          isActive: true,
          isBanned: false,
        },
      },
    };

    const [links, total] = await Promise.all([
      prisma.workerCategory.findMany({
        where,
        skip,
        take,
        orderBy: [{ isPrimary: "desc" }, { id: "desc" }],
        include: {
          workerProfile: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  city: true,
                  country: true,
                },
              },
            },
          },
        },
      }),
      prisma.workerCategory.count({ where }),
    ]);

    const workers = links.map((link) => {
      const wp = link.workerProfile;
      const u = wp.user;
      return {
        id: u.id,
        user: {
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          avatar: u.avatar,
          city: u.city,
          country: u.country,
        },
        title: wp.title,
        hourlyRate: wp.hourlyRate,
        currency: wp.currency,
        avgRating: wp.avgRating,
        totalReviews: wp.totalReviews,
        completedJobs: wp.completedJobs,
        isAvailable: wp.isAvailable,
        verificationStatus: wp.verificationStatus,
      };
    });

    return sendResponse(res, {
      data: {
        category,
        workers,
        total,
        page: parseInt(page, 10) || 1,
        pages: Math.max(1, Math.ceil(total / take)),
      },
    });
  } catch (err) {
    console.error("getCategoryWorkers error:", err);
    return sendError(res, "Failed to fetch workers for this category");
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

export const deleteCategory = async (req, res) => {
  try {
    await prisma.category.delete({ where: { id: req.params.id } });
    return sendResponse(res, { message: "Category deleted" });
  } catch (err) {
    return sendError(res, "Failed to delete category");
  }
};

export const updateCategory = async (req, res) => {
  try {
    const { name, icon, description } = req.body;
    const updated = await prisma.category.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name: name.trim() }),
        ...(icon && { icon }),
        ...(description && { description }),
      },
    });
    return sendResponse(res, { data: { category: updated } });
  } catch (err) {
    return sendError(res, "Failed to update category");
  }
};
