// src/controllers/retainedStaff.controller.js
// ─────────────────────────────────────────────────────────────────────────────
// Retained Staff — hirer + worker HTTP layer.
// Delegates all business logic to retainedStaff*.service.js
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../config/database.js";
import {
  addMember,
  updateMember,
  pauseMember,
  resumeMember,
  endMember,
  deleteMember,
} from "../services/retainedStaff.service.js";
import {
  createManualCycle,
  payCycle,
  releaseCycleFunds,
  cancelCycle,
  deleteCycle, // ✅ Added import
} from "../services/retainedStaffCycle.service.js";
import {
  uploadDocument,
  listDocuments,
  updateDocument,
  deleteDocument,
} from "../services/retainedStaffDocument.service.js";
import { paginate, paginationMeta } from "../utils/helpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// Local helpers
// ─────────────────────────────────────────────────────────────────────────────
const ok = (res, data, status = 200) =>
  res.status(status).json({ success: true, data });
const fail = (res, status, message, extra = {}) =>
  res.status(status).json({ success: false, message, ...extra });

function httpError(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}

const ctxOf = (req) => ({
  ipAddress:
    req.headers["x-real-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null,
  userAgent: req.headers["user-agent"]?.slice(0, 255) || null,
  req,
});

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    if (err.statusCode) return fail(res, err.statusCode, err.message);
    console.error("[retainedStaff]", err);
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ═══ HIRER — STAFF MANAGEMENT ═══════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/retained-staff
 * List current hirer's staff with filters + rollups.
 */
export const listStaff = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const { status, search, department } = req.query;
  const { skip, take, page, limit } = paginate(req.query.page, req.query.limit);

  const where = { hirerId };
  if (status) where.status = status;
  if (department) where.department = department;
  if (search) {
    where.OR = [
      { jobTitle: { contains: search, mode: "insensitive" } },
      { worker: { firstName: { contains: search, mode: "insensitive" } } },
      { worker: { lastName: { contains: search, mode: "insensitive" } } },
      { worker: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [items, total, counts] = await Promise.all([
    prisma.retainedStaffMember.findMany({
      where,
      skip,
      take,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        worker: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
            phone: true,
          },
        },
      },
    }),
    prisma.retainedStaffMember.count({ where }),
    prisma.retainedStaffMember.groupBy({
      by: ["status"],
      where: { hirerId },
      _count: true,
    }),
  ]);

  // Compute monthly burn (sum of ACTIVE payRates normalized to month, only same-currency per group)
  const activeStaff = await prisma.retainedStaffMember.findMany({
    where: { hirerId, status: "ACTIVE" },
    select: { payRate: true, currency: true, payFrequency: true },
  });
  const monthlyBurnByCurrency = {};
  const freqToMonthly = {
    WEEKLY: 4.33,
    BIWEEKLY: 2.17,
    SEMI_MONTHLY: 2,
    MONTHLY: 1,
    QUARTERLY: 1 / 3,
    ON_DEMAND: 0,
  };
  for (const m of activeStaff) {
    const factor = freqToMonthly[m.payFrequency] ?? 1;
    monthlyBurnByCurrency[m.currency] =
      (monthlyBurnByCurrency[m.currency] || 0) + m.payRate * factor;
  }

  const statusCounts = Object.fromEntries(
    counts.map((c) => [c.status, c._count]),
  );

  return ok(res, {
    staff: items,
    meta: {
      ...paginationMeta(total, page, limit),
      statusCounts,
      monthlyBurnByCurrency,
    },
  });
});

/**
 * POST /api/retained-staff
 * Add a worker to retained staff.
 */
export const addStaff = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const member = await addMember({ ...req.body, hirerId }, ctxOf(req));
  return ok(res, { member }, 201);
});

/**
 * GET /api/retained-staff/:memberId
 */
export const getStaff = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const { memberId } = req.params;

  const member = await prisma.retainedStaffMember.findFirst({
    where: { id: memberId, hirerId },
    include: {
      worker: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatar: true,
          phone: true,
          country: true,
          city: true,
          role: true,
          isEmailVerified: true,
          isPhoneVerified: true,
          workerProfile: {
            select: {
              id: true,
              title: true,
              description: true,
              hourlyRate: true,
              currency: true,
              verificationStatus: true,
              avgRating: true,
              totalReviews: true,
              completedJobs: true,
              yearsExperience: true,
              totalEarnings: true,
            },
          },
        },
      },
      documents: { orderBy: { createdAt: "desc" }, take: 20 },
      staffNotes: { orderBy: { createdAt: "desc" }, take: 20 },
      revisions: { orderBy: { createdAt: "desc" }, take: 10 },
      _count: { select: { cycles: true } },
    },
  });

  if (!member) throw httpError(404, "Retained staff member not found");

  // Recent cycles
  const cycles = await prisma.retainedPayrollCycle.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      booking: {
        select: {
          id: true,
          status: true,
          source: true,
        },
      },
    },
  });

  return ok(res, { member, recentCycles: cycles });
});

/**
 * PATCH /api/retained-staff/:memberId
 */
export const updateStaff = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const { memberId } = req.params;

  // Run the service update logic
  await updateMember(memberId, hirerId, req.body, ctxOf(req));

  // Re-fetch the member with full relations
  const updatedMember = await prisma.retainedStaffMember.findFirst({
    where: { id: memberId, hirerId },
    include: {
      worker: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatar: true,
          phone: true,
          country: true,
          city: true,
          role: true,
          isEmailVerified: true,
          isPhoneVerified: true,
          workerProfile: {
            select: {
              id: true,
              title: true,
              description: true,
              hourlyRate: true,
              currency: true,
              verificationStatus: true,
              avgRating: true,
              totalReviews: true,
              completedJobs: true,
              yearsExperience: true,
              totalEarnings: true,
            },
          },
        },
      },
      documents: { orderBy: { createdAt: "desc" }, take: 20 },
      staffNotes: { orderBy: { createdAt: "desc" }, take: 20 },
      revisions: { orderBy: { createdAt: "desc" }, take: 10 },
      _count: { select: { cycles: true } },
    },
  });

  if (!updatedMember) throw httpError(404, "Member not found after update");

  return ok(res, { member: updatedMember });
});

/**
 * PATCH /api/retained-staff/:memberId/pause
 */
export const pauseStaff = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const member = await pauseMember(
    req.params.memberId,
    hirerId,
    req.body?.reason,
    ctxOf(req),
  );
  return ok(res, { member });
});

/**
 * PATCH /api/retained-staff/:memberId/resume
 */
export const resumeStaff = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const member = await resumeMember(req.params.memberId, hirerId, ctxOf(req));
  return ok(res, { member });
});

/**
 * PATCH /api/retained-staff/:memberId/end
 */
export const endStaff = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const member = await endMember(req.params.memberId, hirerId, {
    reason: req.body?.reason,
    finalCycle: req.body?.finalCycle,
    finalAmount: req.body?.finalAmount,
    ctx: ctxOf(req),
  });
  return ok(res, { member });
});

/**
 * DELETE /api/retained-staff/:memberId
 */
export const deleteStaff = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const result = await deleteMember(req.params.memberId, hirerId, ctxOf(req));
  return ok(res, result);
});

/**
 * GET /api/retained-staff/:memberId/revisions
 */
export const listRevisions = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const { memberId } = req.params;
  const { skip, take, page, limit } = paginate(req.query.page, req.query.limit);

  const member = await prisma.retainedStaffMember.findFirst({
    where: { id: memberId, hirerId },
  });
  if (!member) throw httpError(404, "Retained staff member not found");

  const [items, total] = await Promise.all([
    prisma.retainedStaffRevision.findMany({
      where: { memberId },
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        changedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.retainedStaffRevision.count({ where: { memberId } }),
  ]);

  return ok(res, {
    revisions: items,
    meta: paginationMeta(total, page, limit),
  });
});

/**
 * GET /api/retained-staff/:memberId/summary
 */
export const getStaffSummary = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const { memberId } = req.params;

  const member = await prisma.retainedStaffMember.findFirst({
    where: { id: memberId, hirerId },
  });
  if (!member) throw httpError(404, "Retained staff member not found");

  const [cycleAgg, statusAgg] = await Promise.all([
    prisma.retainedPayrollCycle.aggregate({
      where: { memberId },
      _sum: { netAmount: true },
    }),
    prisma.retainedPayrollCycle.groupBy({
      by: ["status"],
      where: { memberId },
      _count: true,
      _sum: { netAmount: true },
    }),
  ]);

  return ok(res, {
    summary: {
      totalPaidLifetime: member.totalPaidLifetime,
      totalHeld: member.totalHeld,
      cyclesCount: member.cyclesCount,
      lastPaidAt: member.lastPaidAt,
      nextCycleAt: member.nextCycleAt,
      lifetimeCycleSum: cycleAgg._sum.netAmount || 0,
      byStatus: statusAgg,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ═══ HIRER — DOCUMENTS ══════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/retained-staff/:memberId/documents
 */
export const uploadStaffDocument = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const doc = await uploadDocument(
    req.params.memberId,
    hirerId,
    req.body,
    ctxOf(req),
  );
  return ok(res, { document: doc }, 201);
});

/**
 * GET /api/retained-staff/:memberId/documents
 */
export const listStaffDocuments = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const docs = await listDocuments(req.params.memberId, hirerId);
  return ok(res, { documents: docs });
});

/**
 * PATCH /api/retained-staff/:memberId/documents/:docId
 */
export const updateStaffDocument = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const doc = await updateDocument(
    req.params.memberId,
    hirerId,
    req.params.docId,
    req.body,
    ctxOf(req),
  );
  return ok(res, { document: doc });
});

/**
 * DELETE /api/retained-staff/:memberId/documents/:docId
 */
export const deleteStaffDocument = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const result = await deleteDocument(
    req.params.memberId,
    hirerId,
    req.params.docId,
    ctxOf(req),
  );
  return ok(res, result);
});

// ─────────────────────────────────────────────────────────────────────────────
// ═══ HIRER — NOTES ══════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/retained-staff/:memberId/notes
 */
export const addStaffNote = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const { memberId } = req.params;
  const { title, body, category = "GENERAL", isPrivate = true } = req.body;

  if (!title || !body) throw httpError(400, "title and body are required");

  const member = await prisma.retainedStaffMember.findFirst({
    where: { id: memberId, hirerId },
  });
  if (!member) throw httpError(404, "Retained staff member not found");

  const note = await prisma.retainedStaffNote.create({
    data: {
      memberId,
      authorId: hirerId,
      title,
      body,
      category,
      isPrivate,
    },
  });

  return ok(res, { note }, 201);
});

/**
 * GET /api/retained-staff/:memberId/notes
 */
export const listStaffNotes = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const { memberId } = req.params;
  const { skip, take, page, limit } = paginate(req.query.page, req.query.limit);

  const member = await prisma.retainedStaffMember.findFirst({
    where: { id: memberId, hirerId },
  });
  if (!member) throw httpError(404, "Retained staff member not found");

  const [items, total] = await Promise.all([
    prisma.retainedStaffNote.findMany({
      where: { memberId },
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.retainedStaffNote.count({ where: { memberId } }),
  ]);

  return ok(res, { notes: items, meta: paginationMeta(total, page, limit) });
});

/**
 * DELETE /api/retained-staff/:memberId/notes/:noteId
 */
export const deleteStaffNote = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const { memberId, noteId } = req.params;

  const member = await prisma.retainedStaffMember.findFirst({
    where: { id: memberId, hirerId },
  });
  if (!member) throw httpError(404, "Retained staff member not found");

  const note = await prisma.retainedStaffNote.findFirst({
    where: { id: noteId, memberId },
  });
  if (!note) throw httpError(404, "Note not found");

  await prisma.retainedStaffNote.delete({ where: { id: noteId } });
  return ok(res, { deleted: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// ═══ HIRER — CYCLES ═════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/retained-staff/:memberId/cycles
 */
export const listCycles = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const { memberId } = req.params;
  const { status } = req.query;
  const { skip, take, page, limit } = paginate(req.query.page, req.query.limit);

  const member = await prisma.retainedStaffMember.findFirst({
    where: { id: memberId, hirerId },
  });
  if (!member) throw httpError(404, "Retained staff member not found");

  const where = { memberId };
  if (status) where.status = status;

  const [items, total] = await Promise.all([
    prisma.retainedPayrollCycle.findMany({
      where,
      skip,
      take,
      orderBy: { payDate: "desc" },
      include: {
        booking: {
          select: {
            id: true,
            status: true,
            source: true,
            payments: {
              select: {
                id: true,
                status: true,
                amount: true,
                releasedAmount: true,
                workerPayout: true,
                currency: true,
                releaseCount: true,
              },
            },
          },
        },
      },
    }),
    prisma.retainedPayrollCycle.count({ where }),
  ]);

  return ok(res, { cycles: items, meta: paginationMeta(total, page, limit) });
});

/**
 * POST /api/retained-staff/:memberId/cycles  (manual / bonus / off-cycle)
 */
export const createCycle = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const cycle = await createManualCycle(
    req.params.memberId,
    hirerId,
    req.body,
    ctxOf(req),
  );
  return ok(res, { cycle }, 201);
});

/**
 * GET /api/retained-staff/:memberId/cycles/:cycleId
 */
export const getCycle = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const { memberId, cycleId } = req.params;

  const cycle = await prisma.retainedPayrollCycle.findFirst({
    where: { id: cycleId, memberId, hirerId },
    include: {
      booking: {
        include: {
          payments: {
            include: { releases: { orderBy: { createdAt: "desc" } } },
            orderBy: { createdAt: "desc" },
          },
        },
      },
      refunds: true,
      disputes: true,
      member: {
        select: {
          id: true,
          jobTitle: true,
          currency: true,
          payFrequency: true,
          worker: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
        },
      },
    },
  });

  if (!cycle) throw httpError(404, "Cycle not found");
  return ok(res, { cycle });
});

/**
 * POST /api/retained-staff/:memberId/cycles/:cycleId/pay
 */
export const payCycleHandler = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const { cycleId } = req.params;
  const result = await payCycle(cycleId, hirerId, req.body || {}, ctxOf(req));
  return ok(res, result, 201);
});

/**
 * POST /api/retained-staff/cycles/:cycleId/release
 * Staged release — reuses existing escrow release service.
 */
export const releaseCycle = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const { cycleId } = req.params;
  const { amount, note } = req.body;

  if (!amount || isNaN(parseFloat(amount)))
    throw httpError(400, "amount is required and must be a number");

  const result = await releaseCycleFunds(
    cycleId,
    hirerId,
    parseFloat(amount),
    note || null,
    ctxOf(req),
  );
  return ok(res, result);
});

/**
 * POST /api/retained-staff/cycles/:cycleId/cancel
 */
export const cancelCycleHandler = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const result = await cancelCycle(
    req.params.cycleId,
    hirerId,
    req.body?.reason,
    ctxOf(req),
  );
  return ok(res, result);
});

/**
 * DELETE /api/retained-staff/cycles/:cycleId
 */
export const deleteCycleHandler = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const result = await deleteCycle(req.params.cycleId, hirerId, ctxOf(req));
  return ok(res, result);
});

/**
 * GET /api/retained-staff/cycles  (cross-staff ledger for this hirer)
 */
export const listAllCycles = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const { status, memberId, fromDate, toDate } = req.query;
  const { skip, take, page, limit } = paginate(req.query.page, req.query.limit);

  const where = { hirerId };
  if (status) where.status = status;
  if (memberId) where.memberId = memberId;
  if (fromDate || toDate) {
    where.payDate = {};
    if (fromDate) where.payDate.gte = new Date(fromDate);
    if (toDate) where.payDate.lte = new Date(toDate);
  }

  const [items, total] = await Promise.all([
    prisma.retainedPayrollCycle.findMany({
      where,
      skip,
      take,
      orderBy: { payDate: "desc" },
      include: {
        member: {
          select: {
            id: true,
            jobTitle: true,
            worker: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
        },
      },
    }),
    prisma.retainedPayrollCycle.count({ where }),
  ]);

  return ok(res, { cycles: items, meta: paginationMeta(total, page, limit) });
});

// src/controllers/retainedStaff.controller.js
// ... (keep all your imports and other functions above) ...

// ─────────────────────────────────────────────────────────────────────────────
// ═══ HIRER DASHBOARD ════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────
export const getHirerDashboard = wrap(async (req, res) => {
  const hirerId = req.user.id;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    statusCounts,
    activeMembers,
    cyclesDue,
    heldInEscrow,
    releasedThisMonth,
    upcomingCycles,
  ] = await Promise.all([
    prisma.retainedStaffMember.groupBy({
      by: ["status"],
      where: { hirerId },
      _count: true,
    }),
    prisma.retainedStaffMember.findMany({
      where: { hirerId, status: "ACTIVE" },
      select: {
        payRate: true,
        currency: true,
        payFrequency: true,
        nextCycleAt: true,
        jobTitle: true,
        worker: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.retainedPayrollCycle.count({
      where: { hirerId, status: "AWAITING_PAYMENT" },
    }),
    prisma.retainedPayrollCycle.groupBy({
      by: ["currency"],
      where: { hirerId, status: { in: ["HELD", "PARTIALLY_RELEASED"] } },
      _sum: { netAmount: true },
    }),
    prisma.retainedPayrollCycle.groupBy({
      by: ["currency"],
      where: {
        hirerId,
        status: "RELEASED",
        releasedAt: { gte: monthStart },
      },
      _sum: { netAmount: true },
    }),
    prisma.retainedStaffMember.findMany({
      where: { hirerId, status: "ACTIVE", nextCycleAt: { not: null } },
      orderBy: { nextCycleAt: "asc" },
      take: 5,
      select: {
        id: true,
        jobTitle: true,
        payRate: true,
        currency: true,
        nextCycleAt: true,
        worker: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  const monthlyBurn = {};
  const freqFactor = {
    WEEKLY: 4.33,
    BIWEEKLY: 2.17,
    SEMI_MONTHLY: 2,
    MONTHLY: 1,
    QUARTERLY: 1 / 3,
    ON_DEMAND: 0,
  };
  for (const m of activeMembers) {
    const f = freqFactor[m.payFrequency] ?? 1;
    monthlyBurn[m.currency] = (monthlyBurn[m.currency] || 0) + m.payRate * f;
  }

  const heldMap = {};
  heldInEscrow.forEach((h) => {
    heldMap[h.currency] = h._sum.netAmount || 0;
  });

  const releasedMap = {};
  releasedThisMonth.forEach((r) => {
    releasedMap[r.currency] = r._sum.netAmount || 0;
  });

  // ✅ Get all unique currencies currently in play
  const activeCurrencies = new Set([
    ...Object.keys(monthlyBurn),
    ...Object.keys(heldMap),
    ...Object.keys(releasedMap),
    ...upcomingCycles.map((c) => c.currency),
  ]);

  // Default to NGN if no currencies are found
  if (activeCurrencies.size === 0) activeCurrencies.add("NGN");

  return ok(res, {
    dashboard: {
      staffCount: Object.fromEntries(
        statusCounts.map((s) => [s.status, s._count]),
      ),
      activeCount: statusCounts.find((s) => s.status === "ACTIVE")?._count || 0,
      activeCurrencies: Array.from(activeCurrencies),
      monthlyBurnByCurrency: monthlyBurn,
      heldInEscrowByCurrency: heldMap,
      releasedThisMonthByCurrency: releasedMap,
      pendingPayments: cyclesDue,
      upcomingCycles: upcomingCycles.map((c) => ({
        memberId: c.id,
        jobTitle: c.jobTitle,
        workerName: `${c.worker.firstName} ${c.worker.lastName}`,
        amount: c.payRate,
        currency: c.currency,
        nextCycleAt: c.nextCycleAt,
      })),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ═══ WORKER — EMPLOYMENT VIEW ═══════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/retained-staff/me/employers
 */
export const listMyEmployers = wrap(async (req, res) => {
  const workerId = req.user.id;
  const { status } = req.query;

  const where = { workerId };
  if (status) where.status = status;

  const members = await prisma.retainedStaffMember.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      hirer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
          email: true,
        },
      },
    },
  });

  // Lifetime earned + pending release per member
  const enriched = await Promise.all(
    members.map(async (m) => {
      const agg = await prisma.retainedPayrollCycle.groupBy({
        by: ["status"],
        where: { memberId: m.id },
        _sum: { netAmount: true },
        _count: true,
      });
      const lifetime =
        agg.find((a) => a.status === "RELEASED")?._sum.netAmount || 0;
      const pending =
        (agg.find((a) => a.status === "HELD")?._sum.netAmount || 0) +
        (agg.find((a) => a.status === "PARTIALLY_RELEASED")?._sum.netAmount ||
          0);
      const totalCycles = agg.reduce((s, a) => s + a._count, 0);

      return {
        ...m,
        lifetimeEarned: lifetime,
        pendingRelease: pending,
        totalCycles,
      };
    }),
  );

  return ok(res, { employers: enriched });
});

/**
 * GET /api/retained-staff/me/employers/:memberId
 */
export const getMyEmployment = wrap(async (req, res) => {
  const workerId = req.user.id;
  const { memberId } = req.params;

  const member = await prisma.retainedStaffMember.findFirst({
    where: { id: memberId, workerId },
    include: {
      hirer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
          email: true,
          phone: true,
        },
      },
      documents: { orderBy: { createdAt: "desc" } },
      staffNotes: {
        where: { isPrivate: false },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!member) throw httpError(404, "Employment record not found");

  return ok(res, { member });
});

/**
 * GET /api/retained-staff/me/cycles
 */
export const listMyCycles = wrap(async (req, res) => {
  const workerId = req.user.id;
  const { status, memberId } = req.query;
  const { skip, take, page, limit } = paginate(req.query.page, req.query.limit);

  const where = { workerId };
  if (status) where.status = status;
  if (memberId) where.memberId = memberId;

  const [items, total] = await Promise.all([
    prisma.retainedPayrollCycle.findMany({
      where,
      skip,
      take,
      orderBy: { payDate: "desc" },
      include: {
        member: {
          select: {
            jobTitle: true,
            hirer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
        },
      },
    }),
    prisma.retainedPayrollCycle.count({ where }),
  ]);

  return ok(res, { cycles: items, meta: paginationMeta(total, page, limit) });
});

/**
 * GET /api/retained-staff/me/earnings
 */
export const getMyRetainedEarnings = wrap(async (req, res) => {
  const workerId = req.user.id;

  const agg = await prisma.retainedPayrollCycle.groupBy({
    by: ["status"],
    where: { workerId },
    _sum: { netAmount: true, workerPayout: true },
    _count: true,
  });

  // Per-employer breakdown
  const members = await prisma.retainedStaffMember.findMany({
    where: { workerId },
    include: {
      hirer: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
    },
  });

  const byEmployer = await Promise.all(
    members.map(async (m) => {
      const sums = await prisma.retainedPayrollCycle.groupBy({
        by: ["status"],
        where: { memberId: m.id },
        _sum: { netAmount: true },
        _count: true,
      });
      return {
        memberId: m.id,
        hirer: m.hirer,
        jobTitle: m.jobTitle,
        status: m.status,
        currency: m.currency,
        byStatus: sums,
      };
    }),
  );

  const lifetime =
    agg.find((a) => a.status === "RELEASED")?._sum.netAmount || 0;
  const pending =
    (agg.find((a) => a.status === "HELD")?._sum.netAmount || 0) +
    (agg.find((a) => a.status === "PARTIALLY_RELEASED")?._sum.netAmount || 0);

  return ok(res, {
    earnings: {
      lifetime,
      pending,
      byStatus: agg,
      byEmployer,
    },
  });
});

/**
 * GET /api/retained-staff/lookup
 * Find a worker to add to payroll by email or name.
 */
export const lookupWorker = wrap(async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) {
    return ok(res, { workers: [] });
  }

  const workers = await prisma.user.findMany({
    where: {
      role: "WORKER",
      isActive: true,
      isBanned: false,
      OR: [
        { email: { equals: q, mode: "insensitive" } },
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 8,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      avatar: true,
      city: true,
      workerProfile: {
        select: { title: true },
      },
    },
  });

  return ok(res, { workers });
});
