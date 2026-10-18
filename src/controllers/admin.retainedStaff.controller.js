// src/controllers/admin.retainedStaff.controller.js
// ─────────────────────────────────────────────────────────────────────────────
// Admin control for Retained Staff (HR / Payroll module).
//
// Exposes:
//   • Global list & detail of all retained staff across all hirers
//   • Pause / End actions
//   • Global list of payroll cycles
//   • Manual trigger for the cycle-generation cron
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../config/database.js";
import { logAdminAction } from "../utils/auditLog.js";
import { paginate, paginationMeta } from "../utils/helpers.js";
import { runRetainedCycleGeneration } from "../services/retainedStaffCycle.service.js";
import { pauseMember, endMember } from "../services/retainedStaff.service.js";

const ok = (res, data, status = 200) =>
  res.status(status).json({ success: true, data });
const fail = (res, status, message) =>
  res.status(status).json({ success: false, message });

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    if (err.statusCode) return fail(res, err.statusCode, err.message);
    console.error("[admin.retainedStaff]", err);
    next(err);
  }
};

const ctxOf = (req) => ({
  req,
  ipAddress:
    req.headers["x-real-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null,
  userAgent: req.headers["user-agent"]?.slice(0, 255) || null,
});

// ─────────────────────────────────────────────────────────────────────────────
// ═══ RETAINED STAFF (Members) ═══════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/retained-staff
 * Global list of all retained staff across all hirers.
 */
export const adminListRetainedStaff = wrap(async (req, res) => {
  const { status, search, hirerId, workerId, department } = req.query;
  const { skip, take, page, limit } = paginate(req.query.page, req.query.limit);

  const where = {};
  if (status) where.status = status;
  if (hirerId) where.hirerId = hirerId;
  if (workerId) where.workerId = workerId;
  if (department) where.department = department;
  if (search) {
    where.OR = [
      { jobTitle: { contains: search, mode: "insensitive" } },
      { hirer: { firstName: { contains: search, mode: "insensitive" } } },
      { hirer: { lastName: { contains: search, mode: "insensitive" } } },
      { hirer: { email: { contains: search, mode: "insensitive" } } },
      { worker: { firstName: { contains: search, mode: "insensitive" } } },
      { worker: { lastName: { contains: search, mode: "insensitive" } } },
      { worker: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [items, total, statusAgg] = await Promise.all([
    prisma.retainedStaffMember.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        hirer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
          },
        },
        worker: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
          },
        },
      },
    }),
    prisma.retainedStaffMember.count({ where }),
    prisma.retainedStaffMember.groupBy({
      by: ["status"],
      _count: true,
    }),
  ]);

  return ok(res, {
    staff: items,
    meta: {
      ...paginationMeta(total, page, limit),
      statusCounts: Object.fromEntries(
        statusAgg.map((s) => [s.status, s._count]),
      ),
    },
  });
});

/**
 * GET /api/admin/retained-staff/stats
 * Dashboard metrics for retained staff.
 */
export const adminRetainedStats = wrap(async (req, res) => {
  const [statusAgg, cycleStatusAgg, cycleVolume] = await Promise.all([
    prisma.retainedStaffMember.groupBy({
      by: ["status"],
      _count: true,
    }),
    prisma.retainedPayrollCycle.groupBy({
      by: ["status"],
      _count: true,
      _sum: { netAmount: true },
    }),
    prisma.retainedPayrollCycle.aggregate({
      where: { status: "RELEASED" },
      _sum: { netAmount: true },
    }),
  ]);

  return ok(res, {
    stats: {
      staff: Object.fromEntries(statusAgg.map((s) => [s.status, s._count])),
      cycles: cycleStatusAgg.map((c) => ({
        status: c.status,
        count: c._count,
        sumNet: c._sum.netAmount || 0,
      })),
      lifetimeReleased: cycleVolume._sum.netAmount || 0,
    },
  });
});

/**
 * GET /api/admin/retained-staff/:memberId
 */
export const adminGetRetainedStaff = wrap(async (req, res) => {
  const { memberId } = req.params;

  const member = await prisma.retainedStaffMember.findUnique({
    where: { id: memberId },
    include: {
      hirer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatar: true,
        },
      },
      worker: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatar: true,
          isBanned: true,
          isActive: true,
        },
      },
      _count: { select: { cycles: true } },
    },
  });

  if (!member) throw httpError(404, "Retained staff member not found");

  // Last 10 cycles
  const cycles = await prisma.retainedPayrollCycle.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      booking: { select: { id: true, status: true } },
    },
  });

  return ok(res, { member, recentCycles: cycles });
});

/**
 * PATCH /api/admin/retained-staff/:memberId/pause
 */
export const adminPauseRetained = wrap(async (req, res) => {
  const { memberId } = req.params;
  const reason = req.body?.reason || "Paused by admin";

  // We temporarily override the hirerId to fetch the member inside the service
  const member = await prisma.retainedStaffMember.findUnique({
    where: { id: memberId },
    select: { hirerId: true },
  });
  if (!member) throw httpError(404, "Retained staff member not found");

  const result = await pauseMember(
    memberId,
    member.hirerId,
    reason,
    ctxOf(req),
  );

  await logAdminAction({
    req: req,
    adminId: req.user.id,
    action: "RETAINED_STAFF_PAUSED",
    targetType: "RETAINED_STAFF_MEMBER",
    targetId: memberId,
    description: `Admin forced pause. Reason: ${reason}`,
  });

  return ok(res, { member: result });
});

/**
 * PATCH /api/admin/retained-staff/:memberId/end
 */
export const adminEndRetained = wrap(async (req, res) => {
  const { memberId } = req.params;
  const reason = req.body?.reason || "Ended by admin";

  const member = await prisma.retainedStaffMember.findUnique({
    where: { id: memberId },
    select: { hirerId: true },
  });
  if (!member) throw httpError(404, "Retained staff member not found");

  const result = await endMember(memberId, member.hirerId, {
    reason,
    ctx: ctxOf(req),
  });

  await logAdminAction({
    req: req,
    adminId: req.user.id,
    action: "RETAINED_STAFF_ENDED",
    targetType: "RETAINED_STAFF_MEMBER",
    targetId: memberId,
    description: `Admin forced end. Reason: ${reason}`,
  });

  return ok(res, { member: result });
});

// ─────────────────────────────────────────────────────────────────────────────
// ═══ RETAINED CYCLES (Ledger) ═══════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/retained-cycles
 * Global ledger of all retained payroll cycles.
 */
export const adminListRetainedCycles = wrap(async (req, res) => {
  const { status, hirerId, workerId, fromDate, toDate } = req.query;
  const { skip, take, page, limit } = paginate(req.query.page, req.query.limit);

  const where = {};
  if (status) where.status = status;
  if (hirerId) where.hirerId = hirerId;
  if (workerId) where.workerId = workerId;
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
      orderBy: { createdAt: "desc" },
      include: {
        member: {
          select: {
            jobTitle: true,
            hirer: { select: { id: true, firstName: true, lastName: true } },
            worker: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        booking: {
          select: { id: true, status: true },
        },
      },
    }),
    prisma.retainedPayrollCycle.count({ where }),
  ]);

  return ok(res, {
    cycles: items,
    meta: paginationMeta(total, page, limit),
  });
});

/**
 * GET /api/admin/retained-cycles/:cycleId
 */
export const adminGetRetainedCycle = wrap(async (req, res) => {
  const { cycleId } = req.params;

  const cycle = await prisma.retainedPayrollCycle.findUnique({
    where: { id: cycleId },
    include: {
      member: {
        include: {
          hirer: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          worker: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      },
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
    },
  });

  if (!cycle) throw httpError(404, "Payroll cycle not found");

  return ok(res, { cycle });
});

/**
 * POST /api/admin/retained-cycles/run-cron
 * Manually trigger the cycle generation logic.
 */
export const adminTriggerRetainedCron = wrap(async (req, res) => {
  const result = await runRetainedCycleGeneration({
    trigger: "ADMIN_MANUAL",
    actorId: req.user.id,
  });

  await logAdminAction({
    req: req,
    adminId: req.user.id,
    action: "RETAINED_CYCLE_CRON_GENERATED",
    targetType: "SYSTEM",
    targetId: null,
    description: `Admin manually triggered retained cron (created: ${result.created})`,
    meta: result,
  });

  return ok(res, { result });
});

// Internal
function httpError(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}
