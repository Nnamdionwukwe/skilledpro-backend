// src/controllers/adminAnalytics.controller.js
// ─────────────────────────────────────────────────────────────────────────────
// Admin-only endpoints for exploring user analytics.
// Every endpoint requires ADMIN role (enforced by route middleware).
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../config/database.js";
import { asyncHandler } from "../middleware/error.middleware.js";
import { sendResponse, sendError } from "../utils/response.js";
import { paginate } from "../utils/helpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// § 1  Platform-wide overview
// GET /api/admin/analytics/overview?days=30
// ─────────────────────────────────────────────────────────────────────────────
export const getOverview = asyncHandler(async (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 30, 365);
  const since = new Date(Date.now() - days * 86_400_000);

  const [
    totalUsers,
    activeUserRows,
    newUsers,
    totalSessions,
    totalPageViews,
    totalEvents,
    avgSessionAgg,
    topFeatures,
    topPages,
    topDevices,
    topBrowsers,
    topCountries,
    sessionsByDay,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.userSession.findMany({
      where: { startedAt: { gte: since }, userId: { not: null } },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.userSession.count({ where: { startedAt: { gte: since } } }),
    prisma.pageView.count({ where: { enteredAt: { gte: since } } }),
    prisma.userEvent.count({ where: { createdAt: { gte: since } } }),
    prisma.userSession.aggregate({
      where: { startedAt: { gte: since }, durationMs: { not: null } },
      _avg: { durationMs: true },
    }),
    prisma.userEvent.groupBy({
      by: ["eventName"],
      where: { createdAt: { gte: since } },
      _count: { eventName: true },
      orderBy: { _count: { eventName: "desc" } },
      take: 20,
    }),
    prisma.pageView.groupBy({
      by: ["pageRef"],
      where: { enteredAt: { gte: since } },
      _count: { pageRef: true },
      orderBy: { _count: { pageRef: "desc" } },
      take: 20,
    }),
    prisma.userSession.groupBy({
      by: ["deviceType"],
      where: { startedAt: { gte: since } },
      _count: true,
    }),
    prisma.userSession.groupBy({
      by: ["browser"],
      where: { startedAt: { gte: since } },
      _count: true,
    }),
    prisma.userSession.groupBy({
      by: ["country"],
      where: { startedAt: { gte: since }, country: { not: null } },
      _count: true,
      orderBy: { _count: { country: "desc" } },
      take: 15,
    }),
    prisma.userSession.findMany({
      where: { startedAt: { gte: since } },
      select: { startedAt: true, userId: true },
    }),
  ]);

  // Daily sessions + DAU
  const byDay = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    byDay[key] = { date: key, sessions: 0, users: new Set() };
  }
  for (const s of sessionsByDay) {
    const key = s.startedAt.toISOString().slice(0, 10);
    if (byDay[key]) {
      byDay[key].sessions++;
      if (s.userId) byDay[key].users.add(s.userId);
    }
  }
  const dailyActivity = Object.values(byDay).map((d) => ({
    date: d.date,
    sessions: d.sessions,
    activeUsers: d.users.size,
  }));

  return sendResponse(res, {
    data: {
      period: `Last ${days} days`,
      totals: {
        totalUsers,
        activeUsers: activeUserRows.length,
        newUsers,
        totalSessions,
        totalPageViews,
        totalEvents,
        avgSessionDurationMs: Math.round(avgSessionAgg._avg.durationMs || 0),
      },
      topFeatures: topFeatures.map((f) => ({
        feature: f.eventName,
        count: f._count.eventName,
      })),
      topPages: topPages.map((p) => ({
        page: p.pageRef,
        count: p._count.pageRef,
      })),
      topDevices: topDevices.map((d) => ({
        device: d.deviceType || "unknown",
        count: d._count,
      })),
      topBrowsers: topBrowsers.map((b) => ({
        browser: b.browser || "unknown",
        count: b._count,
      })),
      topCountries: topCountries.map((c) => ({
        country: c.country || "unknown",
        count: c._count,
      })),
      dailyActivity,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 2  Per-user profile — the full coverage view
// GET /api/admin/analytics/user/:userId
// ─────────────────────────────────────────────────────────────────────────────
export const getUserCoverage = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const [
    user,
    insight,
    recentSessions,
    recentPageViews,
    recentInteractions,
    recentEvents,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatar: true,
        country: true,
        city: true,
        isActive: true,
        isBanned: true,
        createdAt: true,
        lastSeen: true,
      },
    }),
    prisma.userProfileInsight.findUnique({ where: { userId } }),
    prisma.userSession.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      take: 20,
    }),
    prisma.pageView.findMany({
      where: { userId },
      orderBy: { enteredAt: "desc" },
      take: 50,
    }),
    prisma.interactionEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.userEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  if (!user) return sendError(res, "User not found", 404);

  const featureCounts = {};
  for (const e of recentEvents) {
    featureCounts[e.eventName] = (featureCounts[e.eventName] || 0) + 1;
  }

  return sendResponse(res, {
    data: {
      user,
      insight: insight || {
        note: "Insight not yet computed — run the nightly aggregation job.",
      },
      recentSessions,
      recentPageViews,
      recentInteractions,
      recentEvents,
      liveFeatureCounts: featureCounts,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 3  List users with insight data, filterable by segment / score
// GET /api/admin/analytics/users?segment=&minScore=&sort=
// ─────────────────────────────────────────────────────────────────────────────
export const listUserInsights = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 50,
    segment,
    minScore,
    sortBy = "engagementScore",
  } = req.query;
  const { skip, take } = paginate(page, limit);

  const where = {};
  if (segment) where.segments = { has: segment };
  if (minScore) where.engagementScore = { gte: parseInt(minScore) };

  const allowedSorts = [
    "engagementScore",
    "lastActiveAt",
    "totalSessions",
    "totalTimeOnPlatform",
  ];
  const orderBy = allowedSorts.includes(sortBy)
    ? { [sortBy]: "desc" }
    : { engagementScore: "desc" };

  const [insights, total] = await Promise.all([
    prisma.userProfileInsight.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            avatar: true,
            isActive: true,
            isBanned: true,
          },
        },
      },
    }),
    prisma.userProfileInsight.count({ where }),
  ]);

  return sendResponse(res, {
    data: {
      users: insights,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / take),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 4  Segments CRUD
// ─────────────────────────────────────────────────────────────────────────────
export const listSegments = asyncHandler(async (_req, res) => {
  const segments = await prisma.userSegment.findMany({
    orderBy: { key: "asc" },
  });
  return sendResponse(res, { data: { segments } });
});

export const createSegment = asyncHandler(async (req, res) => {
  const { key, name, description, rule, isActive = true } = req.body || {};
  if (!key || !name || !rule) {
    return sendError(res, "key, name, rule are required", 400);
  }
  const segment = await prisma.userSegment.create({
    data: { key, name, description: description || null, rule, isActive },
  });
  return sendResponse(res, {
    status: 201,
    message: "Segment created",
    data: { segment },
  });
});

export const updateSegment = asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { name, description, rule, isActive } = req.body || {};
  const segment = await prisma.userSegment.update({
    where: { key },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(rule !== undefined && { rule }),
      ...(isActive !== undefined && { isActive }),
    },
  });
  return sendResponse(res, { message: "Segment updated", data: { segment } });
});

export const deleteSegment = asyncHandler(async (req, res) => {
  await prisma.userSegment.delete({ where: { key: req.params.key } });
  return sendResponse(res, { message: "Segment deleted" });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 5  Users in a segment
// GET /api/admin/analytics/segments/:key/users
// ─────────────────────────────────────────────────────────────────────────────
export const getSegmentUsers = asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const { skip, take } = paginate(page, limit);

  const segment = await prisma.userSegment.findUnique({ where: { key } });
  if (!segment) return sendError(res, "Segment not found", 404);

  const [memberships, total] = await Promise.all([
    prisma.userSegmentMembership.findMany({
      where: { segmentId: segment.id },
      skip,
      take,
      orderBy: { assignedAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            avatar: true,
          },
        },
      },
    }),
    prisma.userSegmentMembership.count({ where: { segmentId: segment.id } }),
  ]);

  return sendResponse(res, {
    data: {
      segment,
      members: memberships.map((m) => ({
        ...m.user,
        assignedAt: m.assignedAt,
      })),
      total,
      page: parseInt(page),
      pages: Math.ceil(total / take),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 6  Live event stream (last N minutes)
// GET /api/admin/analytics/live?minutes=15
// ─────────────────────────────────────────────────────────────────────────────
export const getLiveEvents = asyncHandler(async (req, res) => {
  const minutes = Math.min(parseInt(req.query.minutes) || 15, 120);
  const since = new Date(Date.now() - minutes * 60_000);

  const [events, activeSessions] = await Promise.all([
    prisma.userEvent.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            avatar: true,
          },
        },
      },
    }),
    prisma.userSession.count({
      where: { lastPingAt: { gte: since } },
    }),
  ]);

  return sendResponse(res, {
    data: {
      window: `Last ${minutes} minutes`,
      activeSessions,
      events,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 7  Funnel analysis — e.g. signup → first booking → first payment
// GET /api/admin/analytics/funnel?name=signup_to_paid
// ─────────────────────────────────────────────────────────────────────────────
export const getFunnel = asyncHandler(async (req, res) => {
  const { name = "signup_to_paid" } = req.query;
  const since = new Date(Date.now() - 90 * 86_400_000);

  let stages = [];
  if (name === "signup_to_paid") {
    stages = [
      {
        label: "Signed up",
        count: await prisma.user.count({
          where: { createdAt: { gte: since } },
        }),
      },
      {
        label: "Viewed a worker",
        count: (
          await prisma.userEvent.findMany({
            where: {
              createdAt: { gte: since },
              eventName: { in: ["worker.profile.view", "profile.view"] },
              userId: { not: null },
            },
            distinct: ["userId"],
            select: { userId: true },
          })
        ).length,
      },
      {
        label: "Created a booking",
        count: (
          await prisma.userEvent.findMany({
            where: {
              createdAt: { gte: since },
              eventName: "booking.created",
              userId: { not: null },
            },
            distinct: ["userId"],
            select: { userId: true },
          })
        ).length,
      },
      {
        label: "Payment held",
        count: (
          await prisma.userEvent.findMany({
            where: {
              createdAt: { gte: since },
              eventName: "payment.held",
              userId: { not: null },
            },
            distinct: ["userId"],
            select: { userId: true },
          })
        ).length,
      },
    ];
  }

  const shaped = stages.map((s, i) => {
    const prev = i === 0 ? s.count : stages[i - 1].count;
    return {
      ...s,
      conversionFromPrev:
        prev > 0 ? Math.round((s.count / prev) * 1000) / 10 : 0,
      conversionFromTop:
        stages[0].count > 0
          ? Math.round((s.count / stages[0].count) * 1000) / 10
          : 0,
    };
  });

  return sendResponse(res, { data: { name, stages: shaped } });
});
