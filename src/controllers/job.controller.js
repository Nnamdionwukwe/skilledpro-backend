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

      // ── Schedule / duration ──────────────────────────────────────────────
      estimatedHours,
      estimatedUnit,
      estimatedValue,

      // ── Payment ──────────────────────────────────────────────────────────
      budget,
      currency,
      budgetType = "FIXED",

      // ── Extras ───────────────────────────────────────────────────────────
      skills = [],
      notes,

      // ── Work conditions ──────────────────────────────────────────────────
      providesAccommodation = false,
      providesMeals = false,

      // ── Language + qualifications ────────────────────────────────────────
      languageRequirement = "en",
      qualifications = [],
    } = req.body;

    // ── Validation ──────────────────────────────────────────────────────────
    const missing = [];
    if (!categoryId) missing.push("categoryId");
    if (!title) missing.push("title");
    if (!description) missing.push("description");
    if (!scheduledAt) missing.push("scheduledAt");
    if (budget === undefined || budget === null || budget === "") {
      missing.push("budget");
    } else if (isNaN(parseFloat(budget))) {
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

    // ── Date validation ─────────────────────────────────────────────────────
    const parsedDate = new Date(scheduledAt);
    if (isNaN(parsedDate.getTime())) {
      console.error("createJobPost invalid date:", { scheduledAt });
      return sendError(
        res,
        "Invalid scheduled date. Please pick a valid date and time.",
        400,
      );
    }

    // ── Validate the budget type is one of the enums Prisma accepts ─────────
    const ALLOWED_BUDGET_TYPES = [
      "FIXED",
      "HOURLY",
      "DAILY",
      "WEEKLY",
      "MONTHLY",
      "YEARLY",
      "CUSTOM",
    ];
    if (!ALLOWED_BUDGET_TYPES.includes(budgetType)) {
      return sendError(
        res,
        `Invalid budgetType. Must be one of: ${ALLOWED_BUDGET_TYPES.join(", ")}`,
        400,
      );
    }

    // ── Normalize language + qualifications ─────────────────────────────────
    // Language: accept a trimmed 2–5 char code (e.g. "en", "fr-CA"). Fall
    // back to "en" if the client sent nothing sensible.
    const resolvedLanguage =
      typeof languageRequirement === "string" && languageRequirement.trim()
        ? languageRequirement.trim().toLowerCase()
        : "en";

    // Qualifications: strings only, trimmed, deduped, capped at 10.
    const resolvedQualifications = Array.isArray(qualifications)
      ? Array.from(
          new Set(
            qualifications
              .filter((q) => typeof q === "string" && q.trim().length > 0)
              .map((q) => q.trim().slice(0, 120)),
          ),
        ).slice(0, 10)
      : [];

    // ── Validate category exists ────────────────────────────────────────────
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) return sendError(res, "Category not found", 404);

    // ── Create ──────────────────────────────────────────────────────────────
    const jobPost = await prisma.jobPost.create({
      data: {
        // Core
        hirerId: req.user.id,
        categoryId,
        title,
        description,

        // Location
        locationType,
        address: locationType !== "REMOTE" ? address : null,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,

        // Job meta
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

        // Payment
        budgetType,
        budget: parseFloat(budget),
        currency: currency || "NGN",

        // Extras
        skills: Array.isArray(skills) ? skills : [],
        notes: notes || null,

        // Work conditions
        providesAccommodation: Boolean(providesAccommodation),
        providesMeals: Boolean(providesMeals),

        // Language + qualifications
        languageRequirement: resolvedLanguage,
        qualifications: resolvedQualifications,
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

    // ── Notify matching workers (fire-and-forget) ──────────────────────────
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
            jobPost.title,
            jobPost.id,
            category.name,
          ).catch(() => {});
          if (u.notifBookings) {
            sendNewJobMatchEmail({
              to: u.email,
              workerName: u.firstName,
              jobTitle: jobPost.title,
              jobId: jobPost.id,
              categoryName: category.name,
              budget: jobPost.budget,
              currency: jobPost.currency,
              address: jobPost.address,
            }).catch(() => {});
          }
        });
      })
      .catch(() => {});

    return sendResponse(res, {
      status: 201,
      message: "Job posted successfully",
      data: { jobPost },
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
              lastSeen: true,
              profileVisible: true,
              showPhone: true,
              showLocation: true,
              showEmail: true,
              showGender: true,
              // ── Verification fields for public profile badges ─────────
              hirerProfile: {
                select: {
                  verificationStatus: true,
                  verificationType: true,
                },
              },
              workerProfile: {
                select: {
                  verificationStatus: true,
                  backgroundCheck: true,
                },
              },
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

    // ── Live stats — same shape as the private profile endpoint ──────────
    const [bookingStats, paymentStats, reviewStats] = await Promise.all([
      prisma.booking.aggregate({
        where: { hirerId: userId },
        _count: { id: true },
      }),
      prisma.payment.aggregate({
        where: { booking: { hirerId: userId }, status: "RELEASED" },
        _sum: { amount: true },
      }),
      prisma.review.aggregate({
        where: { receiverId: userId },
        _avg: { rating: true },
        _count: { id: true },
      }),
    ]);

    const liveStats = {
      totalHires: bookingStats._count.id ?? 0,
      totalSpent: paymentStats._sum.amount ?? 0,
      avgRating: Math.round((reviewStats._avg.rating ?? 0) * 10) / 10,
      totalReviews: reviewStats._count.id ?? 0,
      openJobs: jobPosts.length,
    };

    // Build privacy-filtered user object
    // Phone visibility is strictly controlled by the user's showPhone toggle.
    const filteredUser = {
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      avatar: u.avatar,
      language: u.language,
      createdAt: u.createdAt,
      lastSeen: u.lastSeen,
      city: isOwnProfile || u.showLocation ? u.city : null,
      country: isOwnProfile || u.showLocation ? u.country : null,
      state: isOwnProfile || u.showLocation ? u.state : null,
      phone: isOwnProfile || u.showPhone ? u.phone : null,
      email: isOwnProfile || u.showEmail ? u.email : null,
      gender: isOwnProfile || u.showGender ? u.gender : null,
      // ── Verification fields — always public (they're trust signals) ──
      hirerProfile: u.hirerProfile,
      workerProfile: u.workerProfile,
    };

    return sendResponse(res, {
      data: {
        profile: {
          ...hirerProfile,
          user: filteredUser,
          // ── Override stale DB columns with live aggregates ────────────
          totalSpent: liveStats.totalSpent,
          totalHires: liveStats.totalHires,
          avgRating: liveStats.avgRating,
          companyName: hirerProfile.companyName,
          companySize: hirerProfile.companySize,
          website: hirerProfile.website,
        },
        jobPosts,
        reviews,
        stats: liveStats,
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

// ── PUT /api/jobs/:id ─────────────────────────────────────────────────────────
// Protected (HIRER) — update an existing job post.
// Only the owning hirer may edit, and only while the job is still OPEN.
export const updateJobPost = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      // ── Core ──
      categoryId,
      title,
      description,

      // ── Location ──
      locationType = "REMOTE",
      address,
      latitude,
      longitude,

      // ── Job meta ──
      jobType = "FULL_TIME",
      scheduledAt,

      // ── Schedule / duration ──
      estimatedHours,
      estimatedUnit,
      estimatedValue,

      // ── Payment ──
      budget,
      currency,
      budgetType = "FIXED",

      // ── Extras ──
      skills = [],
      notes,

      // ── Work conditions ──
      providesAccommodation = false,
      providesMeals = false,

      // ── Language + qualifications ──
      languageRequirement = "en",
      qualifications = [],
    } = req.body;

    // ── 1. Load the existing job (needed for ownership + status checks) ──
    const existing = await prisma.jobPost.findUnique({
      where: { id },
    });
    if (!existing) return sendError(res, "Job post not found", 404);

    // ── 2. Ownership check ──
    if (existing.hirerId !== req.user.id) {
      return sendError(res, "You can only edit your own job posts", 403);
    }

    // ── 3. Status check — only OPEN jobs are editable ──
    if (existing.status !== "OPEN") {
      return sendError(
        res,
        "Only open jobs can be edited. Reopen the job first.",
        409,
      );
    }

    // ── 4. Validation (mirrors createJobPost) ──
    const missing = [];
    if (!categoryId) missing.push("categoryId");
    if (!title) missing.push("title");
    if (!description) missing.push("description");
    if (!scheduledAt) missing.push("scheduledAt");
    if (budget === undefined || budget === null || budget === "") {
      missing.push("budget");
    } else if (isNaN(parseFloat(budget))) {
      missing.push("budget (must be a number)");
    }
    if (locationType !== "REMOTE" && !address) missing.push("address");

    if (missing.length) {
      return sendError(
        res,
        `Missing required fields: ${missing.join(", ")}`,
        400,
      );
    }

    // ── 5. Date validation ──
    const parsedDate = new Date(scheduledAt);
    if (isNaN(parsedDate.getTime())) {
      return sendError(
        res,
        "Invalid scheduled date. Please pick a valid date and time.",
        400,
      );
    }

    // ── 6. Budget type validation ──
    const ALLOWED_BUDGET_TYPES = [
      "FIXED",
      "HOURLY",
      "DAILY",
      "WEEKLY",
      "MONTHLY",
      "YEARLY",
      "CUSTOM",
    ];
    if (!ALLOWED_BUDGET_TYPES.includes(budgetType)) {
      return sendError(
        res,
        `Invalid budgetType. Must be one of: ${ALLOWED_BUDGET_TYPES.join(", ")}`,
        400,
      );
    }

    // ── 7. Normalize language + qualifications ──
    const resolvedLanguage =
      typeof languageRequirement === "string" && languageRequirement.trim()
        ? languageRequirement.trim().toLowerCase()
        : "en";

    const resolvedQualifications = Array.isArray(qualifications)
      ? Array.from(
          new Set(
            qualifications
              .filter((q) => typeof q === "string" && q.trim().length > 0)
              .map((q) => q.trim().slice(0, 120)),
          ),
        ).slice(0, 10)
      : [];

    // ── 8. Verify category exists (if it's being changed) ──
    if (categoryId !== existing.categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
      });
      if (!category) return sendError(res, "Category not found", 404);
    }

    // ── 9. Perform the update ──
    // NOTE: status is intentionally NOT updatable here. Use PATCH /:id/status.
    const updated = await prisma.jobPost.update({
      where: { id },
      data: {
        categoryId,
        title,
        description,

        locationType,
        address: locationType !== "REMOTE" ? address : null,
        latitude:
          latitude != null && latitude !== "" ? parseFloat(latitude) : null,
        longitude:
          longitude != null && longitude !== "" ? parseFloat(longitude) : null,

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

        budgetType,
        budget: parseFloat(budget),
        currency: currency || "NGN",

        skills: Array.isArray(skills) ? skills : [],
        notes: notes || null,

        providesAccommodation: Boolean(providesAccommodation),
        providesMeals: Boolean(providesMeals),

        languageRequirement: resolvedLanguage,
        qualifications: resolvedQualifications,
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

    return sendResponse(res, {
      message: "Job updated successfully",
      data: { jobPost: updated },
    });
  } catch (err) {
    console.error("updateJobPost error:", err);
    return sendError(res, "Failed to update job");
  }
};

// src/controllers/job.controller.js
export const unacceptApplication = async (req, res) => {
  try {
    const { id: jobPostId, appId: applicationId } = req.params;

    const jobPost = await prisma.jobPost.findUnique({
      where: { id: jobPostId },
    });
    if (!jobPost) return sendError(res, "Job post not found", 404);
    if (jobPost.hirerId !== req.user.id)
      return sendError(res, "Forbidden", 403);

    const application = await prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: {
        worker: { select: { id: true, firstName: true, lastName: true } },
        jobPost: { select: { title: true } },
      },
    });
    if (!application) return sendError(res, "Application not found", 404);
    if (application.jobPostId !== jobPostId)
      return sendError(res, "Application does not belong to this job", 400);
    if (application.status !== "ACCEPTED")
      return sendError(
        res,
        "Only accepted applications can be unaccepted",
        400,
      );

    // Cancel any booking created from this application, if one exists.
    const booking = await prisma.booking.findFirst({
      where: {
        jobPostId,
        workerId: application.workerId,
        status: { notIn: ["CANCELLED", "COMPLETED"] },
      },
    });

    if (booking) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          status: "CANCELLED",
          cancelReason: "Hirer unaccepted the worker for this job",
        },
      });
    }

    // Reset the application to PENDING and reopen the job.
    const updated = await prisma.jobApplication.update({
      where: { id: applicationId },
      data: { status: "PENDING" },
    });

    await prisma.jobPost.update({
      where: { id: jobPostId },
      data: { status: "OPEN" },
    });

    // Notify the worker.
    await prisma.notification.create({
      data: {
        userId: application.workerId,
        title: "Application Reopened",
        body: booking
          ? `The booking for "${application.jobPost.title}" was cancelled. Your application is back in review.`
          : `Your application for "${application.jobPost.title}" is back under review.`,
        type: "APPLICATION_STATUS",
        data: { jobPostId, applicationId, status: "PENDING" },
      },
    });

    return sendResponse(res, {
      message: "Application returned to pending review",
      data: { application: updated, cancelledBookingId: booking?.id || null },
    });
  } catch (err) {
    console.error("unacceptApplication error:", err);
    return sendError(res, "Failed to unaccept application");
  }
};
