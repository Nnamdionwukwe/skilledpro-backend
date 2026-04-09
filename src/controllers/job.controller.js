import { randomUUID } from "crypto";
import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { sendJobApplicationEmail } from "../services/email.service.js";

// ── POST /api/jobs ─────────────────────────────────────────────────────────────
// Hirer creates a public job post
export const createJobPost = async (req, res) => {
  try {
    const {
      categoryId,
      title,
      description,
      address,
      latitude,
      longitude,
      scheduledAt,
      estimatedHours,
      budget,
      currency,
      notes,
    } = req.body;

    if (
      !categoryId ||
      !title ||
      !description ||
      !address ||
      !scheduledAt ||
      !budget
    ) {
      return sendError(res, "Please provide all required fields", 400);
    }

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) return sendError(res, "Category not found", 404);

    const jobPost = await prisma.jobPost.create({
      data: {
        hirerId: req.user.id,
        categoryId,
        title,
        description,
        address,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        scheduledAt: new Date(scheduledAt),
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
        budget: parseFloat(budget),
        currency: currency || "NGN",
        notes: notes || null,
      },
      include: {
        hirer: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
        category: true,
        _count: { select: { applications: true } },
      },
    });

    return sendResponse(res, {
      status: 201,
      message: "Job posted successfully",
      data: { jobPost },
    });
  } catch (err) {
    console.error(err);
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
      page = 1,
      limit = 20,
    } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      status: "OPEN",
      ...(q && {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      }),
      ...(category && { category: { slug: category } }),
      ...(minBudget && { budget: { gte: parseFloat(minBudget) } }),
      ...(maxBudget && { budget: { lte: parseFloat(maxBudget) } }),
      ...(currency && { currency }),
      ...(city && { hirer: { city: { contains: city, mode: "insensitive" } } }),
      ...(country && {
        hirer: { country: { contains: country, mode: "insensitive" } },
      }),
    };

    const [jobPosts, total] = await Promise.all([
      prisma.jobPost.findMany({
        where,
        skip,
        take: parseInt(limit),
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
        orderBy: { createdAt: "desc" },
      }),
      prisma.jobPost.count({ where }),
    ]);

    return sendResponse(res, {
      data: {
        jobPosts,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch job posts");
  }
};

// ── GET /api/jobs/:id ──────────────────────────────────────────────────────────
// Public — single job post detail
export const getJobPost = async (req, res) => {
  try {
    const jobPost = await prisma.jobPost.findUnique({
      where: { id: req.params.id },
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
        category: true,
        _count: { select: { applications: true } },
      },
    });

    if (!jobPost) return sendError(res, "Job post not found", 404);

    // If worker is logged in, check if they already applied
    let hasApplied = false;
    if (req.user) {
      const existing = await prisma.jobApplication.findFirst({
        where: { jobPostId: jobPost.id, workerId: req.user.id },
      });
      hasApplied = !!existing;
    }

    return sendResponse(res, { data: { jobPost, hasApplied } });
  } catch (err) {
    console.error("JOBS ERROR:", err);
    return sendError(res, "Failed to fetch job posts");
  }
};

// ── GET /api/jobs/hirer/me ─────────────────────────────────────────────────────
// Protected — hirer views their own job posts
export const getMyJobPosts = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      hirerId: req.user.id,
      ...(status && { status }),
    };

    const [jobPosts, total] = await Promise.all([
      prisma.jobPost.findMany({
        where,
        skip,
        take: parseInt(limit),
        include: {
          category: true,
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
        pages: Math.ceil(total / parseInt(limit)),
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

// ── PATCH /api/jobs/:id/applications/:applicationId ───────────────────────────
// Protected (HIRER) — accept or reject an application
export const updateApplicationStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const { id: jobPostId, applicationId } = req.params;

    if (!["ACCEPTED", "REJECTED"].includes(status)) {
      return sendError(res, "Status must be ACCEPTED or REJECTED", 400);
    }

    const jobPost = await prisma.jobPost.findUnique({
      where: { id: jobPostId },
    });
    if (!jobPost) return sendError(res, "Job post not found", 404);
    if (jobPost.hirerId !== req.user.id)
      return sendError(res, "Forbidden", 403);

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
    console.error(err);
    return sendError(res, "Failed to update application");
  }
};

// ── GET /api/jobs/worker/my-applications ──────────────────────────────────────
// Protected (WORKER) — view all jobs a worker applied to
export const getMyApplications = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      workerId: req.user.id,
      ...(status && { status }),
    };

    const [applications, total] = await Promise.all([
      prisma.jobApplication.findMany({
        where,
        skip,
        take: parseInt(limit),
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
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch your applications");
  }
};

// ── GET /api/hirers/:userId/profile ───────────────────────────────────────────
// Public — full hirer public profile with job posts and reviews
// export const getHirerPublicProfile = async (req, res) => {
//   try {
//     const { userId } = req.params;

//     const [hirerProfile, jobPosts, reviews] = await Promise.all([
//       prisma.hirerProfile.findUnique({
//         where: { userId },
//         include: {
//           user: {
//             select: {
//               id: true,
//               firstName: true,
//               lastName: true,
//               avatar: true,
//               city: true,
//               country: true,
//               createdAt: true,
//             },
//           },
//         },
//       }),
//       prisma.jobPost.findMany({
//         where: { hirerId: userId, status: "OPEN" },
//         include: {
//           category: true,
//           _count: { select: { applications: true } },
//         },
//         orderBy: { createdAt: "desc" },
//         take: 10,
//       }),
//       prisma.review.findMany({
//         where: { receiverId: userId },
//         include: {
//           giver: {
//             select: {
//               id: true,
//               firstName: true,
//               lastName: true,
//               avatar: true,
//               role: true,
//             },
//           },
//           booking: { select: { id: true, title: true } },
//         },
//         orderBy: { createdAt: "desc" },
//         take: 5,
//       }),
//     ]);

//     if (!hirerProfile) return sendError(res, "Hirer not found", 404);

//     const reviewStats = await prisma.review.aggregate({
//       where: { receiverId: userId },
//       _avg: { rating: true },
//       _count: { id: true },
//     });

//     return sendResponse(res, {
//       data: {
//         profile: hirerProfile,
//         jobPosts,
//         reviews,
//         stats: {
//           avgRating: Math.round((reviewStats._avg.rating || 0) * 10) / 10,
//           totalReviews: reviewStats._count.id,
//           totalHires: hirerProfile.totalHires,
//           openJobs: jobPosts.length,
//         },
//       },
//     });
//   } catch (err) {
//     console.error(err);
//     return sendError(res, "Failed to fetch hirer profile");
//   }
// };

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
              // Privacy flags
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

    // ── Apply privacy rules ───────────────────────────────────────────────────
    const isOwnProfile = req.user?.id === userId;
    const u = hirerProfile.user;

    const safeUser = {
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
        profile: { ...hirerProfile, user: safeUser },
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
