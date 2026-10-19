// src/services/retainedStaff.service.js
// ─────────────────────────────────────────────────────────────────────────────
// Retained Staff — core domain service
//
// Pure-ish business logic for RetainedStaffMember lifecycle:
//   • add / update / pause / resume / end / delete
//   • rate changes with revision trail
//   • next-cycle scheduling
//   • cycle amount computation
//   • rollup reconciliation
//
// Does NOT touch Payment / Booking directly. That's retainedStaffCycle.service.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../config/database.js";
import { logAdminAction } from "../utils/auditLog.js";
import { createNotification } from "./notification.service.js";
import { FEE_CONFIG } from "../config/fees.js"; // ✅ Import central fee config

const DAY_MS = 86_400_000;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the next cycle date for a given frequency starting from `from`.
 * Times are aligned to 09:00 Africa/Lagos (which for storage we treat as UTC
 * midnight of that day — the cron worker only cares about the date).
 */
export function nextCycleDate(frequency, from = new Date()) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);

  switch (frequency) {
    case "WEEKLY": {
      const day = d.getDay(); // 0=Sun..6=Sat
      const add = day === 1 ? 7 : (8 - day) % 7 || 7;
      return new Date(d.getTime() + add * DAY_MS);
    }
    case "BIWEEKLY": {
      const day = d.getDay();
      const add = day === 1 ? 14 : (8 - day) % 7 || 7;
      return new Date(d.getTime() + add * DAY_MS);
    }
    case "SEMI_MONTHLY": {
      const y = d.getFullYear();
      const m = d.getMonth();
      const day = d.getDate();
      if (day < 1) return new Date(y, m, 1);
      if (day < 15) return new Date(y, m, 15);
      return new Date(y, m + 1, 1);
    }
    case "MONTHLY": {
      return new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
    case "QUARTERLY": {
      const m = d.getMonth();
      const qStart = Math.floor(m / 3) * 3;
      return new Date(d.getFullYear(), qStart + 3, 1);
    }
    case "ON_DEMAND":
      return null;
    default:
      throw new Error(`Unknown payFrequency: ${frequency}`);
  }
}

/**
 * Given a cycle's start, return its end date (last day of period).
 */
export function endOfPeriod(frequency, start) {
  const s = new Date(start);
  switch (frequency) {
    case "WEEKLY":
      return new Date(s.getTime() + 6 * DAY_MS);
    case "BIWEEKLY":
      return new Date(s.getTime() + 13 * DAY_MS);
    case "SEMI_MONTHLY": {
      const day = s.getDate();
      if (day === 1) return new Date(s.getFullYear(), s.getMonth(), 14);
      return new Date(s.getFullYear(), s.getMonth() + 1, 0);
    }
    case "MONTHLY": {
      return new Date(s.getFullYear(), s.getMonth() + 1, 0);
    }
    case "QUARTERLY": {
      const endMonth = s.getMonth() + 3; // exclusive
      return new Date(s.getFullYear(), endMonth, 0);
    }
    case "ON_DEMAND":
      return new Date(s.getTime() + 30 * DAY_MS);
    default:
      throw new Error(`Unknown payFrequency: ${frequency}`);
  }
}

/**
 * Compute the money breakdown for a cycle.
 * Uses the central FEE_CONFIG to ensure platform fees stay in sync.
 */
export function computeCycleAmounts(member, overrides = {}) {
  const {
    baseAmount = member.payRate,
    bonusAmount = 0,
    deductionAmount = 0,
    platformFee: explicitFee,
  } = overrides;

  const gross = baseAmount + bonusAmount;

  // What the worker actually receives (gross minus deductions)
  const workerPayout = Math.max(
    0,
    parseFloat((gross - deductionAmount).toFixed(2)),
  );

  // Platform fee is calculated based on the central config (e.g. 1% or 15%)
  // We calculate it from the workerPayout (what the worker earns)
  const platformFee =
    typeof explicitFee === "number"
      ? explicitFee
      : FEE_CONFIG.computeHirerFee(workerPayout);

  // The hirer pays the worker payout + the platform fee
  const netAmount = parseFloat((workerPayout + platformFee).toFixed(2));

  return {
    baseAmount,
    bonusAmount,
    deductionAmount,
    grossAmount: gross,
    netAmount, // What the hirer is charged (Total to pay)
    platformFee, // The platform's cut
    workerPayout, // What the worker receives
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Member lifecycle
// ─────────────────────────────────────────────────────────────────────────────

export async function addMember(input, ctx = {}) {
  const {
    hirerId,
    workerId,
    workerEmail,
    jobTitle,
    department,
    employmentType = "FULL_TIME",
    locationType = "ON_SITE",
    location,
    latitude,
    longitude,
    description,
    payRate,
    currency = "NGN",
    payFrequency = "MONTHLY",
    overtimeRate,
    workDays = [],
    workStart,
    workEnd,
    timezone = "Africa/Lagos",
    employeeNumber,
    managerName,
    emergencyContact,
    notes,
  } = input;

  if (!hirerId) throw httpError(400, "hirerId is required");
  if (!jobTitle) throw httpError(400, "jobTitle is required");
  if (typeof payRate !== "number" || payRate <= 0)
    throw httpError(400, "payRate must be > 0");
  if (!workerId && !workerEmail)
    throw httpError(400, "workerId or workerEmail is required");

  // ── Resolve worker
  const worker = workerId
    ? await prisma.user.findUnique({ where: { id: workerId } })
    : await prisma.user.findUnique({
        where: { email: workerEmail.toLowerCase() },
      });

  if (!worker) throw httpError(404, "Worker not found");
  if (worker.role !== "WORKER")
    throw httpError(400, "Target user is not a WORKER");
  if (!worker.isActive) throw httpError(400, "Worker account is inactive");
  if (worker.isBanned) throw httpError(400, "Worker account is banned");
  if (worker.id === hirerId)
    throw httpError(400, "Hirer cannot hire themselves");

  // ── Duplicate active membership check
  const existing = await prisma.retainedStaffMember.findFirst({
    where: { hirerId, workerId: worker.id, status: "ACTIVE" },
  });
  if (existing)
    throw httpError(409, "Worker is already on your active retained staff");

  // ── Cap check
  const cap = await getSettingInt("retained.maxActiveStaffPerHirer", 100);
  const activeCount = await prisma.retainedStaffMember.count({
    where: { hirerId, status: "ACTIVE" },
  });
  if (activeCount >= cap)
    throw httpError(400, `Retained staff limit reached (${cap})`);

  // ── Create
  const member = await prisma.retainedStaffMember.create({
    data: {
      hirerId,
      workerId: worker.id,
      jobTitle,
      department,
      employmentType,
      locationType,
      location: location ?? null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      description,
      payRate,
      currency,
      payFrequency,
      overtimeRate,
      workDays,
      workStart,
      workEnd,
      timezone,
      employeeNumber,
      managerName,
      emergencyContact,
      notes,
      nextCycleAt: nextCycleDate(payFrequency, new Date()),
    },
  });

  // ── Permanent conversation
  try {
    await prisma.conversation.create({
      data: {
        retainedMemberId: member.id,
        users: {
          create: [{ userId: hirerId }, { userId: worker.id }],
        },
      },
    });
  } catch (err) {
    console.warn("[retainedStaff] conversation create failed:", err.message);
  }

  // ── Audit
  await logAdminAction({
    req: ctx.req,
    adminId: hirerId,
    action: "RETAINED_STAFF_ADDED",
    targetType: "RETAINED_STAFF_MEMBER",
    targetId: member.id,
    description: `Added ${worker.firstName} ${worker.lastName} to retained staff as ${jobTitle}`,
    after: {
      jobTitle,
      payRate,
      currency,
      payFrequency,
      employmentType,
      locationType,
      location: location ?? null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
    },
  });

  // ── Notify worker
  try {
    await createNotification({
      userId: worker.id,
      title: "You've been added to a payroll 👔",
      body: `You've been added to a retained staff position: ${jobTitle}.`,
      type: "RETAINED_STAFF_ADDED",
      icon: "FaUserTie",
      data: { memberId: member.id, hirerId },
    });
  } catch (err) {
    console.warn("[retainedStaff] notify failed:", err.message);
  }

  return member;
}

export async function updateMember(memberId, hirerId, patch, ctx = {}) {
  const member = await prisma.retainedStaffMember.findFirst({
    where: { id: memberId, hirerId },
  });
  if (!member) throw httpError(404, "Retained staff member not found");

  const allowed = [
    "jobTitle",
    "department",
    "employmentType",
    "locationType",
    "location",
    "latitude",
    "longitude",
    "description",
    "overtimeRate",
    "bonusEnabled",
    "workDays",
    "workStart",
    "workEnd",
    "timezone",
    "employeeNumber",
    "managerName",
    "emergencyContact",
    "notes",
  ];

  const data = {};
  for (const k of allowed) {
    if (patch[k] !== undefined) data[k] = patch[k];
  }

  let rateChanged = false;
  let oldRate = member.payRate;

  // ── Rate change (special handling)
  if (patch.payRate !== undefined && patch.payRate !== member.payRate) {
    if (typeof patch.payRate !== "number" || patch.payRate <= 0)
      throw httpError(400, "payRate must be > 0");
    data.payRate = patch.payRate;
    rateChanged = true;
  }

  // ── Frequency change
  if (
    patch.payFrequency !== undefined &&
    patch.payFrequency !== member.payFrequency
  ) {
    data.payFrequency = patch.payFrequency;
    data.nextCycleAt = nextCycleDate(patch.payFrequency, new Date());
  }

  // ── Currency change (locked after first cycle)
  if (patch.currency !== undefined && patch.currency !== member.currency) {
    if (member.currencyLocked)
      throw httpError(409, "Currency is locked once a cycle exists");
    data.currency = patch.currency;
  }

  // ── Update the member profile
  let updatedMember = member;
  if (Object.keys(data).length > 0) {
    updatedMember = await prisma.retainedStaffMember.update({
      where: { id: memberId },
      data,
    });
  }

  // ── If rate changed, handle pending cycles and write revision
  if (rateChanged) {
    // 1. Write revision history
    await prisma.retainedStaffRevision.create({
      data: {
        memberId,
        changedById: hirerId,
        field: "payRate",
        oldValue: oldRate,
        newValue: patch.payRate,
        reason: patch.rateChangeReason ?? "Rate updated via edit form",
      },
    });

    // 2. Optionally update pending cycles
    if (patch.applyToPending) {
      const pendingCycles = await prisma.retainedPayrollCycle.findMany({
        where: { memberId, status: "AWAITING_PAYMENT" },
      });

      for (const cycle of pendingCycles) {
        const amounts = computeCycleAmounts(
          { payRate: patch.payRate },
          {
            baseAmount: patch.payRate,
            bonusAmount: cycle.bonusAmount,
            deductionAmount: cycle.deductionAmount,
          },
        );
        await prisma.retainedPayrollCycle.update({
          where: { id: cycle.id },
          data: amounts,
        });
      }
    }
  }

  // ── Audit Log
  await logAdminAction({
    req: ctx.req,
    adminId: hirerId,
    action: rateChanged
      ? "RETAINED_STAFF_RATE_CHANGED"
      : "RETAINED_STAFF_UPDATED",
    targetType: "RETAINED_STAFF_MEMBER",
    targetId: memberId,
    description: rateChanged
      ? `Changed pay rate from ${oldRate} to ${patch.payRate} ${member.currency}`
      : `Updated retained staff details`,
    before: pick(member, Object.keys(data)),
    after: pick(data, Object.keys(data)),
  });

  return updatedMember;
}

export async function pauseMember(memberId, hirerId, reason, ctx = {}) {
  const member = await prisma.retainedStaffMember.findFirst({
    where: { id: memberId, hirerId },
  });
  if (!member) throw httpError(404, "Retained staff member not found");
  if (member.status !== "ACTIVE")
    throw httpError(400, `Cannot pause member with status ${member.status}`);

  const updated = await prisma.retainedStaffMember.update({
    where: { id: memberId },
    data: { status: "PAUSED", pausedAt: new Date(), endReason: reason ?? null },
  });

  await logAdminAction({
    req: ctx.req,
    adminId: hirerId,
    action: "RETAINED_STAFF_PAUSED",
    targetType: "RETAINED_STAFF_MEMBER",
    targetId: memberId,
    description: `Paused retained staff${reason ? `: ${reason}` : ""}`,
    before: { status: member.status },
    after: { status: "PAUSED" },
  });

  try {
    await createNotification({
      userId: member.workerId,
      title: "Payroll paused ⏸️",
      body: "Your payroll cycle has been paused by your employer.",
      type: "RETAINED_STAFF_PAUSED",
      icon: "FaPauseCircle",
      data: { memberId },
    });
  } catch {}

  return updated;
}

export async function resumeMember(memberId, hirerId, ctx = {}) {
  const member = await prisma.retainedStaffMember.findFirst({
    where: { id: memberId, hirerId },
  });
  if (!member) throw httpError(404, "Retained staff member not found");
  if (member.status !== "PAUSED")
    throw httpError(400, `Cannot resume member with status ${member.status}`);

  const updated = await prisma.retainedStaffMember.update({
    where: { id: memberId },
    data: {
      status: "ACTIVE",
      pausedAt: null,
      nextCycleAt: nextCycleDate(member.payFrequency, new Date()),
    },
  });

  await logAdminAction({
    req: ctx.req,
    adminId: hirerId,
    action: "RETAINED_STAFF_RESUMED",
    targetType: "RETAINED_STAFF_MEMBER",
    targetId: memberId,
    description: `Resumed retained staff`,
    before: { status: member.status },
    after: { status: "ACTIVE" },
  });

  try {
    await createNotification({
      userId: member.workerId,
      title: "Payroll resumed ▶️",
      body: "Your payroll cycle has been resumed.",
      type: "RETAINED_STAFF_RESUMED",
      icon: "FaPlayCircle",
      data: { memberId },
    });
  } catch {}

  return updated;
}

export async function endMember(
  memberId,
  hirerId,
  { reason, finalCycle, finalAmount, ctx } = {},
) {
  const member = await prisma.retainedStaffMember.findFirst({
    where: { id: memberId, hirerId },
  });
  if (!member) throw httpError(404, "Retained staff member not found");
  if (member.status === "ENDED" || member.status === "TERMINATED")
    throw httpError(400, "Member is already ended");

  let finalCycleId = null;
  if (finalCycle && finalAmount > 0) {
    const cycleSvc = await import("./retainedStaffCycle.service.js");
    const cycle = await cycleSvc.createManualCycle(
      memberId,
      hirerId,
      {
        type: "FINAL_SETTLEMENT",
        periodStart: new Date(),
        periodEnd: new Date(),
        payDate: new Date(),
        baseAmount: finalAmount,
        label: "Final settlement",
      },
      ctx,
    );
    finalCycleId = cycle.id;
  }

  const updated = await prisma.retainedStaffMember.update({
    where: { id: memberId },
    data: {
      status: "ENDED",
      endedAt: new Date(),
      endReason: reason ?? null,
      nextCycleAt: null,
    },
  });

  await logAdminAction({
    req: ctx.req,
    adminId: hirerId,
    action: "RETAINED_STAFF_ENDED",
    targetType: "RETAINED_STAFF_MEMBER",
    targetId: memberId,
    description: `Ended retained staff relationship${reason ? `: ${reason}` : ""}`,
    before: { status: member.status },
    after: { status: "ENDED", endReason: reason ?? null },
    meta: finalCycleId ? { finalCycleId } : undefined,
  });

  try {
    await createNotification({
      userId: member.workerId,
      title: "Payroll ended",
      body: "Your retained staff relationship has been ended by your employer.",
      type: "RETAINED_STAFF_ENDED",
      icon: "FaStopCircle",
      data: { memberId, finalCycleId },
    });
  } catch {}

  return updated;
}

export async function deleteMember(memberId, hirerId, ctx = {}) {
  const member = await prisma.retainedStaffMember.findFirst({
    where: { id: memberId, hirerId },
    include: { _count: { select: { cycles: true } } },
  });

  if (!member) throw httpError(404, "Retained staff member not found");

  if (member._count.cycles > 0) {
    throw httpError(
      409,
      "Cannot delete: this member has payroll cycles. Please 'End Employment' instead to preserve financial history.",
    );
  }

  await prisma.retainedStaffMember.delete({ where: { id: memberId } });

  await logAdminAction({
    req: ctx.req,
    adminId: hirerId,
    action: "RETAINED_STAFF_DELETED",
    targetType: "RETAINED_STAFF_MEMBER",
    targetId: memberId,
    description: `Deleted retained staff member`,
    before: { jobTitle: member.jobTitle, payRate: member.payRate },
  });

  return { deleted: true };
}
// ─────────────────────────────────────────────────────────────────────────────
// Rollup reconciliation (called by nightly cron)
// ─────────────────────────────────────────────────────────────────────────────

export async function reconcileMemberRollups(memberId) {
  const member = await prisma.retainedStaffMember.findUnique({
    where: { id: memberId },
  });
  if (!member) return null;

  const cycles = await prisma.retainedPayrollCycle.findMany({
    where: { memberId },
    select: { status: true, netAmount: true, releasedAt: true, paidAt: true },
  });

  let totalPaidLifetime = 0;
  let totalHeld = 0;
  let lastPaidAt = null;

  for (const c of cycles) {
    if (c.status === "RELEASED") {
      totalPaidLifetime += c.netAmount;
      if (c.releasedAt && (!lastPaidAt || c.releasedAt > lastPaidAt))
        lastPaidAt = c.releasedAt;
    } else if (c.status === "HELD" || c.status === "PARTIALLY_RELEASED") {
      totalHeld += c.netAmount;
    }
  }

  const diffPaid = Math.abs(totalPaidLifetime - member.totalPaidLifetime);
  const diffHeld = Math.abs(totalHeld - member.totalHeld);

  if (diffPaid > 0.01 || diffHeld > 0.01) {
    await prisma.retainedStaffMember.update({
      where: { id: memberId },
      data: {
        totalPaidLifetime,
        totalHeld,
        cyclesCount: cycles.length,
        lastPaidAt,
      },
    });
    return { memberId, diffPaid, diffHeld, fixed: true };
  }

  return { memberId, diffPaid, diffHeld, fixed: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal utilities
// ─────────────────────────────────────────────────────────────────────────────

function httpError(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

async function getSettingInt(key, fallback) {
  try {
    const row = await prisma.appSettings.findUnique({ where: { key } });
    if (!row) return fallback;
    const n = parseInt(row.value, 10);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}
