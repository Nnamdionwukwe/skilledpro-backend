// scripts/aggregate-analytics.js
// ─────────────────────────────────────────────────────────────────────────────
// Nightly job. Run at 2 AM (before the 3 AM backup).
//
// What it does:
//   1. Recomputes FeatureUsageDaily for yesterday and today
//   2. Refreshes UserProfileInsight for every user with activity in last 30 days
//   3. Evaluates all active segments and updates UserSegmentMembership
//   4. Cleans up events older than 90 days (configurable)
//
// Run: node scripts/aggregate-analytics.js
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../src/config/database.js";

const EVENT_RETENTION_DAYS = 90;

// ─────────────────────────────────────────────────────────────────────────────
// § 1  Feature usage rollup
// ─────────────────────────────────────────────────────────────────────────────
async function rollupFeatureUsage(date) {
  console.log(`[agg] Rolling up feature usage for ${date}…`);

  const rows = await prisma.$queryRaw`
    SELECT
      "userId",
      "eventName" AS "featureKey",
      COUNT(*)::int AS "usageCount",
      MAX("createdAt") AS "lastUsed"
    FROM "UserEvent"
    WHERE "userId" IS NOT NULL
      AND DATE("createdAt") = ${date}::date
    GROUP BY "userId", "eventName"
  `;

  for (const r of rows) {
    await prisma.featureUsageDaily.upsert({
      where: {
        userId_date_featureKey: {
          userId: r.userId,
          date: new Date(date),
          featureKey: r.featureKey,
        },
      },
      update: {
        usageCount: r.usageCount,
        lastUsedAt: r.lastUsed,
      },
      create: {
        userId: r.userId,
        date: new Date(date),
        featureKey: r.featureKey,
        usageCount: r.usageCount,
        lastUsedAt: r.lastUsed,
      },
    });
  }

  console.log(`[agg] ${rows.length} feature-usage rows upserted`);
}

// ─────────────────────────────────────────────────────────────────────────────
// § 2  User profile insights
// ─────────────────────────────────────────────────────────────────────────────
async function refreshUserInsights() {
  console.log("[agg] Refreshing UserProfileInsight…");

  // Users with any activity in last 30 days
  const since = new Date(Date.now() - 30 * 86_400_000);
  const activeUsers = await prisma.userEvent.findMany({
    where: { createdAt: { gte: since }, userId: { not: null } },
    distinct: ["userId"],
    select: { userId: true },
  });

  const userIds = activeUsers.map((u) => u.userId);
  console.log(`[agg] ${userIds.length} active users to process`);

  for (const userId of userIds) {
    await computeInsightForUser(userId);
  }

  console.log("[agg] Insights updated");
}

async function computeInsightForUser(userId) {
  const [
    sessionsAgg,
    pageViewsAgg,
    eventsAgg,
    featureRollups,
    userDomain,
    topPages,
    hourDistribution,
  ] = await Promise.all([
    prisma.userSession.aggregate({
      where: { userId },
      _count: true,
      _sum: { durationMs: true },
      _max: { startedAt: true },
      _avg: { durationMs: true },
    }),
    prisma.pageView.count({ where: { userId } }),
    prisma.userEvent.count({ where: { userId } }),
    prisma.featureUsageDaily.groupBy({
      by: ["featureKey"],
      where: { userId },
      _sum: { usageCount: true },
      _max: { lastUsedAt: true },
      orderBy: { _sum: { usageCount: "desc" } },
      take: 50,
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        _count: {
          select: {
            bookingsAsHirer: true,
            bookingsAsWorker: true,
            sentMessages: true,
            reviewsGiven: true,
            reviewsReceived: true,
            jobApplications: true,
            jobPosts: true,
          },
        },
      },
    }),
    prisma.pageView.groupBy({
      by: ["pageRef"],
      where: { userId },
      _count: { pageRef: true },
      orderBy: { _count: { pageRef: "desc" } },
      take: 10,
    }),
    prisma.$queryRaw`
      SELECT EXTRACT(HOUR FROM "createdAt")::int AS hour, COUNT(*)::int AS count
      FROM "UserEvent"
      WHERE "userId" = ${userId}
      GROUP BY hour
      ORDER BY hour
    `,
  ]);

  // Build features map
  const featuresUsed = {};
  for (const f of featureRollups) {
    featuresUsed[f.featureKey] = f._sum.usageCount || 0;
  }
  const topFeatures = Object.entries(featuresUsed)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k]) => k);

  // Feature adoption %
  const ALL_FEATURES = [
    "page.view",
    "button.click",
    "search.use",
    "chat.send",
    "booking.created",
    "job.applied",
    "job.posted",
    "review.submitted",
    "profile.updated",
    "payment.initiated",
  ];
  const used = ALL_FEATURES.filter((f) => featuresUsed[f]).length;
  const featureAdoptionPct = (used / ALL_FEATURES.length) * 100;

  // Time-of-day preference
  const byHour = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  for (const h of hourDistribution) {
    const hr = h.hour;
    if (hr >= 5 && hr < 12) byHour.morning += h.count;
    else if (hr >= 12 && hr < 17) byHour.afternoon += h.count;
    else if (hr >= 17 && hr < 22) byHour.evening += h.count;
    else byHour.night += h.count;
  }

  // Engagement score (0-100)
  const totalSessions = sessionsAgg._count || 0;
  const totalTimeMs = sessionsAgg._sum.durationMs || 0;
  const avgDuration = sessionsAgg._avg.durationMs || 0;

  const scoreParts = {
    sessions: Math.min(totalSessions * 2, 30),
    time: Math.min((totalTimeMs / 3_600_000) * 5, 25), // 5 pts/hour capped at 25
    features: featureAdoptionPct * 0.25, // 0-25
    domain: Math.min(
      ((userDomain?._count.bookingsAsHirer || 0) +
        (userDomain?._count.bookingsAsWorker || 0) +
        (userDomain?._count.sentMessages || 0) +
        (userDomain?._count.reviewsGiven || 0)) *
        2,
      20,
    ),
  };
  const engagementScore = Math.min(
    100,
    Math.round(
      scoreParts.sessions +
        scoreParts.time +
        scoreParts.features +
        scoreParts.domain,
    ),
  );

  await prisma.userProfileInsight.upsert({
    where: { userId },
    update: {
      totalSessions,
      totalPageViews: pageViewsAgg,
      totalEventsCount: eventsAgg,
      totalTimeOnPlatform: totalTimeMs,
      lastActiveAt: sessionsAgg._max.startedAt,
      featuresUsed,
      topFeatures,
      featureAdoptionPct: Math.round(featureAdoptionPct * 100) / 100,
      jobsAppliedCount: userDomain?._count.jobApplications || 0,
      jobsPostedCount: userDomain?._count.jobPosts || 0,
      bookingsAsHirer: userDomain?._count.bookingsAsHirer || 0,
      bookingsAsWorker: userDomain?._count.bookingsAsWorker || 0,
      messagesSent: userDomain?._count.sentMessages || 0,
      reviewsGiven: userDomain?._count.reviewsGiven || 0,
      reviewsReceived: userDomain?._count.reviewsReceived || 0,
      preferredTimeOfDay: byHour,
      avgSessionDurationMs: Math.round(avgDuration),
      engagementScore,
    },
    create: {
      userId,
      totalSessions,
      totalPageViews: pageViewsAgg,
      totalEventsCount: eventsAgg,
      totalTimeOnPlatform: totalTimeMs,
      lastActiveAt: sessionsAgg._max.startedAt,
      featuresUsed,
      topFeatures,
      featureAdoptionPct: Math.round(featureAdoptionPct * 100) / 100,
      jobsAppliedCount: userDomain?._count.jobApplications || 0,
      jobsPostedCount: userDomain?._count.jobPosts || 0,
      bookingsAsHirer: userDomain?._count.bookingsAsHirer || 0,
      bookingsAsWorker: userDomain?._count.bookingsAsWorker || 0,
      messagesSent: userDomain?._count.sentMessages || 0,
      reviewsGiven: userDomain?._count.reviewsGiven || 0,
      reviewsReceived: userDomain?._count.reviewsReceived || 0,
      preferredTimeOfDay: byHour,
      avgSessionDurationMs: Math.round(avgDuration),
      engagementScore,
      segments: [],
      interests: [],
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3  Segment evaluation
// ─────────────────────────────────────────────────────────────────────────────
async function evaluateSegments() {
  console.log("[agg] Evaluating segments…");

  const segments = await prisma.userSegment.findMany({
    where: { isActive: true },
  });
  for (const seg of segments) {
    const userIds = await evaluateRule(seg.rule);

    // Replace memberships for this segment
    await prisma.userSegmentMembership.deleteMany({
      where: { segmentId: seg.id },
    });
    if (userIds.length > 0) {
      await prisma.userSegmentMembership.createMany({
        data: userIds.map((userId) => ({ userId, segmentId: seg.id })),
        skipDuplicates: true,
      });
    }

    await prisma.userSegment.update({
      where: { id: seg.id },
      data: { memberCount: userIds.length },
    });

    console.log(`[agg]   ${seg.key}: ${userIds.length} members`);
  }
}

// Rule DSL:
// { and: [ {field, op, value}, ... ] }
// { or: [ ... ] }
// { field: "engagementScore", op: ">", value: 70 }
// Supported ops: ">", ">=", "<", "<=", "=", "!=", "in", "not_in"
async function evaluateRule(rule) {
  const where = ruleToPrismaWhere(rule);
  if (!where) return [];
  const users = await prisma.userProfileInsight.findMany({
    where,
    select: { userId: true },
  });
  return users.map((u) => u.userId);
}

function ruleToPrismaWhere(rule) {
  if (!rule || typeof rule !== "object") return null;
  if (Array.isArray(rule.and)) {
    return { AND: rule.and.map(ruleToPrismaWhere).filter(Boolean) };
  }
  if (Array.isArray(rule.or)) {
    return { OR: rule.or.map(ruleToPrismaWhere).filter(Boolean) };
  }
  const { field, op, value } = rule;
  if (!field || !op) return null;
  const ops = {
    ">": (v) => ({ gt: v }),
    ">=": (v) => ({ gte: v }),
    "<": (v) => ({ lt: v }),
    "<=": (v) => ({ lte: v }),
    "=": (v) => v,
    "!=": (v) => ({ not: v }),
    in: (v) => ({ in: v }),
    not_in: (v) => ({ notIn: v }),
  };
  const mapper = ops[op];
  if (!mapper) return null;
  return { [field]: mapper(value) };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 4  Seed starter segments (idempotent)
// ─────────────────────────────────────────────────────────────────────────────
async function seedStarterSegments() {
  console.log("[agg] Ensuring starter segments exist…");
  const starters = [
    {
      key: "power_user",
      name: "Power Users",
      description: "High engagement, active in the last 7 days",
      rule: {
        and: [
          { field: "engagementScore", op: ">=", value: 70 },
          {
            field: "lastActiveAt",
            op: ">",
            value: new Date(Date.now() - 7 * 86_400_000).toISOString(),
          },
        ],
      },
    },
    {
      key: "job_seeker",
      name: "Active Job Seekers",
      description: "Applied to 3+ jobs in the last 30 days",
      rule: {
        and: [{ field: "jobsAppliedCount", op: ">=", value: 3 }],
      },
    },
    {
      key: "hirer_active",
      name: "Active Hirers",
      description: "Booked 1+ jobs in the last 30 days",
      rule: {
        and: [{ field: "bookingsAsHirer", op: ">=", value: 1 }],
      },
    },
    {
      key: "new_user",
      name: "New Users",
      description: "Signed up within the last 7 days",
      rule: {
        and: [{ field: "totalSessions", op: "<=", value: 3 }],
      },
    },
    {
      key: "churn_risk",
      name: "Churn Risk",
      description: "Was active but hasn't been seen in 30+ days",
      rule: {
        and: [
          { field: "totalSessions", op: ">", value: 2 },
          {
            field: "lastActiveAt",
            op: "<",
            value: new Date(Date.now() - 30 * 86_400_000).toISOString(),
          },
        ],
      },
    },
  ];

  for (const s of starters) {
    await prisma.userSegment.upsert({
      where: { key: s.key },
      update: { name: s.name, description: s.description, rule: s.rule },
      create: s,
    });
  }
  console.log(`[agg] ${starters.length} starter segments ensured`);
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5  Retention cleanup
// ─────────────────────────────────────────────────────────────────────────────
async function cleanupOldEvents() {
  console.log(
    "[agg] Cleaning up events older than",
    EVENT_RETENTION_DAYS,
    "days…",
  );
  const cutoff = new Date(Date.now() - EVENT_RETENTION_DAYS * 86_400_000);

  const [events, pageViews, interactions] = await Promise.all([
    prisma.userEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.pageView.deleteMany({ where: { enteredAt: { lt: cutoff } } }),
    prisma.interactionEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    }),
  ]);

  console.log(
    `[agg] Deleted ${events.count} events, ${pageViews.count} page views, ${interactions.count} interactions`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────
async function run() {
  const startedAt = Date.now();
  console.log("");
  console.log("═══════════════════════════════════════════");
  console.log("  Analytics Aggregation Job");
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════════");

  try {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000)
      .toISOString()
      .slice(0, 10);

    await rollupFeatureUsage(yesterday);
    await rollupFeatureUsage(today);
    await seedStarterSegments();
    await refreshUserInsights();
    await evaluateSegments();
    await cleanupOldEvents();

    console.log("");
    console.log("✅ Aggregation complete in", Date.now() - startedAt, "ms");
  } catch (err) {
    console.error("❌ Aggregation failed:", err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

run();
