import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

// ─── Record a click ──────────────────────────────────────────────────────
export const recordClick = async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.body;

    if (!type || !["APPLY_CLICK", "PROCEED_CLICK"].includes(type)) {
      return sendError(res, "Invalid click type", 400);
    }

    // Check if job exists and is external
    const job = await prisma.jobPost.findUnique({
      where: { id, isExternal: true },
    });
    if (!job) return sendError(res, "External job not found", 404);

    // Create or update (upsert) – we use upsert to avoid duplicates
    await prisma.externalJobClick.upsert({
      where: {
        jobPostId_userId_type: {
          jobPostId: id,
          userId: req.user.id,
          type,
        },
      },
      update: {}, // no-op if exists
      create: {
        jobPostId: id,
        userId: req.user.id,
        type,
      },
    });

    return sendResponse(res, { message: "Click recorded" });
  } catch (error) {
    console.error("recordClick error:", error);
    return sendError(res, "Failed to record click", 500);
  }
};

// ─── Get statistics for a job (admin) ──────────────────────────────────
export const getJobStats = async (req, res) => {
  try {
    const { id } = req.params;

    // Check job exists
    const job = await prisma.jobPost.findUnique({
      where: { id, isExternal: true },
      select: { id: true, title: true, companyName: true },
    });
    if (!job) return sendError(res, "External job not found", 404);

    // Aggregate counts
    const [applyClicks, proceedClicks] = await Promise.all([
      prisma.externalJobClick.groupBy({
        by: ["jobPostId", "userId"],
        where: { jobPostId: id, type: "APPLY_CLICK" },
        _count: true,
      }),
      prisma.externalJobClick.groupBy({
        by: ["jobPostId", "userId"],
        where: { jobPostId: id, type: "PROCEED_CLICK" },
        _count: true,
      }),
    ]);

    // Get distinct users who performed each action
    const applyUsers = await prisma.externalJobClick.findMany({
      where: { jobPostId: id, type: "APPLY_CLICK" },
      select: { userId: true },
      distinct: ["userId"],
    });
    const proceedUsers = await prisma.externalJobClick.findMany({
      where: { jobPostId: id, type: "PROCEED_CLICK" },
      select: { userId: true },
      distinct: ["userId"],
    });

    const applyUserIds = applyUsers.map((u) => u.userId);
    const proceedUserIds = proceedUsers.map((u) => u.userId);

    // Users who did both
    const bothUserIds = applyUserIds.filter((id) =>
      proceedUserIds.includes(id),
    );

    // Fetch user details
    const userIds = [...new Set([...applyUserIds, ...proceedUserIds])];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    // Build detailed list
    const allUserActions = userIds.map((userId) => ({
      user: userMap[userId],
      actions: {
        applied: applyUserIds.includes(userId),
        proceeded: proceedUserIds.includes(userId),
      },
    }));

    const stats = {
      totalApplyClicks: applyClicks.length,
      totalProceedClicks: proceedClicks.length,
      uniqueApplyUsers: applyUserIds.length,
      uniqueProceedUsers: proceedUserIds.length,
      uniqueBothUsers: bothUserIds.length,
      users: allUserActions,
    };

    return sendResponse(res, { data: { job, stats } });
  } catch (error) {
    console.error("getJobStats error:", error);
    return sendError(res, "Failed to fetch stats", 500);
  }
};
