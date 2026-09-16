import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import {
  sendJobApplicationEmail,
  sendNewJobMatchEmail,
} from "../services/email.service.js";
import { notifyNewJobMatch } from "../services/notification.service.js";
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

export const createJobPost = async (req, res) => {
  try {
    const {
      // ── Core ─────────────────────────────────────────────────────────────
      categoryId,
      title,
      description,

      // ── Location ─────────────────────────────────────────────────────────
      locationType = "REMOTE",
      address,
      latitude,
      longitude,

      // ── Job meta ─────────────────────────────────────────────────────────
      jobType = "FULL_TIME",
      scheduledAt,
      startDate,
      estimatedHours,
      estimatedUnit,
      estimatedValue,

      // ── Payment / duration ───────────────────────────────────────────────
      budgetType = "FIXED",
      budget,
      currency,
      durationType = "HOURS",
      durationValue,

      // ── Extras (already supported) ───────────────────────────────────────
      skills = [],
      notes,

      // ── NEW: External-style display fields ───────────────────────────────
      companyName,
      salaryText,

      // ── NEW: Application channels ────────────────────────────────────────
      applicationUrl,
      applicationEmail,
      applicationWhatsApp,
      applicationPhone,

      // ── NEW: Requirements / responsibilities ─────────────────────────────
      minQualification,
      experienceLevel,
      experienceLength,
      languageRequirement,
      workingHours,
      applicantLocation,
      responsibilities,
      requirements,

      // ── NEW: Salary range ────────────────────────────────────────────────
      salaryAmount,
      salaryMin,
      salaryMax,
      salaryCurrency,
      salaryPeriod,

      // ── NEW: Misc ────────────────────────────────────────────────────────
      educationLevel,
      sourcePlatform,
      expiryDate,

      // ── NEW: Multi-category (optional, prefer over `categoryId` if present) ──
      categoryIds,
    } = req.body;

    // Resolve date — supports both scheduledAt and startDate
    const resolvedDate = scheduledAt || startDate;

    // ── Validation ────────────────────────────────────────────────────────────
    const missing = [];
    if (!categoryId) missing.push("categoryId");
    if (!title) missing.push("title");
    if (!description) missing.push("description");
    if (!resolvedDate) missing.push("startDate");

    // Budget: prefer explicit budget; if salary range is provided, budget becomes optional
    const hasExplicitBudget =
      budget !== undefined && budget !== null && budget !== "";
    const hasSalaryRange =
      (salaryAmount !== undefined &&
        salaryAmount !== null &&
        salaryAmount !== "") ||
      (salaryMin !== undefined && salaryMin !== null && salaryMin !== "") ||
      (salaryMax !== undefined && salaryMax !== null && salaryMax !== "");

    if (!hasExplicitBudget && !hasSalaryRange) {
      missing.push("budget (or salaryAmount / salaryMin / salaryMax)");
    } else if (hasExplicitBudget && isNaN(parseFloat(budget))) {
      missing.push("budget (must be a number)");
    }

    if (locationType !== "REMOTE" && !address) missing.push("address");

    if (missing.length) {
      console.error("createJobPost validation failed:", {
        missing,
        body: req.body,
      });
      return sendError(
        res,
        `Missing required fields: ${missing.join(", ")}`,
        400,
      );
    }

    // Validate date is parseable
    const parsedDate = new Date(resolvedDate);
    if (isNaN(parsedDate.getTime())) {
      console.error("createJobPost invalid date:", { resolvedDate });
      return sendError(
        res,
        "Invalid start date. Please use YYYY-MM-DD format (e.g. 2025-09-01)",
        400,
      );
    }

    // Validate at least one application method for external-style jobs
    // (only enforced when isExternal-style fields are supplied)
    const isExternalStyle = !!(
      applicationUrl ||
      applicationEmail ||
      applicationWhatsApp ||
      applicationPhone ||
      companyName ||
      salaryText
    );
    if (
      isExternalStyle &&
      !applicationUrl &&
      !applicationEmail &&
      !applicationWhatsApp &&
      !applicationPhone
    ) {
      return sendError(
        res,
        "At least one application method (URL, Email, WhatsApp, or Phone) is required for external-style jobs",
        400,
      );
    }

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) return sendError(res, "Category not found", 404);

    // Resolve the budget value: explicit budget takes precedence
    const resolvedBudget = hasExplicitBudget
      ? parseFloat(budget)
      : parseFloat(salaryAmount ?? salaryMin ?? salaryMax ?? 0);

    // Resolve currency (budget currency OR salary currency OR default)
    const resolvedCurrency = currency || salaryCurrency || "NGN";

    const jobPost = await prisma.jobPost.create({
      data: {
        // ── Core ──────────────────────────────────────────────────────────
        hirerId: req.user.id,
        categoryId,
        title,
        description,

        // ── Location ──────────────────────────────────────────────────────
        locationType,
        address: locationType !== "REMOTE" ? address : null,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,

        // ── Job meta ──────────────────────────────────────────────────────
        jobType,
        scheduledAt: parsedDate,
        estimatedHours:
          estimatedHours !== undefined &&
          estimatedHours !== null &&
          estimatedHours !== ""
            ? parseFloat(estimatedHours)
            : null,
        estimatedUnit: estimatedUnit || "hours",
        estimatedValue:
          estimatedValue !== undefined &&
          estimatedValue !== null &&
          estimatedValue !== ""
            ? String(estimatedValue)
            : null,

        // ── Payment / duration ────────────────────────────────────────────
        budgetType,
        budget: resolvedBudget,
        currency: resolvedCurrency,
        durationType,
        durationValue:
          durationValue !== undefined &&
          durationValue !== null &&
          durationValue !== ""
            ? String(durationValue)
            : null,

        // ── Extras ────────────────────────────────────────────────────────
        skills: Array.isArray(skills) ? skills : [],
        notes: notes || null,

        // ── NEW: External-style display fields ────────────────────────────
        companyName: companyName || null,
        salaryText: salaryText || null,
        sourcePlatform: sourcePlatform || null,

        // ── NEW: Application channels ─────────────────────────────────────
        applicationUrl: applicationUrl || null,
        applicationEmail: applicationEmail || null,
        applicationWhatsApp: applicationWhatsApp || null,
        applicationPhone: applicationPhone || null,

        // ── NEW: Requirements / responsibilities ──────────────────────────
        minQualification: minQualification || null,
        experienceLevel: experienceLevel || null,
        experienceLength: experienceLength || null,
        languageRequirement: languageRequirement || "English",
        workingHours: workingHours || null,
        applicantLocation: applicantLocation || null,
        responsibilities: responsibilities || null,
        requirements: requirements || null,

        // ── NEW: Salary range ─────────────────────────────────────────────
        salaryAmount:
          salaryAmount !== undefined &&
          salaryAmount !== null &&
          salaryAmount !== ""
            ? parseFloat(salaryAmount)
            : null,
        salaryMin:
          salaryMin !== undefined && salaryMin !== null && salaryMin !== ""
            ? parseFloat(salaryMin)
            : null,
        salaryMax:
          salaryMax !== undefined && salaryMax !== null && salaryMax !== ""
            ? parseFloat(salaryMax)
            : null,
        salaryCurrency: salaryCurrency || null,
        salaryPeriod: salaryPeriod || null,

        // ── NEW: Misc ─────────────────────────────────────────────────────
        educationLevel: educationLevel || null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      },
      include: {
        hirer: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
        category: true,
        categories: { include: { category: true } },
        _count: { select: { applications: true } },
      },
    });

    // ── NEW: Link additional categories (many-to-many) ────────────────────────
    if (Array.isArray(categoryIds) && categoryIds.length > 0) {
      // Filter out categoryId itself to avoid duplicate unique constraint
      const extraIds = categoryIds.filter((id) => id !== categoryId);
      if (extraIds.length > 0) {
        await prisma.jobCategory.createMany({
          data: extraIds.map((cid) => ({
            jobId: jobPost.id,
            categoryId: cid,
          })),
          skipDuplicates: true,
        });
      }
    }

    // Re-fetch with categories populated
    const fullJobPost = await prisma.jobPost.findUnique({
      where: { id: jobPost.id },
      include: {
        hirer: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
        category: true,
        categories: { include: { category: true } },
        _count: { select: { applications: true } },
      },
    });

    // ── Notify matching workers (fire-and-forget) ─────────────────────────────
    prisma.workerCategory
      .findMany({
        where: { categoryId, workerProfile: { isAvailable: true } },
        include: {
          workerProfile: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  email: true,
                  notifBookings: true,
                },
              },
            },
          },
        },
        take: 50,
      })
      .then((matches) => {
        matches.forEach((m) => {
          const u = m.workerProfile.user;
          if (!u || u.id === req.user.id) return;
          notifyNewJobMatch(
            u.id,
            fullJobPost.title,
            fullJobPost.id,
            category.name,
          ).catch(() => {});
          if (u.notifBookings) {
            sendNewJobMatchEmail({
              to: u.email,
              workerName: u.firstName,
              jobTitle: fullJobPost.title,
              jobId: fullJobPost.id,
              categoryName: category.name,
              budget: fullJobPost.budget,
              currency: fullJobPost.currency,
              address: fullJobPost.address,
            }).catch(() => {});
          }
        });
      })
      .catch(() => {});

    return sendResponse(res, {
      status: 201,
      message: "Job posted successfully",
      data: { jobPost: fullJobPost },
    });
  } catch (err) {
    console.error("createJobPost error:", err);
    return sendError(res, "Failed to post job");
  }
};

// ── GET /api/jobs ──────────────────────────────────────────────────────────────
// Public — browse all open job posts (workers search here)
export const getJobPosts = async (req, res) => {
  try {
    const {
      q,
      category,
      city,
      country,
      minBudget,
      maxBudget,
      currency,
      jobType,
      locationType,
      budgetType,
      experienceLevel,
      educationLevel,
      salaryPeriod,
      page = 1,
      limit = 20,
    } = req.query;
    const { skip, take } = paginate(page, limit);

    const where = {
      status: "OPEN",
      isExternal: false,
      ...(q && {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { companyName: { contains: q, mode: "insensitive" } },
          { salaryText: { contains: q, mode: "insensitive" } },
        ],
      }),
      ...(category && { category: { slug: category } }),
      ...(minBudget && { budget: { gte: parseFloat(minBudget) } }),
      ...(maxBudget && { budget: { lte: parseFloat(maxBudget) } }),
      ...(currency && { currency }),
      ...(jobType && { jobType }),
      ...(locationType && { locationType }),
      ...(budgetType && { budgetType }),
      ...(experienceLevel && { experienceLevel }),
      ...(educationLevel && { educationLevel }),
      ...(salaryPeriod && { salaryPeriod }),
      ...(city && {
        OR: [
          { hirer: { city: { contains: city, mode: "insensitive" } } },
          { address: { contains: city, mode: "insensitive" } },
        ],
      }),
      ...(country && {
        OR: [
          { hirer: { country: { contains: country, mode: "insensitive" } } },
          { applicantLocation: { contains: country, mode: "insensitive" } },
        ],
      }),
    };

    const [jobPosts, total] = await Promise.all([
      prisma.jobPost.findMany({
        where,
        skip,
        take,
        select: {
          // ── Core ───────────────────────────────────────────────────────
          id: true,
          title: true,
          description: true,
          address: true,
          latitude: true,
          longitude: true,
          scheduledAt: true,
          estimatedHours: true,
          estimatedUnit: true,
          estimatedValue: true,
          createdAt: true,
          status: true,
          isExternal: true,

          // ── Categorization & types ─────────────────────────────────────
          jobType: true,
          locationType: true,
          budgetType: true,
          durationType: true,
          durationValue: true,

          // ── Payment ────────────────────────────────────────────────────
          budget: true,
          currency: true,

          // ── Extras ─────────────────────────────────────────────────────
          skills: true,
          notes: true,

          // ── External-style display fields ──────────────────────────────
          companyName: true,
          salaryText: true,
          sourcePlatform: true,

          // ── Application channels ───────────────────────────────────────
          applicationUrl: true,
          applicationEmail: true,
          applicationWhatsApp: true,
          applicationPhone: true,

          // ── Requirements ───────────────────────────────────────────────
          minQualification: true,
          experienceLevel: true,
          experienceLength: true,
          languageRequirement: true,
          workingHours: true,
          applicantLocation: true,
          responsibilities: true,
          requirements: true,

          // ── Salary range ───────────────────────────────────────────────
          salaryAmount: true,
          salaryMin: true,
          salaryMax: true,
          salaryCurrency: true,
          salaryPeriod: true,
          educationLevel: true,
          expiryDate: true,

          // ── Relations ──────────────────────────────────────────────────
          hirer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              city: true,
              country: true,
              hirerProfile: {
                select: {
                  companyName: true,
                  avgRating: true,
                  totalHires: true,
                },
              },
            },
          },
          postedByAdmin: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          category: true,
          categories: { include: { category: true } },
          _count: { select: { applications: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.jobPost.count({ where }),
    ]);

    return sendResponse(res, {
      data: {
        jobPosts,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    console.error("getJobPosts error:", err);
    return sendError(res, "Failed to fetch job posts");
  }
};

// ── GET /api/jobs/:id ──────────────────────────────────────────────────────────
// Public — single job post detail

export const getJobPost = async (req, res) => {
  try {
    const jobPost = await prisma.jobPost.findUnique({
      where: { id: req.params.id, isExternal: false },
      include: {
        hirer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            city: true,
            country: true,
            createdAt: true,
            hirerProfile: {
              select: {
                companyName: true,
                companySize: true,
                website: true,
                avgRating: true,
                totalHires: true,
              },
            },
          },
        },
        postedByAdmin: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        category: true,
        categories: { include: { category: true } },
        _count: { select: { applications: true } },
      },
    });

    if (!jobPost) return sendError(res, "Job post not found", 404);

    let hasApplied = false;
    let isSaved = false;

    if (req.user) {
      const [application, savedJob] = await Promise.all([
        prisma.jobApplication.findFirst({
          where: { jobPostId: jobPost.id, workerId: req.user.id },
        }),
        req.user.role === "WORKER"
          ? prisma.savedJob.findUnique({
              where: {
                workerId_jobPostId: {
                  workerId: req.user.id,
                  jobPostId: jobPost.id,
                },
              },
            })
          : null,
      ]);
      hasApplied = !!application;
      isSaved = !!savedJob;
    }

    return sendResponse(res, {
      data: {
        jobPost: {
          ...jobPost,
          // Company name falls back to hirer profile if not directly set
          companyName:
            jobPost.companyName ||
            jobPost.hirer?.hirerProfile?.companyName ||
            null,
        },
        hasApplied,
        isSaved,
      },
    });
  } catch (err) {
    console.error("getJobPost error:", err);
    return sendError(res, "Failed to fetch job post");
  }
};

// ── GET /api/jobs/hirer/me ─────────────────────────────────────────────────────
// Protected — hirer views their own job posts
export const getMyJobPosts = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);

    const where = {
      hirerId: req.user.id,
      isExternal: false,
      ...(status && { status }),
    };

    const [jobPosts, total] = await Promise.all([
      prisma.jobPost.findMany({
        where,
        skip,
        take,
        include: {
          category: true,
          categories: { include: { category: true } },
          _count: { select: { applications: true } },
          applications: {
            take: 3,
            orderBy: { createdAt: "desc" },
            include: {
              worker: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  workerProfile: { select: { title: true, avgRating: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.jobPost.count({ where }),
    ]);

    return sendResponse(res, {
      data: {
        jobPosts,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch your job posts");
  }
};

// ── PATCH /api/jobs/:id/status ────────────────────────────────────────────────
// Protected — hirer updates job post status
export const updateJobPostStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["OPEN", "FILLED", "CANCELLED"];

    if (!allowed.includes(status)) return sendError(res, "Invalid status", 400);

    const jobPost = await prisma.jobPost.findUnique({
      where: { id: req.params.id },
    });
    if (!jobPost) return sendError(res, "Job post not found", 404);
    if (jobPost.hirerId !== req.user.id)
      return sendError(res, "Forbidden", 403);

    const updated = await prisma.jobPost.update({
      where: { id: req.params.id },
      data: { status },
    });

    return sendResponse(res, {
      message: "Job post updated",
      data: { jobPost: updated },
    });
  } catch (err) {
    return sendError(res, "Failed to update job post");
  }
};

// ── POST /api/jobs/:id/apply ───────────────────────────────────────────────────
// Protected (WORKER) — apply to a job post
export const applyToJob = async (req, res) => {
  try {
    const { message } = req.body;
    const jobPostId = req.params.id;

    const jobPost = await prisma.jobPost.findUnique({
      where: { id: jobPostId },
      include: {
        hirer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        category: true,
      },
    });

    if (!jobPost) return sendError(res, "Job post not found", 404);
    if (jobPost.status !== "OPEN")
      return sendError(
        res,
        "This job is no longer accepting applications",
        400,
      );
    if (jobPost.hirerId === req.user.id)
      return sendError(res, "You cannot apply to your own job", 400);

    // Check duplicate application
    const existing = await prisma.jobApplication.findFirst({
      where: { jobPostId, workerId: req.user.id },
    });
    if (existing)
      return sendError(res, "You have already applied to this job", 409);

    const worker = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { workerProfile: { select: { title: true, avgRating: true } } },
    });

    const application = await prisma.jobApplication.create({
      data: {
        jobPostId,
        workerId: req.user.id,
        message: message || null,
      },
      include: {
        worker: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            workerProfile: {
              select: { title: true, avgRating: true, completedJobs: true },
            },
          },
        },
        jobPost: { select: { id: true, title: true } },
      },
    });

    // ── In-app notification for hirer ──────────────────────────────────────────
    await prisma.notification.create({
      data: {
        userId: jobPost.hirerId,
        title: "New Job Application",
        body: `${worker.firstName} ${worker.lastName} applied for "${jobPost.title}"`,
        type: "JOB_APPLICATION",
        data: {
          jobPostId,
          applicationId: application.id,
          workerId: req.user.id,
        },
      },
    });

    // ── Email notification for hirer ───────────────────────────────────────────
    try {
      await sendJobApplicationEmail({
        to: jobPost.hirer.email,
        hirerName: jobPost.hirer.firstName,
        workerName: `${worker.firstName} ${worker.lastName}`,
        workerTitle: worker.workerProfile?.title || "Worker",
        workerRating: worker.workerProfile?.avgRating || 0,
        jobTitle: jobPost.title,
        jobId: jobPostId,
        applicationId: application.id,
        message: message || "",
      });
    } catch (emailErr) {
      console.error("Failed to send application email:", emailErr.message);
    }

    return sendResponse(res, {
      status: 201,
      message: "Application submitted successfully",
      data: { application },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to submit application");
  }
};

// ── GET /api/jobs/:id/applications ────────────────────────────────────────────
// Protected (HIRER) — view all applications for a job
export const getJobApplications = async (req, res) => {
  try {
    const jobPost = await prisma.jobPost.findUnique({
      where: { id: req.params.id },
    });
    if (!jobPost) return sendError(res, "Job post not found", 404);
    if (jobPost.hirerId !== req.user.id)
      return sendError(res, "Forbidden", 403);

    const applications = await prisma.jobApplication.findMany({
      where: { jobPostId: req.params.id },
      include: {
        worker: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            city: true,
            country: true,
            workerProfile: {
              select: {
                title: true,
                avgRating: true,
                totalReviews: true,
                completedJobs: true,
                hourlyRate: true,
                currency: true,
                isAvailable: true,
                yearsExperience: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return sendResponse(res, {
      data: { applications, total: applications.length },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch applications");
  }
};

// ── PATCH /api/jobs/:id/applications/:appId/status ───────────────────────────
// Protected (HIRER) — accept or reject an application
export const updateApplicationStatus = async (req, res) => {
  try {
    const { status } = req.body;
    // ── FIX: route param is `appId`, not `applicationId` ──
    const { id: jobPostId, appId: applicationId } = req.params;

    if (!["ACCEPTED", "REJECTED"].includes(status)) {
      return sendError(res, "Status must be ACCEPTED or REJECTED", 400);
    }

    const jobPost = await prisma.jobPost.findUnique({
      where: { id: jobPostId },
    });
    if (!jobPost) return sendError(res, "Job post not found", 404);
    if (jobPost.hirerId !== req.user.id)
      return sendError(res, "Forbidden", 403);

    // ── Guard: ensure the application exists and belongs to this job ──
    const existing = await prisma.jobApplication.findUnique({
      where: { id: applicationId },
      select: { id: true, jobPostId: true },
    });
    if (!existing) return sendError(res, "Application not found", 404);
    if (existing.jobPostId !== jobPostId)
      return sendError(res, "Application does not belong to this job", 400);

    const application = await prisma.jobApplication.update({
      where: { id: applicationId },
      data: { status },
      include: {
        worker: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        jobPost: { select: { title: true } },
      },
    });

    // Notify worker of decision
    await prisma.notification.create({
      data: {
        userId: application.workerId,
        title:
          status === "ACCEPTED"
            ? "Application Accepted! 🎉"
            : "Application Update",
        body:
          status === "ACCEPTED"
            ? `Your application for "${application.jobPost.title}" was accepted!`
            : `Your application for "${application.jobPost.title}" was not selected this time.`,
        type: "APPLICATION_STATUS",
        data: { jobPostId, applicationId, status },
      },
    });

    // If accepted, mark job as filled
    if (status === "ACCEPTED") {
      await prisma.jobPost.update({
        where: { id: jobPostId },
        data: { status: "FILLED" },
      });
    }

    return sendResponse(res, {
      message: `Application ${status.toLowerCase()}`,
      data: { application },
    });
  } catch (err) {
    console.error("updateApplicationStatus error:", err);
    return sendError(res, "Failed to update application");
  }
};

// ── GET /api/jobs/worker/my-applications ──────────────────────────────────────
// Protected (WORKER) — view all jobs a worker applied to
export const getMyApplications = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);

    const where = {
      workerId: req.user.id,
      ...(status && { status }),
    };

    const [applications, total] = await Promise.all([
      prisma.jobApplication.findMany({
        where,
        skip,
        take,
        include: {
          jobPost: {
            include: {
              hirer: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  hirerProfile: { select: { companyName: true } },
                },
              },
              category: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.jobApplication.count({ where }),
    ]);

    return sendResponse(res, {
      data: {
        applications,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch your applications");
  }
};

export const getHirerPublicProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    const [hirerProfile, jobPosts, reviews] = await Promise.all([
      prisma.hirerProfile.findUnique({
        where: { userId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              city: true,
              country: true,
              state: true,
              email: true,
              phone: true,
              gender: true,
              language: true,
              createdAt: true,
              profileVisible: true,
              showPhone: true,
              showLocation: true,
              showEmail: true,
              showGender: true,
            },
          },
        },
      }),
      prisma.jobPost.findMany({
        where: { hirerId: userId, status: "OPEN" },
        include: {
          category: true,
          _count: { select: { applications: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.review.findMany({
        where: { receiverId: userId },
        include: {
          giver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              role: true,
            },
          },
          booking: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    if (!hirerProfile) return sendError(res, "Hirer not found", 404);
    if (!hirerProfile.user.profileVisible) {
      return sendError(res, "This profile is private", 403);
    }

    const isOwnProfile = req.user?.id === userId;
    const u = hirerProfile.user;

    // Build privacy-filtered user object
    const filteredUser = {
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      avatar: u.avatar,
      language: u.language,
      createdAt: u.createdAt,
      city: isOwnProfile || u.showLocation ? u.city : null,
      country: isOwnProfile || u.showLocation ? u.country : null,
      state: isOwnProfile || u.showLocation ? u.state : null,
      phone: isOwnProfile || u.showPhone ? u.phone : null,
      email: isOwnProfile || u.showEmail ? u.email : null,
      gender: isOwnProfile || u.showGender ? u.gender : null,
    };

    const reviewStats = await prisma.review.aggregate({
      where: { receiverId: userId },
      _avg: { rating: true },
      _count: { id: true },
    });

    return sendResponse(res, {
      data: {
        profile: { ...hirerProfile, user: filteredUser },
        jobPosts,
        reviews,
        stats: {
          avgRating: Math.round((reviewStats._avg.rating || 0) * 10) / 10,
          totalReviews: reviewStats._count.id,
          totalHires: hirerProfile.totalHires,
          openJobs: jobPosts.length,
        },
      },
    });
  } catch (err) {
    console.error("getHirerPublicProfile error:", err);
    return sendError(res, "Failed to fetch hirer profile");
  }
};

// ─── GET /api/jobs/saved ──────────────────────────────────────────────────────
// Worker views their saved/bookmarked jobs
export const getSavedJobs = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);
    const workerId = req.user.id;

    const [saved, total] = await Promise.all([
      prisma.savedJob.findMany({
        where: { workerId },
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          jobPost: {
            include: {
              hirer: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  city: true,
                  country: true,
                  hirerProfile: {
                    select: {
                      companyName: true,
                      avgRating: true,
                      totalHires: true,
                    },
                  },
                },
              },
              category: true,
              _count: { select: { applications: true } },
            },
          },
        },
      }),
      prisma.savedJob.count({ where: { workerId } }),
    ]);

    // Check if the worker has already applied to each saved job
    const savedJobIds = saved.map((s) => s.jobPostId);
    const applied = await prisma.jobApplication.findMany({
      where: { workerId, jobPostId: { in: savedJobIds } },
      select: { jobPostId: true },
    });
    const appliedSet = new Set(applied.map((a) => a.jobPostId));

    return sendResponse(res, {
      data: {
        jobs: saved.map((s) => ({
          ...s.jobPost,
          savedAt: s.createdAt,
          savedId: s.id,
          hasApplied: appliedSet.has(s.jobPostId),
        })),
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch saved jobs");
  }
};

// ─── POST /api/jobs/:id/save ──────────────────────────────────────────────────
// Worker saves / bookmarks a job
export const saveJob = async (req, res) => {
  try {
    const workerId = req.user.id;
    const jobPostId = req.params.id;

    const jobPost = await prisma.jobPost.findUnique({
      where: { id: jobPostId },
      select: { id: true, title: true, status: true, hirerId: true },
    });
    if (!jobPost) return sendError(res, "Job not found", 404);
    if (jobPost.status !== "OPEN")
      return sendError(res, "This job is no longer open", 400);
    if (jobPost.hirerId === workerId)
      return sendError(res, "You cannot save your own job", 400);

    const saved = await prisma.savedJob.upsert({
      where: { workerId_jobPostId: { workerId, jobPostId } },
      update: {}, // already saved — no-op
      create: { workerId, jobPostId, id: crypto.randomUUID() },
    });

    return sendResponse(res, {
      status: 201,
      message: `"${jobPost.title}" saved to your job board`,
      data: { savedId: saved.id, jobPostId },
    });
  } catch (err) {
    if (err.code === "P2002") return sendError(res, "Job already saved", 409);
    return sendError(res, "Failed to save job");
  }
};

// ─── DELETE /api/jobs/:id/save ────────────────────────────────────────────────
// Worker removes a saved job
export const unsaveJob = async (req, res) => {
  try {
    const workerId = req.user.id;
    const jobPostId = req.params.id;

    await prisma.savedJob.deleteMany({ where: { workerId, jobPostId } });

    return sendResponse(res, { message: "Job removed from your saved list" });
  } catch (err) {
    return sendError(res, "Failed to unsave job");
  }
};
