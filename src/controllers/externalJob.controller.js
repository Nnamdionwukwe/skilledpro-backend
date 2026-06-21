// src/controllers/externalJob.controller.js
import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { paginate } from "../utils/helpers.js";

/**
 * GET /api/external-jobs
 * Public – list all OPEN external jobs with filters
 */
export const getExternalJobs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      category,
      sort = "newest",
    } = req.query;
    const { skip, take } = paginate(page, limit);

    const where = {
      status: "OPEN",
      isExternal: true,
      ...(search && {
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { companyName: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ],
      }),
      ...(category && {
        categories: { some: { categoryId: category } },
      }),
    };

    const orderBy =
      sort === "oldest" ? { createdAt: "asc" } : { createdAt: "desc" };

    const [jobs, total] = await Promise.all([
      prisma.jobPost.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          categories: { include: { category: true } },
          postedByAdmin: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
          },
        },
      }),
      prisma.jobPost.count({ where }),
    ]);

    return sendResponse(res, {
      data: {
        jobs,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.error("getExternalJobs error:", error);
    return sendError(res, "Failed to fetch external jobs", 500);
  }
};

/**
 * GET /api/external-jobs/:id
 * Public – get a single external job detail
 */
export const getExternalJobDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await prisma.jobPost.findUnique({
      where: { id, status: "OPEN", isExternal: true },
      include: {
        categories: { include: { category: true } },
        postedByAdmin: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
      },
    });

    if (!job) {
      return sendError(res, "Job not found", 404);
    }

    return sendResponse(res, { data: { job } });
  } catch (error) {
    console.error("getExternalJobDetail error:", error);
    return sendError(res, "Failed to fetch job details", 500);
  }
};
