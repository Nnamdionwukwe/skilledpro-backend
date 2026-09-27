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

// ─────────────────────────────────────────────────────────────────────────────
// § 8  Custom funnel builder — arbitrary sequences of events
// GET /api/admin/analytics/funnel-builder
//   ?steps=search.executed,page.workerProfile.view,createBooking.success
//   &days=30
//   &role=HIRER|WORKER|ALL
//   &includeDropoff=true|false   (default true)
//
// For each step:
//   - counts DISTINCT userId who fired the event in the window
//   - computes conversion from the previous step
//   - computes drop-off from the previous step
//   - optionally returns the top 10 users who fired the previous step
//     but never fired the current step
//
// A user "completes" a step if they fired the event AT LEAST ONCE during
// the window. We don't enforce order — we just measure presence. That's the
// pragmatic definition used by most product analytics tools (Mixpanel /
// Amplitude "uniqueness by step"). Enforcing strict sequence would require
// a different query shape and slower indexes; not worth it for v1.
// ─────────────────────────────────────────────────────────────────────────────
export const getFunnelBuilder = asyncHandler(async (req, res) => {
  const {
    steps: rawSteps,
    days = "30",
    role = "ALL",
    includeDropoff = "true",
  } = req.query;

  // ── Validate steps ─────────────────────────────────────────────────────────
  if (!rawSteps || typeof rawSteps !== "string") {
    return sendError(
      res,
      "Missing 'steps' query param (comma-separated event names).",
      400,
    );
  }

  const steps = rawSteps
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (steps.length < 2) {
    return sendError(res, "Provide at least 2 steps.", 400);
  }
  if (steps.length > 12) {
    return sendError(res, "Maximum 12 steps allowed.", 400);
  }
  if (steps.some((s) => s.length > 100)) {
    return sendError(res, "Each step name must be ≤ 100 chars.", 400);
  }

  const windowDays = Math.min(Math.max(parseInt(days) || 30, 1), 365);
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const includeDropoffBool = includeDropoff === "true";

  // ── Restrict to a role if requested ────────────────────────────────────────
  // Role is read from the User table via userId. Anonymous events (userId null)
  // are excluded when a role filter is applied.
  let roleUserIds = null;
  if (role === "HIRER" || role === "WORKER") {
    const roleUsers = await prisma.user.findMany({
      where: { role },
      select: { id: true },
    });
    roleUserIds = roleUsers.map((u) => u.id);
    if (roleUserIds.length === 0) {
      return sendResponse(res, {
        data: {
          window: `Last ${windowDays} days`,
          role,
          steps: [],
          summary: { totalSteps: steps.length, enteredAt: 0, completed: 0 },
        },
      });
    }
  }

  const userFilter = roleUserIds ? { in: roleUserIds } : undefined;

  // ── Per-step DISTINCT userId ───────────────────────────────────────────────
  // We do one query per step (bounded by 12 queries max). Prisma can't easily
  // do "grouped distinct within the same query" for arbitrary step names, and
  // the queries are indexed on (eventName, createdAt) so they're fast.
  const perStep = await Promise.all(
    steps.map(async (eventName) => {
      const where = {
        eventName,
        createdAt: { gte: since },
        userId: { not: null },
        ...(userFilter ? { userId: userFilter } : {}),
      };

      const distinctUsers = await prisma.userEvent.findMany({
        where,
        distinct: ["userId"],
        select: { userId: true },
      });

      return {
        eventName,
        userIds: distinctUsers.map((r) => r.userId),
      };
    }),
  );

  // ── Compute step metrics ──────────────────────────────────────────────────
  const stepResults = perStep.map((s, i) => {
    const count = s.userIds.length;
    const prev = i === 0 ? null : perStep[i - 1].userIds.length;
    const conversionFromPrev =
      i === 0 ? 100 : prev === 0 ? 0 : Math.round((count / prev) * 1000) / 10;
    const dropoffFromPrev = i === 0 ? 0 : prev === 0 ? 0 : prev - count;
    const conversionFromTop =
      perStep[0].userIds.length === 0
        ? 0
        : Math.round((count / perStep[0].userIds.length) * 1000) / 10;

    return {
      index: i,
      eventName: s.eventName,
      label: humanizeEventName(s.eventName),
      count,
      conversionFromPrev,
      dropoffFromPrev,
      conversionFromTop,
    };
  });

  // ── Top dropped-off users (per gap between steps) ─────────────────────────
  let dropoffUsers = [];
  if (includeDropoffBool && steps.length >= 2) {
    // For each gap (step N → step N+1), compute users who did step N
    // but not step N+1. Only for gaps with meaningful drop-off (>0).
    dropoffUsers = await Promise.all(
      stepResults.slice(0, -1).map(async (step, i) => {
        const nextStep = stepResults[i + 1];
        if (step.dropoffFromPrev === 0 && i === 0) {
          // No drop-off possible at the first step
          // (dropoffFromPrev is 0 by convention at index 0)
        }

        const thisSet = new Set(perStep[i].userIds);
        const nextSet = new Set(perStep[i + 1].userIds);
        const droppedIds = [...thisSet].filter((id) => !nextSet.has(id));

        if (droppedIds.length === 0) {
          return {
            fromStep: step.eventName,
            toStep: nextStep.eventName,
            droppedCount: 0,
            users: [],
          };
        }

        // Fetch minimal user info for the top 10 dropped users
        const users = await prisma.user.findMany({
          where: { id: { in: droppedIds.slice(0, 10) } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            avatar: true,
            lastSeen: true,
          },
        });

        return {
          fromStep: step.eventName,
          toStep: nextStep.eventName,
          droppedCount: droppedIds.length,
          users,
        };
      }),
    );
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const enteredAt = stepResults[0]?.count || 0;
  const completed = stepResults[stepResults.length - 1]?.count || 0;

  return sendResponse(res, {
    data: {
      window: `Last ${windowDays} days`,
      role,
      steps: stepResults,
      dropoffUsers,
      summary: {
        totalSteps: steps.length,
        enteredAt,
        completed,
        overallConversion:
          enteredAt === 0 ? 0 : Math.round((completed / enteredAt) * 1000) / 10,
      },
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper — turns "page.workerProfile.view" into "Page · Worker Profile · View"
// so the funnel step labels read nicely without a separate mapping table.
// ─────────────────────────────────────────────────────────────────────────────
function humanizeEventName(name) {
  if (!name) return "";
  return name
    .split(".")
    .map((part) =>
      part
        .replace(/([A-Z])/g, " $1") // camelCase → "camel Case"
        .replace(/^\s+/, "")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim(),
    )
    .join(" · ");
}

// ─────────────────────────────────────────────────────────────────────────────
// § 9  Top Workers Leaderboard
// GET /api/admin/analytics/top-workers
//   ?days=30
//   &sortBy=bookings|views|bookIntent|conversion|earnings|rating
//   &categoryId=...       (optional)
//   &city=...             (optional)
//   &verifiedOnly=true    (optional)
//   &limit=50
//
// Combines 3 signals:
//   1. Profile views       — from page.workerProfile.view events
//   2. Book intent         — from workerProfile.book.clicked events
//   3. Real bookings       — from Booking table where status=COMPLETED
//
// Two derived metrics:
//   - Conversion rate      — book intent / profile views
//   - Dead profile flag    — high views, low conversion (>=50 views, <2% CTR)
//
// Everything else (name, rating, category, verification) comes from the User
// and WorkerProfile tables, so the leaderboard shows enriched info per worker.
// ─────────────────────────────────────────────────────────────────────────────
export const getTopWorkers = asyncHandler(async (req, res) => {
  const {
    days = "30",
    sortBy = "bookings",
    categoryId,
    city,
    verifiedOnly = "false",
    limit = "50",
  } = req.query;

  const windowDays = Math.min(Math.max(parseInt(days) || 30, 1), 365);
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const take = Math.min(Math.max(parseInt(limit) || 50, 1), 200);
  const onlyVerified = verifiedOnly === "true";

  // ── Step 1: aggregate events per userId ────────────────────────────────────
  // We need userId for both event names, grouped. Prisma can't groupBy across
  // two event names in one query, so we run two groupBy calls.

  const [viewRows, intentRows] = await Promise.all([
    prisma.userEvent.groupBy({
      by: ["userId"],
      where: {
        eventName: "page.workerProfile.view",
        createdAt: { gte: since },
        userId: { not: null },
      },
      _count: { userId: true },
    }),
    prisma.userEvent.groupBy({
      by: ["userId"],
      where: {
        eventName: "workerProfile.book.clicked",
        createdAt: { gte: since },
        userId: { not: null },
      },
      _count: { userId: true },
    }),
  ]);

  const viewsMap = new Map(viewRows.map((r) => [r.userId, r._count.userId]));
  const intentMap = new Map(intentRows.map((r) => [r.userId, r._count.userId]));

  // Union of both sets
  const workerIds = [...new Set([...viewsMap.keys(), ...intentMap.keys()])];

  // ── Step 2: enrich with user + worker profile + booking counts ─────────────
  if (workerIds.length === 0) {
    return sendResponse(res, {
      data: {
        window: `Last ${windowDays} days`,
        sortBy,
        workers: [],
        total: 0,
      },
    });
  }

  // Build the user filter
  const userWhere = {
    id: { in: workerIds },
    role: "WORKER",
  };
  if (city) userWhere.city = { equals: city, mode: "insensitive" };

  // Optional category filter — restricts to workers with that category
  const workerProfileWhere = {};
  if (categoryId) {
    workerProfileWhere.categories = { some: { categoryId } };
  }
  if (onlyVerified) {
    workerProfileWhere.verificationStatus = "VERIFIED";
  }

  const users = await prisma.user.findMany({
    where: {
      ...userWhere,
      ...(categoryId || onlyVerified
        ? { workerProfile: workerProfileWhere }
        : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      avatar: true,
      city: true,
      country: true,
      lastSeen: true,
      workerProfile: {
        select: {
          id: true,
          title: true,
          hourlyRate: true,
          currency: true,
          avgRating: true,
          totalReviews: true,
          completedJobs: true,
          verificationStatus: true,
          isAvailable: true,
          categories: {
            select: {
              isPrimary: true,
              category: {
                select: { id: true, name: true, slug: true, icon: true },
              },
            },
          },
        },
      },
      _count: {
        select: { bookingsAsWorker: true },
      },
    },
  });

  // ── Step 3: fetch booking counts + earnings within the window ──────────────
  // Only count bookings the worker actually fulfilled in the window.
  const userIdsForBookings = users.map((u) => u.id);

  const [completedBookings, earningsRows] = await Promise.all([
    prisma.booking.groupBy({
      by: ["workerId", "status"],
      where: {
        workerId: { in: userIdsForBookings },
        createdAt: { gte: since },
      },
      _count: { workerId: true },
    }),
    prisma.payment.groupBy({
      by: ["userId"],
      where: {
        userId: { in: userIdsForBookings },
        status: "RELEASED",
        createdAt: { gte: since },
      },
      _sum: { workerPayout: true },
    }),
  ]);

  // Completed bookings per worker
  const bookingsByWorker = new Map();
  for (const row of completedBookings) {
    if (!bookingsByWorker.has(row.workerId)) {
      bookingsByWorker.set(row.workerId, { total: 0, completed: 0 });
    }
    const entry = bookingsByWorker.get(row.workerId);
    entry.total += row._count.workerId;
    if (row.status === "COMPLETED") entry.completed += row._count.workerId;
  }

  // Earnings per worker (from Payment.userId — this is the worker who received)
  const earningsMap = new Map(
    earningsRows.map((r) => [r.userId, r._sum.workerPayout || 0]),
  );

  // ── Step 4: build the row array ────────────────────────────────────────────
  const rows = users.map((u) => {
    const views = viewsMap.get(u.id) || 0;
    const bookIntent = intentMap.get(u.id) || 0;
    const bookings = bookingsByWorker.get(u.id) || { total: 0, completed: 0 };
    const earnings = earningsMap.get(u.id) || 0;

    // Conversion: book-intent clicks / profile views
    const conversion = views > 0 ? (bookIntent / views) * 100 : 0;

    // Dead profile flag — high views, low conversion
    const isDeadProfile = views >= 20 && conversion < 2;

    // Primary category
    const primary =
      u.workerProfile?.categories?.find((c) => c.isPrimary)?.category ||
      u.workerProfile?.categories?.[0]?.category ||
      null;

    return {
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      avatar: u.avatar,
      city: u.city,
      country: u.country,
      lastSeen: u.lastSeen,
      title: u.workerProfile?.title || null,
      hourlyRate: u.workerProfile?.hourlyRate || 0,
      currency: u.workerProfile?.currency || "USD",
      avgRating: u.workerProfile?.avgRating || 0,
      totalReviews: u.workerProfile?.totalReviews || 0,
      completedJobs: u.workerProfile?.completedJobs || 0,
      verificationStatus: u.workerProfile?.verificationStatus || "UNVERIFIED",
      isAvailable: u.workerProfile?.isAvailable ?? true,
      primaryCategory: primary,
      categoryCount: u.workerProfile?.categories?.length || 0,
      // Metrics
      views,
      bookIntent,
      conversion: Math.round(conversion * 10) / 10,
      bookingsTotal: bookings.total,
      bookingsCompleted: bookings.completed,
      earnings,
      isDeadProfile,
    };
  });

  // ── Step 5: sort ───────────────────────────────────────────────────────────
  const sorters = {
    bookings: (a, b) => b.bookingsCompleted - a.bookingsCompleted,
    views: (a, b) => b.views - a.views,
    bookIntent: (a, b) => b.bookIntent - a.bookIntent,
    conversion: (a, b) => b.conversion - a.conversion,
    earnings: (a, b) => b.earnings - a.earnings,
    rating: (a, b) => b.avgRating - a.avgRating,
  };
  const sorter = sorters[sortBy] || sorters.bookings;
  rows.sort(sorter);

  // ── Step 6: summary stats ──────────────────────────────────────────────────
  const totalViews = rows.reduce((sum, r) => sum + r.views, 0);
  const totalIntent = rows.reduce((sum, r) => sum + r.bookIntent, 0);
  const totalBookings = rows.reduce((sum, r) => sum + r.bookingsCompleted, 0);
  const totalEarnings = rows.reduce((sum, r) => sum + r.earnings, 0);
  const deadProfiles = rows.filter((r) => r.isDeadProfile).length;

  return sendResponse(res, {
    data: {
      window: `Last ${windowDays} days`,
      sortBy,
      summary: {
        totalWorkers: rows.length,
        totalViews,
        totalIntent,
        totalBookings,
        totalEarnings,
        deadProfiles,
        overallConversion:
          totalViews > 0
            ? Math.round((totalIntent / totalViews) * 1000) / 10
            : 0,
      },
      workers: rows.slice(0, take),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 10  Booking → Payment funnel detail
// GET /api/admin/analytics/payment-funnel
//   ?days=30
//
// A dedicated deep-dive on the money path. Unlike the generic funnel builder,
// this endpoint knows the exact sequence of payment events and enriches the
// result with:
//   - per-method breakdown (card / bank_transfer / crypto)
//   - time-to-payment distribution
//   - top users dropped off at each stage
//
// Stages (in fixed order):
//   1. createBooking.success               (booking submitted)
//   2. page.initiatePayment.view           (payment page opened)
//   3. initiatePayment.method.selected     (payment method chosen)
//   4. initiatePayment.card.attempt
//      OR initiatePayment.bank.initiated
//      OR initiatePayment.crypto.initiated (payment initiated — any method)
//   5. initiatePayment.card.redirecting
//      OR initiatePayment.bank.confirmed
//      OR initiatePayment.crypto.confirmed (payment confirmed by client)
//   6. payment.held                        (server-side escrow — from backend)
//
// Stages 4 and 5 use OR across the three methods, so a user counts once
// even if they tried multiple methods.
// ─────────────────────────────────────────────────────────────────────────────
export const getPaymentFunnel = asyncHandler(async (req, res) => {
  const { days = "30" } = req.query;
  const windowDays = Math.min(Math.max(parseInt(days) || 30, 1), 365);
  const since = new Date(Date.now() - windowDays * 86_400_000);

  // ── Stage definitions with their event-name patterns ──────────────────────
  const STAGES = [
    {
      key: "booking_created",
      label: "Booking created",
      eventNames: ["createBooking.success"],
    },
    {
      key: "payment_viewed",
      label: "Payment page opened",
      eventNames: ["page.initiatePayment.view"],
    },
    {
      key: "method_selected",
      label: "Method selected",
      eventNames: ["initiatePayment.method.selected"],
    },
    {
      key: "payment_initiated",
      label: "Payment initiated",
      eventNames: [
        "initiatePayment.card.attempt",
        "initiatePayment.bank.initiated",
        "initiatePayment.crypto.initiated",
      ],
    },
    {
      key: "payment_confirmed",
      label: "Payment confirmed",
      eventNames: [
        "initiatePayment.card.redirecting",
        "initiatePayment.bank.confirmed",
        "initiatePayment.crypto.confirmed",
      ],
    },
    {
      key: "escrow_held",
      label: "Escrow held",
      // Backend event — needs to fire from the payment controller.
      // If it doesn't exist yet, this stage will show 0. We'll note it
      // in the response so the UI can display a hint.
      eventNames: ["payment.held", "payment.initiated"],
    },
  ];

  // ── Compute distinct userIds per stage ────────────────────────────────────
  const perStage = await Promise.all(
    STAGES.map(async (stage) => {
      const rows = await prisma.userEvent.findMany({
        where: {
          eventName: { in: stage.eventNames },
          createdAt: { gte: since },
          userId: { not: null },
        },
        distinct: ["userId"],
        select: { userId: true },
      });
      return {
        ...stage,
        userIds: rows.map((r) => r.userId),
      };
    }),
  );

  // ── Stage metrics ─────────────────────────────────────────────────────────
  const steps = perStage.map((s, i) => {
    const count = s.userIds.length;
    const prev = i === 0 ? null : perStage[i - 1].userIds.length;
    const conversionFromPrev =
      i === 0 ? 100 : prev === 0 ? 0 : Math.round((count / prev) * 1000) / 10;
    const conversionFromTop =
      perStage[0].userIds.length === 0
        ? 0
        : Math.round((count / perStage[0].userIds.length) * 1000) / 10;
    const dropoffFromPrev = i === 0 ? 0 : prev === 0 ? 0 : prev - count;

    return {
      index: i,
      key: s.key,
      label: s.label,
      eventNames: s.eventNames,
      count,
      conversionFromPrev,
      conversionFromTop,
      dropoffFromPrev,
    };
  });

  // ── Per-method breakdown ──────────────────────────────────────────────────
  // For each payment method, count users who attempted / confirmed.
  const methodEventNames = [
    "initiatePayment.card.attempt",
    "initiatePayment.card.redirecting",
    "initiatePayment.bank.initiated",
    "initiatePayment.bank.confirmed",
    "initiatePayment.crypto.initiated",
    "initiatePayment.crypto.confirmed",
  ];

  const methodRows = await prisma.userEvent.findMany({
    where: {
      eventName: { in: methodEventNames },
      createdAt: { gte: since },
      userId: { not: null },
    },
    distinct: ["userId", "eventName"],
    select: { userId: true, eventName: true },
  });

  // Group by method
  const methodAgg = {
    card: { attempted: new Set(), confirmed: new Set() },
    bank_transfer: { attempted: new Set(), confirmed: new Set() },
    crypto: { attempted: new Set(), confirmed: new Set() },
  };

  for (const row of methodRows) {
    if (row.eventName === "initiatePayment.card.attempt")
      methodAgg.card.attempted.add(row.userId);
    if (row.eventName === "initiatePayment.card.redirecting")
      methodAgg.card.confirmed.add(row.userId);
    if (row.eventName === "initiatePayment.bank.initiated")
      methodAgg.bank_transfer.attempted.add(row.userId);
    if (row.eventName === "initiatePayment.bank.confirmed")
      methodAgg.bank_transfer.confirmed.add(row.userId);
    if (row.eventName === "initiatePayment.crypto.initiated")
      methodAgg.crypto.attempted.add(row.userId);
    if (row.eventName === "initiatePayment.crypto.confirmed")
      methodAgg.crypto.confirmed.add(row.userId);
  }

  const methods = Object.entries(methodAgg).map(([method, sets]) => {
    const attempted = sets.attempted.size;
    const confirmed = sets.confirmed.size;
    return {
      method,
      attempted,
      confirmed,
      successRate:
        attempted > 0 ? Math.round((confirmed / attempted) * 1000) / 10 : 0,
    };
  });

  // ── Time-to-payment distribution ──────────────────────────────────────────
  // For each booking that reached payment-initiated, compute time from
  // booking creation to payment initiation. Uses UserEvent timestamps.
  // We approximate by finding each user's FIRST createBooking.success and
  // their FIRST payment initiation in the window, then subtracting.
  const bookingEvents = await prisma.userEvent.findMany({
    where: {
      eventName: "createBooking.success",
      createdAt: { gte: since },
      userId: { not: null },
    },
    orderBy: { createdAt: "asc" },
    select: { userId: true, createdAt: true },
  });

  const firstBookingByUser = new Map();
  for (const e of bookingEvents) {
    if (!firstBookingByUser.has(e.userId)) {
      firstBookingByUser.set(e.userId, e.createdAt);
    }
  }

  const paymentEvents = await prisma.userEvent.findMany({
    where: {
      eventName: {
        in: [
          "initiatePayment.card.attempt",
          "initiatePayment.bank.initiated",
          "initiatePayment.crypto.initiated",
        ],
      },
      createdAt: { gte: since },
      userId: { in: [...firstBookingByUser.keys()] },
    },
    orderBy: { createdAt: "asc" },
    select: { userId: true, createdAt: true },
  });

  const firstPaymentByUser = new Map();
  for (const e of paymentEvents) {
    if (!firstPaymentByUser.has(e.userId)) {
      firstPaymentByUser.set(e.userId, e.createdAt);
    }
  }

  // Bucket the durations
  const buckets = {
    under_5min: 0,
    "5_to_30min": 0,
    "30min_to_2h": 0,
    "2h_to_1d": 0,
    "1d_to_7d": 0,
    over_7d: 0,
  };
  const durationsMs = [];

  for (const [userId, bookedAt] of firstBookingByUser) {
    const paidAt = firstPaymentByUser.get(userId);
    if (!paidAt) continue;
    const ms = paidAt.getTime() - bookedAt.getTime();
    if (ms < 0) continue; // sanity
    durationsMs.push(ms);

    if (ms < 5 * 60_000) buckets.under_5min++;
    else if (ms < 30 * 60_000) buckets["5_to_30min"]++;
    else if (ms < 2 * 3600_000) buckets["30min_to_2h"]++;
    else if (ms < 24 * 3600_000) buckets["2h_to_1d"]++;
    else if (ms < 7 * 86_400_000) buckets["1d_to_7d"]++;
    else buckets.over_7d++;
  }

  const avgMs = durationsMs.length
    ? Math.round(durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length)
    : 0;
  const medianMs = durationsMs.length
    ? (() => {
        const sorted = [...durationsMs].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
          ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
          : sorted[mid];
      })()
    : 0;

  // ── Top dropped-off users per stage ───────────────────────────────────────
  // For each stage N → N+1 gap, find users who did N but not N+1.
  const dropoffUsers = await Promise.all(
    steps.slice(0, -1).map(async (stage, i) => {
      const nextStage = steps[i + 1];
      const thisSet = new Set(perStage[i].userIds);
      const nextSet = new Set(perStage[i + 1].userIds);
      const droppedIds = [...thisSet].filter((id) => !nextSet.has(id));

      if (droppedIds.length === 0) {
        return {
          fromStage: stage.key,
          toStage: nextStage.key,
          fromLabel: stage.label,
          toLabel: nextStage.label,
          droppedCount: 0,
          users: [],
        };
      }

      const users = await prisma.user.findMany({
        where: { id: { in: droppedIds.slice(0, 10) } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          avatar: true,
          lastSeen: true,
        },
      });

      return {
        fromStage: stage.key,
        toStage: nextStage.key,
        fromLabel: stage.label,
        toLabel: nextStage.label,
        droppedCount: droppedIds.length,
        users,
      };
    }),
  );

  // ── Escrow-held signal check ──────────────────────────────────────────────
  // Note whether `payment.held` events actually exist. If not, the last stage
  // will show 0 and we tell the UI to display a hint instead of "100% drop-off".
  const paymentHeldCount = await prisma.userEvent.count({
    where: {
      eventName: "payment.held",
      createdAt: { gte: since },
    },
  });

  return sendResponse(res, {
    data: {
      window: `Last ${windowDays} days`,
      steps,
      methods,
      timing: {
        buckets,
        avgMs,
        medianMs,
        sampleSize: durationsMs.length,
      },
      dropoffUsers,
      hasEscrowEvent: paymentHeldCount > 0,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 11  Category Demand Report
// GET /api/admin/analytics/category-demand
//   ?days=30
//   &sortBy=demand|gap|bookings|supply|workers
//   &limit=200
//
// Combines 3 signals per category:
//   1. DEMAND
//      - search.suggestion.clicked  where props.type = "category"
//        (explicit interest in a specific category from autocomplete)
//      - search.trending.category.clicked  where props.categoryId matches
//        (clicks from the trending-categories section)
//      - landing.category.clicked  where props.categoryId matches
//        (homepage category card clicks)
//   2. SUPPLY
//      - WorkerCategory count for this category
//      - JobPost count for this category
//   3. CONVERSION
//      - Booking count where categoryId matches (completed in the window)
//
// Derived:
//   - demandPerWorker  = demandScore / max(workers, 1)
//   - opportunityScore = demand × (1 / max(workers, 1))  — weighted
//   - flags: supply_gap | oversupplied | dormant | balanced
// ─────────────────────────────────────────────────────────────────────────────
export const getCategoryDemand = asyncHandler(async (req, res) => {
  const { days = "30", sortBy = "demand", limit = "200" } = req.query;

  const windowDays = Math.min(Math.max(parseInt(days) || 30, 1), 365);
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const take = Math.min(Math.max(parseInt(limit) || 200, 1), 500);

  // ── Step 1: all categories with their supply counts ───────────────────────
  const categories = await prisma.category.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      icon: true,
      isUserSubmitted: true,
      parentId: true,
      parent: { select: { id: true, name: true } },
      _count: {
        select: {
          workers: true,
          jobPosts: true,
          bookings: true,
        },
      },
    },
  });

  // Build a name → id map for text-based search matching
  const nameToId = new Map();
  for (const c of categories) {
    nameToId.set(c.name.toLowerCase(), c.id);
    nameToId.set(c.slug.toLowerCase(), c.id);
  }

  // ── Step 2: fetch demand events in the window ─────────────────────────────
  const demandEventNames = [
    "search.suggestion.clicked",
    "search.trending.category.clicked",
    "landing.category.clicked",
  ];

  const demandEvents = await prisma.userEvent.findMany({
    where: {
      eventName: { in: demandEventNames },
      createdAt: { gte: since },
    },
    select: {
      eventName: true,
      eventProps: true,
      userId: true,
    },
  });

  // Aggregate demand per category id
  const demandByCategoryId = new Map(); // categoryId → { count, uniqUsers:Set, byEvent:{} }
  const unmatchedDemand = []; // for debugging — events we couldn't attribute

  for (const e of demandEvents) {
    const props = e.eventProps || {};
    let categoryId = null;

    if (e.eventName === "search.suggestion.clicked") {
      // Only "category" type suggestions count for demand
      if (props.type !== "category") continue;
      categoryId = props.categoryId || null;
      // Fallback: try to match by name/slug
      if (!categoryId && props.categorySlug) {
        categoryId = nameToId.get(String(props.categorySlug).toLowerCase());
      }
      if (!categoryId && props.categoryName) {
        categoryId = nameToId.get(String(props.categoryName).toLowerCase());
      }
    } else if (e.eventName === "search.trending.category.clicked") {
      categoryId = props.categoryId || null;
      if (!categoryId && props.categorySlug) {
        categoryId = nameToId.get(String(props.categorySlug).toLowerCase());
      }
      if (!categoryId && props.categoryName) {
        categoryId = nameToId.get(String(props.categoryName).toLowerCase());
      }
    } else if (e.eventName === "landing.category.clicked") {
      categoryId = props.categoryId || null;
      if (!categoryId && props.categorySlug) {
        categoryId = nameToId.get(String(props.categorySlug).toLowerCase());
      }
      if (!categoryId && props.categoryName) {
        categoryId = nameToId.get(String(props.categoryName).toLowerCase());
      }
    }

    if (!categoryId) {
      unmatchedDemand.push(e.eventName);
      continue;
    }

    if (!demandByCategoryId.has(categoryId)) {
      demandByCategoryId.set(categoryId, {
        count: 0,
        uniqUsers: new Set(),
        byEvent: {},
      });
    }
    const entry = demandByCategoryId.get(categoryId);
    entry.count += 1;
    if (e.userId) entry.uniqUsers.add(e.userId);
    entry.byEvent[e.eventName] = (entry.byEvent[e.eventName] || 0) + 1;
  }

  // ── Step 3: fetch bookings in the window per category ─────────────────────
  // Bookings created in the window; count by category.
  const bookingsByCategory = await prisma.booking.groupBy({
    by: ["categoryId"],
    where: { createdAt: { gte: since } },
    _count: { categoryId: true },
  });
  const bookingsMap = new Map(
    bookingsByCategory.map((r) => [r.categoryId, r._count.categoryId]),
  );

  // ── Step 4: build rows ────────────────────────────────────────────────────
  const rows = categories.map((c) => {
    const demand = demandByCategoryId.get(c.id) || {
      count: 0,
      uniqUsers: new Set(),
      byEvent: {},
    };
    const workers = c._count.workers || 0;
    const jobPosts = c._count.jobPosts || 0;
    const totalBookings = bookingsMap.get(c.id) || 0;

    // Demand per worker — how many "asks" per available worker
    const demandPerWorker =
      workers > 0
        ? Math.round((demand.count / workers) * 10) / 10
        : demand.count > 0
          ? demand.count
          : 0;

    // Opportunity score: demand, discounted by available supply.
    // High demand + zero supply = huge score. High demand + high supply = normal.
    const supplyFactor = 1 + workers;
    const opportunityScore =
      Math.round((demand.count / supplyFactor) * 100) / 100;

    // Flags
    let flag = "balanced";
    if (demand.count === 0 && workers === 0) flag = "dormant";
    else if (demand.count > 0 && workers === 0) flag = "supply_gap";
    else if (demand.count >= 3 && workers > 0 && demand.count / workers >= 2)
      flag = "supply_gap";
    else if (workers >= 10 && demand.count <= 1) flag = "oversupplied";

    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
      isUserSubmitted: c.isUserSubmitted,
      parent: c.parent ? { id: c.parent.id, name: c.parent.name } : null,

      // Demand signals
      demandScore: demand.count,
      uniqueInterestedUsers: demand.uniqUsers.size,
      demandByEvent: demand.byEvent,

      // Supply signals
      workers,
      jobPosts,
      totalBookings,

      // Derived
      demandPerWorker,
      opportunityScore,

      // Classification
      flag,
    };
  });

  // ── Step 5: sort ──────────────────────────────────────────────────────────
  const sorters = {
    demand: (a, b) => b.demandScore - a.demandScore,
    gap: (a, b) => b.opportunityScore - a.opportunityScore,
    bookings: (a, b) => b.totalBookings - a.totalBookings,
    supply: (a, b) => b.workers - a.workers,
    workers: (a, b) => b.workers - a.workers,
    unique: (a, b) => b.uniqueInterestedUsers - a.uniqueInterestedUsers,
  };
  const sorter = sorters[sortBy] || sorters.demand;
  rows.sort(sorter);

  // ── Step 6: summary ───────────────────────────────────────────────────────
  const totalSearches = rows.reduce((sum, r) => sum + r.demandScore, 0);
  const tracked = rows.filter((r) => r.demandScore > 0).length;
  const supplyGaps = rows.filter((r) => r.flag === "supply_gap").length;
  const oversupplied = rows.filter((r) => r.flag === "oversupplied").length;
  const dormant = rows.filter((r) => r.flag === "dormant").length;
  const totalWorkers = rows.reduce((sum, r) => sum + r.workers, 0);
  const totalBookings = rows.reduce((sum, r) => sum + r.totalBookings, 0);

  return sendResponse(res, {
    data: {
      window: `Last ${windowDays} days`,
      sortBy,
      summary: {
        totalCategories: rows.length,
        trackedCategories: tracked,
        totalSearches,
        totalWorkers,
        totalBookings,
        supplyGaps,
        oversupplied,
        dormant,
      },
      // Note: `unmatchedDemand` is here to help debug — it counts demand
      // events whose categoryId couldn't be matched to any Category row.
      // Should stay small; if it grows, we may need to fix the tracker payload.
      unmatchedDemandEvents: unmatchedDemand.length,
      categories: rows.slice(0, take),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/analytics/send-test-digest
// Fires the daily-digest email immediately to the configured recipient.
// Same pipeline as the cron — safe to run any time.
// ─────────────────────────────────────────────────────────────────────────────
export const sendTestDigest = asyncHandler(async (req, res) => {
  const { buildDailyDigest } = await import("../services/digest.service.js");
  const { renderDailyDigest } = await import("../templates/dailyDigest.js");
  const { sendEmail } = await import("../services/email.service.js");

  const RECIPIENT = "skilledprozmarketplace@gmail.com";

  try {
    const data = await buildDailyDigest();
    const html = renderDailyDigest(data);

    const result = await sendEmail({
      to: RECIPIENT,
      subject: `[TEST] SkilledProz Daily Digest — ${data.windowLabel}`,
      html,
    });

    if (!result.success) {
      return sendError(res, `Digest send failed: ${result.error}`, 500);
    }

    return sendResponse(res, {
      message: `Test digest sent to ${RECIPIENT}`,
      data: {
        recipient: RECIPIENT,
        messageId: result.messageId,
        currenciesActive: Object.keys(data.revenue.byCurrency),
        users: data.users.newYesterday,
        bookings: data.bookings.newYesterday,
      },
    });
  } catch (err) {
    console.error("sendTestDigest error:", err);
    return sendError(res, `Digest failed: ${err.message}`, 500);
  }
});
