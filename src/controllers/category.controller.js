import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

export const getCategories = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { parentId: null },
      include: { children: true, _count: { select: { workers: true } } },
      orderBy: { name: "asc" },
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
      include: { children: true, _count: { select: { workers: true } } },
    });
    if (!category) return sendError(res, "Category not found", 404);
    return sendResponse(res, { data: { category } });
  } catch (err) {
    return sendError(res, "Failed to fetch category");
  }
};
