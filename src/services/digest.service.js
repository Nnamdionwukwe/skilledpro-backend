// src/services/digest.service.js
// ─────────────────────────────────────────────────────────────────────────────
// Builds the daily-digest payload. Pure data layer — no email rendering here.
// Called by:
//   • scripts/daily-digest.js         (cron, sends automatically)
//   • adminAnalytics.controller.js    (via "Send test digest" button)
//
// Every query is wrapped in safeCount / safeAgg so a single broken model
// never kills the whole digest — matches your getAdminDashboard pattern.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../config/database.js";

// ── Safe wrappers ────────────────────────────────────────────────────────────
const safeCount = (p) => p.catch(() => 0);
const safeAgg = (p) => p.catch(() => ({ _sum: {}, _count: 0 }));
const safeRows = (p) => p.catch(() => []);

// ── Currency formatting ──────────────────────────────────────────────────────
const CURRENCY_SYMBOLS = {
  NGN: "₦",
  USD: "$",
  GBP: "£",
  EUR: "€",
  GHS: "₵",
  KES: "KSh",
  ZAR: "R",
  INR: "₹",
  CAD: "C$",
  AUD: "A$",
  JPY: "¥",
  CNY: "¥",
  USDC: "$",
  USDT: "$",
};

function fmtMoney(amount, currency) {
  const n = Number(amount) || 0;
  const sym = CURRENCY_SYMBOLS[currency] || `${currency} `;
  // No decimals for fiat whole numbers; show 2 for stablecoins
  const decimals = ["USDC", "USDT"].includes(currency) ? 2 : 0;
  return `${sym}${n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

// ── Day boundaries ───────────────────────────────────────────────────────────
function dayBounds(date = new Date()) {
  const end = new Date(date);
  end.setHours(0, 0, 0, 0); // today 00:00 (the digest covers the day that just ended)
  const start = new Date(end);
  start.setDate(start.getDate() - 1); // yesterday 00:00
  return { start, end };
}

function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY
// ─────────────────────────────────────────────────────────────────────────────
export async function buildDailyDigest() {
  const { start: yesterday, end: today } = dayBounds();
  const dayBefore = new Date(yesterday.getTime() - 86_400_000);
  const last7d = daysAgo(7);
  const last30d = daysAgo(30);

  // ── 1. Users ──────────────────────────────────────────────────────────────
  const [
    newUsersYesterday,
    newUsersDayBefore,
    totalUsers,
    newWorkers,
    newHirers,
  ] = await Promise.all([
    safeCount(
      prisma.user.count({
        where: { createdAt: { gte: yesterday, lt: today } },
      }),
    ),
    safeCount(
      prisma.user.count({
        where: { createdAt: { gte: dayBefore, lt: yesterday } },
      }),
    ),
    safeCount(prisma.user.count({ where: { isActive: true } })),
    safeCount(
      prisma.user.count({
        where: { role: "WORKER", createdAt: { gte: yesterday, lt: today } },
      }),
    ),
    safeCount(
      prisma.user.count({
        where: { role: "HIRER", createdAt: { gte: yesterday, lt: today } },
      }),
    ),
  ]);

  // ── 2. Sessions (analytics) ───────────────────────────────────────────────
  const [sessionsYesterday, pageViewsYesterday] = await Promise.all([
    safeCount(
      prisma.userSession.count({
        where: { startedAt: { gte: yesterday, lt: today } },
      }),
    ),
    safeCount(
      prisma.pageView.count({
        where: { enteredAt: { gte: yesterday, lt: today } },
      }),
    ),
  ]);

  // ── 3. Bookings ───────────────────────────────────────────────────────────
  const [
    bookingsCreatedYesterday,
    bookingsCreatedDayBefore,
    bookingsAwaitingAcceptance,
    bookingsInProgress,
    bookingsCompletedYesterday,
    totalBookings,
    totalCompletedBookings,
  ] = await Promise.all([
    safeCount(
      prisma.booking.count({
        where: { createdAt: { gte: yesterday, lt: today } },
      }),
    ),
    safeCount(
      prisma.booking.count({
        where: { createdAt: { gte: dayBefore, lt: yesterday } },
      }),
    ),
    safeCount(prisma.booking.count({ where: { status: "PENDING" } })),
    safeCount(prisma.booking.count({ where: { status: "IN_PROGRESS" } })),
    safeCount(
      prisma.booking.count({
        where: { completedAt: { gte: yesterday, lt: today } },
      }),
    ),
    safeCount(prisma.booking.count()),
    safeCount(prisma.booking.count({ where: { status: "COMPLETED" } })),
  ]);

  // ── 4. Revenue + escrow — GROUPED BY CURRENCY ────────────────────────────
  // Payments released yesterday (money that actually moved to workers)
  const releasedYesterday = await safeRows(
    prisma.payment.groupBy({
      by: ["currency", "status"],
      where: {
        status: "RELEASED",
        createdAt: { gte: yesterday, lt: today },
      },
      _sum: { amount: true, platformFee: true, workerPayout: true },
      _count: { _all: true },
    }),
  );

  // All-time released — for a "lifetime" line if you want it
  const releasedAllTime = await safeRows(
    prisma.payment.groupBy({
      by: ["currency"],
      where: { status: "RELEASED" },
      _sum: { amount: true, platformFee: true, workerPayout: true },
      _count: { _all: true },
    }),
  );

  // Escrow currently held (all-time, not windowed)
  const escrowHeld = await safeRows(
    prisma.payment.groupBy({
      by: ["currency"],
      where: { status: "HELD" },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  );

  // Refunds processed yesterday
  const refundsYesterday = await safeRows(
    prisma.refund.groupBy({
      by: ["currency", "status"],
      where: { createdAt: { gte: yesterday, lt: today } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  );

  // Shape into per-currency maps
  const revenueByCurrency = {}; // { NGN: { fees, gmv, payouts, count } }
  for (const row of releasedYesterday) {
    const c = row.currency || "NGN";
    if (!revenueByCurrency[c]) {
      revenueByCurrency[c] = { fees: 0, gmv: 0, payouts: 0, count: 0 };
    }
    revenueByCurrency[c].fees += row._sum?.platformFee || 0;
    revenueByCurrency[c].gmv += row._sum?.amount || 0;
    revenueByCurrency[c].payouts += row._sum?.workerPayout || 0;
    revenueByCurrency[c].count += row._count?._all || 0;
  }

  const lifetimeByCurrency = {};
  for (const row of releasedAllTime) {
    const c = row.currency || "NGN";
    lifetimeByCurrency[c] = {
      fees: row._sum?.platformFee || 0,
      gmv: row._sum?.amount || 0,
      payouts: row._sum?.workerPayout || 0,
      count: row._count?._all || 0,
    };
  }

  const escrowByCurrency = {}; // { NGN: { held, count } }
  for (const row of escrowHeld) {
    const c = row.currency || "NGN";
    escrowByCurrency[c] = {
      held: row._sum?.amount || 0,
      count: row._count?._all || 0,
    };
  }

  const refundsByCurrency = {}; // { NGN: { completed, pending, count, countPending } }
  for (const row of refundsYesterday) {
    const c = row.currency || "NGN";
    if (!refundsByCurrency[c]) {
      refundsByCurrency[c] = {
        completed: 0,
        pending: 0,
        count: 0,
        countPending: 0,
      };
    }
    const amt = row._sum?.amount || 0;
    const cnt = row._count?._all || 0;
    if (row.status === "COMPLETED") {
      refundsByCurrency[c].completed += amt;
      refundsByCurrency[c].count += cnt;
    } else if (
      row.status === "PENDING" ||
      row.status === "APPROVED" ||
      row.status === "PROCESSING"
    ) {
      refundsByCurrency[c].pending += amt;
      refundsByCurrency[c].countPending += cnt;
    }
  }

  // ── 5. Reviews ────────────────────────────────────────────────────────────
  const [reviewsYesterday, avgRatingYesterday] = await Promise.all([
    safeCount(
      prisma.review.count({
        where: { createdAt: { gte: yesterday, lt: today } },
      }),
    ),
    safeAgg(
      prisma.review.aggregate({
        where: { createdAt: { gte: yesterday, lt: today } },
        _avg: { rating: true },
      }),
    ),
  ]);

  // ── 6. Attention queues ───────────────────────────────────────────────────
  const [
    pendingVerifications,
    pendingWithdrawals,
    pendingWithdrawalsAgg,
    openDisputes,
    pendingReports,
    pendingRefunds,
    pendingCampaignSubmissions,
    outstandingDebts,
    outstandingDebtsAgg,
    pausedAccounts,
    deletionScheduled,
  ] = await Promise.all([
    safeCount(
      prisma.workerProfile.count({ where: { verificationStatus: "PENDING" } }),
    ),
    safeCount(prisma.withdrawal.count({ where: { status: "PENDING" } })),
    safeAgg(
      prisma.withdrawal.aggregate({
        where: { status: "PENDING" },
        _sum: { amount: true },
      }),
    ),
    safeCount(prisma.dispute.count({ where: { status: "PENDING_REVIEW" } })),
    safeCount(prisma.report.count({ where: { status: "PENDING" } })),
    safeCount(
      prisma.refund.count({
        where: { status: { in: ["PENDING", "APPROVED", "PROCESSING"] } },
      }),
    ),
    safeCount(
      prisma.campaignSubmission.count({ where: { status: "PENDING" } }),
    ),
    safeCount(prisma.workerDebt.count({ where: { status: "OUTSTANDING" } })),
    safeAgg(
      prisma.workerDebt.aggregate({
        where: { status: "OUTSTANDING" },
        _sum: { amount: true },
      }),
    ),
    safeCount(prisma.user.count({ where: { isPaused: true } })),
    safeCount(
      prisma.user.count({ where: { deletionScheduledAt: { not: null } } }),
    ),
  ]);

  // Stuck payments > 24h in PENDING — this is usually a manual verification backlog
  const stuckPayments = await safeCount(
    prisma.payment.count({
      where: {
        status: "PENDING",
        provider: { in: ["bank_transfer", "crypto"] },
        createdAt: { lt: daysAgo(1) },
      },
    }),
  );

  // ── 7. Category demand (last 7d) ─────────────────────────────────────────
  // Uses the same event names as your adminAnalytics category-demand report
  const demandEvents = await safeRows(
    prisma.userEvent.findMany({
      where: {
        eventName: {
          in: [
            "search.suggestion.clicked",
            "search.trending.category.clicked",
            "landing.category.clicked",
          ],
        },
        createdAt: { gte: last7d },
      },
      select: { eventProps: true, eventName: true },
    }),
  );

  // Tally demand per categoryId
  const demandByCategoryId = {};
  for (const e of demandEvents) {
    const props = e.eventProps || {};
    const catId = props.categoryId;
    if (!catId) continue;
    if (!demandByCategoryId[catId]) demandByCategoryId[catId] = 0;
    demandByCategoryId[catId] += 1;
  }

  // Fetch top categories with worker counts
  const topCategoryIds = Object.entries(demandByCategoryId)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => id);

  const topCategoryDetails = topCategoryIds.length
    ? await safeRows(
        prisma.category.findMany({
          where: { id: { in: topCategoryIds } },
          select: {
            id: true,
            name: true,
            icon: true,
            _count: { select: { workers: true } },
          },
        }),
      )
    : [];

  const topCategories = topCategoryDetails
    .map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      demand: demandByCategoryId[c.id] || 0,
      workers: c._count?.workers || 0,
    }))
    .sort((a, b) => b.demand - a.demand);

  // Supply gaps: demand ≥ 3 AND (workers === 0 OR demand/workers >= 3)
  const supplyGaps = topCategories
    .filter(
      (c) =>
        c.demand >= 3 &&
        (c.workers === 0 || c.demand / Math.max(c.workers, 1) >= 3),
    )
    .slice(0, 5);

  // ── 8. Churn risk ────────────────────────────────────────────────────────
  // Users with engagementScore > 0 who haven't been active in 30+ days
  const churnRisk = await safeCount(
    prisma.userProfileInsight.count({
      where: {
        lastActiveAt: { lt: last30d, not: null },
        engagementScore: { gte: 10 },
      },
    }),
  );

  // ── 9. Funnel health (last 7d) ───────────────────────────────────────────
  const [searchEvents7d, viewEvents7d, bookingEvents7d, paymentEvents7d] =
    await Promise.all([
      safeCount(
        prisma.userEvent.count({
          where: {
            eventName: { in: ["search.submitted", "search.use"] },
            createdAt: { gte: last7d },
          },
        }),
      ),
      safeCount(
        prisma.userEvent.count({
          where: {
            eventName: { in: ["worker.profile.viewed", "job.viewed"] },
            createdAt: { gte: last7d },
          },
        }),
      ),
      safeCount(
        prisma.userEvent.count({
          where: {
            eventName: "booking.created",
            createdAt: { gte: last7d },
          },
        }),
      ),
      safeCount(
        prisma.userEvent.count({
          where: {
            eventName: { in: ["payment.initiated", "payment.attempted"] },
            createdAt: { gte: last7d },
          },
        }),
      ),
    ]);

  const funnel = {
    searchToView:
      searchEvents7d > 0
        ? Math.round((viewEvents7d / searchEvents7d) * 100)
        : 0,
    viewToBook:
      viewEvents7d > 0 ? Math.round((bookingEvents7d / viewEvents7d) * 100) : 0,
    bookToPay:
      bookingEvents7d > 0
        ? Math.round((paymentEvents7d / bookingEvents7d) * 100)
        : 0,
    searchCount: searchEvents7d,
    viewCount: viewEvents7d,
    bookingCount: bookingEvents7d,
    paymentCount: paymentEvents7d,
  };

  // ── 10. Compare deltas ──────────────────────────────────────────────────
  const userDelta = newUsersYesterday - newUsersDayBefore;
  const bookingDelta = bookingsCreatedYesterday - bookingsCreatedDayBefore;

  // ── Assemble ─────────────────────────────────────────────────────────────
  return {
    generatedAt: new Date().toISOString(),
    windowLabel: yesterday.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),

    users: {
      newYesterday: newUsersYesterday,
      newDayBefore: newUsersDayBefore,
      delta: userDelta,
      newWorkers,
      newHirers,
      total: totalUsers,
    },

    sessions: {
      yesterday: sessionsYesterday,
      pageViews: pageViewsYesterday,
    },

    bookings: {
      newYesterday: bookingsCreatedYesterday,
      newDayBefore: bookingsCreatedDayBefore,
      delta: bookingDelta,
      awaitingAcceptance: bookingsAwaitingAcceptance,
      inProgress: bookingsInProgress,
      completedYesterday: bookingsCompletedYesterday,
      total: totalBookings,
      totalCompleted: totalCompletedBookings,
      completionRate:
        totalBookings > 0
          ? Math.round((totalCompletedBookings / totalBookings) * 100)
          : 0,
    },

    revenue: {
      byCurrency: revenueByCurrency, // { NGN: {...}, USD: {...} }
      lifetimeByCurrency: lifetimeByCurrency,
      escrowByCurrency: escrowByCurrency,
      refundsByCurrency: refundsByCurrency,
    },

    reviews: {
      count: reviewsYesterday,
      avgRating: Number((avgRatingYesterday?._avg?.rating || 0).toFixed(2)),
    },

    attention: {
      pendingVerifications,
      pendingWithdrawals,
      pendingWithdrawalsAmount: pendingWithdrawalsAgg?._sum?.amount || 0,
      openDisputes,
      pendingReports,
      pendingRefunds,
      pendingCampaignSubmissions,
      stuckPayments,
      outstandingDebts,
      outstandingDebtsAmount: outstandingDebtsAgg?._sum?.amount || 0,
      pausedAccounts,
      deletionScheduled,
      total:
        pendingVerifications +
        pendingWithdrawals +
        openDisputes +
        pendingReports +
        pendingRefunds +
        pendingCampaignSubmissions +
        stuckPayments,
    },

    categories: {
      top: topCategories,
      supplyGaps,
    },

    churnRisk,

    funnel,
  };
}

// ── Export the currency formatter so the template can reuse it ───────────────
export { fmtMoney };
