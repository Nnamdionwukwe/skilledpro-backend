// src/controllers/adminJob.controller.js
import prisma from "../config/database.js";
import { logAdminAction } from "../utils/auditLog.js";
import { sendResponse, sendError } from "../utils/response.js";

/**
 * ADMIN: Create a new external job post
 * POST /api/admin/jobs
 */
export const adminCreateJobPost = async (req, res, next) => {
  try {
    const {
      title,
      companyName,
      location, // will map to address
      jobType,
      salaryText,
      description,
      responsibilities,
      requirements,
      minQualification,
      experienceLevel,
      experienceLength,
      languageRequirement,
      workingHours,
      applicantLocation,
      applicationUrl,
      applicationEmail,
      applicationWhatsApp,
      applicationPhone,
      skills = [],
      sourcePlatform,
      categoryIds = [],
      expiryDate,
      isActive = true,
      salaryAmount,
      salaryCurrency,
      salaryPeriod,
      locationType,
      educationLevel,
      salaryMin,
      salaryMax,
    } = req.body;

    // ── Validation ────────────────────────────────────────────────────────────
    if (!title || !companyName || !location || !applicationUrl) {
      return sendError(
        res,
        "Missing required fields: title, companyName, location, applicationUrl",
        400,
      );
    }

    // Validate category IDs
    if (categoryIds.length) {
      const catCount = await prisma.category.count({
        where: { id: { in: categoryIds } },
      });
      if (catCount !== categoryIds.length) {
        return sendError(res, "One or more category IDs are invalid", 400);
      }
    }

    // ── Build job data ────────────────────────────────────────────────────────
    const jobData = {
      title,
      companyName,
      address: location,
      jobType: jobType || "FULL_TIME",
      salaryText: salaryText || "",
      description: description || "",
      responsibilities: responsibilities || "",
      requirements: requirements || "",
      minQualification: minQualification || "",
      experienceLevel: experienceLevel || "Entry level",
      experienceLength: experienceLength || "",
      languageRequirement: languageRequirement || "English",
      workingHours: workingHours || "",
      applicantLocation: applicantLocation || "",
      applicationUrl,
      applicationEmail,
      applicationWhatsApp,
      applicationPhone,
      skills: Array.isArray(skills) ? skills : [],
      sourcePlatform: sourcePlatform || "",
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      isExternal: true,
      hirerId: req.user.id,
      postedByAdminId: req.user.id,
      status: isActive ? "OPEN" : "CANCELLED",
      // backward compatibility
      categoryId: categoryIds.length ? categoryIds[0] : null,
      // many‑to‑many categories
      categories: {
        create: categoryIds.map((catId) => ({ categoryId: catId })),
      },
      // placeholders for required fields that don't apply
      budget: 0,
      currency: "NGN",
      scheduledAt: new Date(),
      estimatedHours: 0,

      salaryAmount: salaryAmount ? parseFloat(salaryAmount) : null,
      salaryMin: salaryMin ? parseFloat(salaryMin) : null,
      salaryMax: salaryMax ? parseFloat(salaryMax) : null,
      salaryCurrency: salaryCurrency || null,
      salaryPeriod: salaryPeriod || null,
      educationLevel: educationLevel || null,
      locationType: locationType || "REMOTE",
    };

    const job = await prisma.jobPost.create({
      data: jobData,
      include: {
        categories: { include: { category: true } },
        postedByAdmin: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    // ── Audit log ─────────────────────────────────────────────────────────────
    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "JOB_CREATED",
      targetType: "JOB_POST",
      targetId: job.id,
      description: `Created external job "${title}" at ${companyName}`,
      meta: { applicationUrl, sourcePlatform, categoryIds },
    });

    return sendResponse(res, {
      status: 201,
      message: "Job post created successfully",
      data: { job },
    });
  } catch (error) {
    console.error("adminCreateJobPost error:", error);
    return sendError(res, "Failed to create job post", 500);
  }
};

/**
 * ADMIN: Get all job posts with filters
 * GET /api/admin/jobs
 */
export const adminGetAllJobPosts = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      category,
      status,
      isExternal,
    } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where = {};
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { companyName: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }
    if (category) {
      where.categories = { some: { categoryId: category } };
    }
    if (status) where.status = status;
    if (isExternal !== undefined) where.isExternal = isExternal === "true";

    const [jobs, total] = await Promise.all([
      prisma.jobPost.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          categories: { include: { category: true } },
          postedByAdmin: {
            select: { id: true, email: true, firstName: true, lastName: true },
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
    console.error("adminGetAllJobPosts error:", error);
    return sendError(res, "Failed to fetch job posts", 500);
  }
};

/**
 * ADMIN: Get a single job post by ID
 * GET /api/admin/jobs/:id
 */
export const adminGetJobPost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const job = await prisma.jobPost.findUnique({
      where: { id },
      include: {
        categories: { include: { category: true } },
        postedByAdmin: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
    if (!job) {
      return sendError(res, "Job not found", 404);
    }
    return sendResponse(res, { data: { job } });
  } catch (error) {
    console.error("adminGetJobPost error:", error);
    return sendError(res, "Failed to fetch job", 500);
  }
};

/**
 * ADMIN: Update a job post (full or partial)
 * PUT /api/admin/jobs/:id
 * PATCH /api/admin/jobs/:id
 */
export const adminUpdateJobPost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      title,
      companyName,
      location,
      jobType,
      salaryText,
      description,
      responsibilities,
      requirements,
      minQualification,
      experienceLevel,
      experienceLength,
      languageRequirement,
      workingHours,
      applicantLocation,
      applicationUrl,
      applicationEmail,
      applicationWhatsApp,
      applicationPhone,
      skills,
      sourcePlatform,
      categoryIds,
      expiryDate,
      status,
      isActive,
      salaryAmount,
      salaryCurrency,
      salaryPeriod,
      educationLevel,
      locationType,
      salaryMin,
      salaryMax,
    } = req.body;

    // Check existence
    const existing = await prisma.jobPost.findUnique({ where: { id } });
    if (!existing) {
      return sendError(res, "Job not found", 404);
    }

    // Validate categories if provided
    if (categoryIds && categoryIds.length) {
      const catCount = await prisma.category.count({
        where: { id: { in: categoryIds } },
      });
      if (catCount !== categoryIds.length) {
        return sendError(res, "One or more category IDs are invalid", 400);
      }
    }

    // Build update data (only fields provided)
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (companyName !== undefined) updateData.companyName = companyName;
    if (location !== undefined) updateData.address = location;
    if (jobType !== undefined) updateData.jobType = jobType;
    if (salaryText !== undefined) updateData.salaryText = salaryText;
    if (description !== undefined) updateData.description = description;
    if (responsibilities !== undefined)
      updateData.responsibilities = responsibilities;
    if (requirements !== undefined) updateData.requirements = requirements;
    if (minQualification !== undefined)
      updateData.minQualification = minQualification;
    if (experienceLevel !== undefined)
      updateData.experienceLevel = experienceLevel;
    if (experienceLength !== undefined)
      updateData.experienceLength = experienceLength;
    if (languageRequirement !== undefined)
      updateData.languageRequirement = languageRequirement;
    if (workingHours !== undefined) updateData.workingHours = workingHours;
    if (applicantLocation !== undefined)
      updateData.applicantLocation = applicantLocation;
    if (applicationUrl !== undefined)
      updateData.applicationUrl = applicationUrl;
    if (applicationEmail !== undefined)
      updateData.applicationEmail = applicationEmail;
    if (applicationWhatsApp !== undefined)
      updateData.applicationWhatsApp = applicationWhatsApp;
    if (applicationPhone !== undefined)
      updateData.applicationPhone = applicationPhone;
    if (skills !== undefined)
      updateData.skills = Array.isArray(skills) ? skills : [];
    if (sourcePlatform !== undefined)
      updateData.sourcePlatform = sourcePlatform;
    if (expiryDate !== undefined)
      updateData.expiryDate = expiryDate ? new Date(expiryDate) : null;
    if (status !== undefined) updateData.status = status;
    if (isActive !== undefined)
      updateData.status = isActive ? "OPEN" : "CANCELLED";

    // New fields
    if (salaryAmount !== undefined)
      updateData.salaryAmount = salaryAmount ? parseFloat(salaryAmount) : null;
    if (salaryCurrency !== undefined)
      updateData.salaryCurrency = salaryCurrency || null;
    if (salaryPeriod !== undefined)
      updateData.salaryPeriod = salaryPeriod || null;
    if (educationLevel !== undefined)
      updateData.educationLevel = educationLevel || null;
    if (locationType !== undefined)
      updateData.locationType = locationType || null;
    if (salaryMin !== undefined)
      updateData.salaryMin = salaryMin ? parseFloat(salaryMin) : null;
    if (salaryMax !== undefined)
      updateData.salaryMax = salaryMax ? parseFloat(salaryMax) : null;

    // Handle categories update (replace)
    if (categoryIds !== undefined) {
      // Delete existing
      await prisma.jobCategory.deleteMany({ where: { jobId: id } });
      if (categoryIds.length) {
        updateData.categories = {
          create: categoryIds.map((catId) => ({ categoryId: catId })),
        };
        updateData.categoryId = categoryIds[0];
      } else {
        updateData.categoryId = null;
      }
    }

    const updated = await prisma.jobPost.update({
      where: { id },
      data: updateData,
      include: {
        categories: { include: { category: true } },
        postedByAdmin: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "JOB_UPDATED",
      targetType: "JOB_POST",
      targetId: id,
      description: `Updated job "${updated.title}"`,
      meta: { updatedFields: Object.keys(updateData) },
    });

    return sendResponse(res, {
      message: "Job post updated successfully",
      data: { job: updated },
    });
  } catch (error) {
    console.error("adminUpdateJobPost error:", error);
    return sendError(res, "Failed to update job post", 500);
  }
};

/**
 * ADMIN: Soft-delete a job post (set status CANCELLED)
 * DELETE /api/admin/jobs/:id
 */
export const adminDeleteJobPost = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Soft delete
    await prisma.jobPost.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "JOB_DELETED",
      targetType: "JOB_POST",
      targetId: id,
      description: `Deleted job post (soft delete)`,
      meta: { method: "soft_delete" },
    });

    return sendResponse(res, {
      message: "Job deleted successfully",
    });
  } catch (error) {
    console.error("adminDeleteJobPost error:", error);
    return sendError(res, "Failed to delete job", 500);
  }
};

/**
 * ADMIN: Toggle job status
 * PATCH /api/admin/jobs/:id/status
 */
export const adminToggleJobStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status || !["OPEN", "FILLED", "CANCELLED"].includes(status)) {
      return sendError(res, "Invalid status", 400);
    }

    const updated = await prisma.jobPost.update({
      where: { id },
      data: { status },
    });

    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "JOB_STATUS_CHANGED",
      targetType: "JOB_POST",
      targetId: id,
      description: `Changed job status to ${status}`,
      meta: { newStatus: status },
    });

    return sendResponse(res, {
      message: "Job status updated",
      data: { job: updated },
    });
  } catch (error) {
    console.error("adminToggleJobStatus error:", error);
    return sendError(res, "Failed to update job status", 500);
  }
};

/**
 * ADMIN: Bulk update status
 * PATCH /api/admin/jobs/bulk/status
 */
export const adminBulkUpdateStatus = async (req, res, next) => {
  try {
    const { jobIds, status } = req.body;
    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return sendError(res, "jobIds array required", 400);
    }
    if (!["OPEN", "FILLED", "CANCELLED"].includes(status)) {
      return sendError(res, "Invalid status", 400);
    }

    const result = await prisma.jobPost.updateMany({
      where: { id: { in: jobIds } },
      data: { status },
    });

    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "JOB_STATUS_CHANGED",
      targetType: "SYSTEM",
      description: `Bulk updated status to ${status} for ${result.count} jobs`,
      meta: { jobIds, newStatus: status, count: result.count },
    });

    return sendResponse(res, {
      data: {
        updatedCount: result.count,
        status,
      },
    });
  } catch (error) {
    console.error("adminBulkUpdateStatus error:", error);
    return sendError(res, "Failed to bulk update status", 500);
  }
};

/**
 * ADMIN: Bulk delete (soft delete)
 * DELETE /api/admin/jobs/bulk
 */
export const adminBulkDelete = async (req, res, next) => {
  try {
    const { jobIds } = req.body;
    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return sendError(res, "jobIds array required", 400);
    }

    const result = await prisma.jobPost.updateMany({
      where: { id: { in: jobIds } },
      data: { status: "CANCELLED" },
    });

    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "JOB_DELETED",
      targetType: "SYSTEM",
      description: `Bulk deleted ${result.count} jobs`,
      meta: { jobIds, count: result.count },
    });

    return sendResponse(res, {
      data: {
        deletedCount: result.count,
      },
    });
  } catch (error) {
    console.error("adminBulkDelete error:", error);
    return sendError(res, "Failed to bulk delete jobs", 500);
  }
};
