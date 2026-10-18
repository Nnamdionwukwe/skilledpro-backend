// src/jobs/retainedStaffCron.job.js
// ─────────────────────────────────────────────────────────────────────────────
// Retained Staff — payroll cycle generation cron
//
// Runs daily at 02:00 Africa/Lagos (configurable via CRON_RETAINED_SCHEDULE).
// Walks all ACTIVE retained-staff members whose `nextCycleAt` falls within
// the configured lookahead window and creates one cycle per member per period.
// Idempotent — safe to run twice, safe to restart.
//
// Also runs a nightly reconciliation at 02:30 to repair any drift in
// denormalized rollups (totalPaidLifetime, totalHeld, cyclesCount).
// ─────────────────────────────────────────────────────────────────────────────

import cron from "node-cron";
import prisma from "../config/database.js";
import { runRetainedCycleGeneration } from "../services/retainedStaffCycle.service.js";
import { reconcileMemberRollups } from "../services/retainedStaff.service.js";

const TZ = process.env.CRON_TIMEZONE || "Africa/Lagos";
const SCHEDULE = process.env.CRON_RETAINED_SCHEDULE || "0 2 * * *"; // 02:00 daily
const RECONCILE_SCHEDULE = process.env.CRON_RETAINED_RECONCILE || "30 2 * * *"; // 02:30 daily

let cycleTask = null;
let reconcileTask = null;

/**
 * Main cycle-generation pass.
 * Exported so admin endpoint can trigger it manually.
 */
export async function runCyclePass({ trigger = "CRON", actorId = null } = {}) {
  const startedAt = Date.now();
  console.log(`[retainedCron] ▶ cycle pass starting (trigger=${trigger})`);

  try {
    const result = await runRetainedCycleGeneration({ trigger, actorId });
    const elapsed = Date.now() - startedAt;
    console.log(
      `[retainedCron] ✅ cycle pass done in ${elapsed}ms — processed=${result.processed}, created=${result.created}`,
    );
    return result;
  } catch (err) {
    console.error(`[retainedCron] ❌ cycle pass failed:`, err.message);
    throw err;
  }
}

/**
 * Nightly reconciliation pass — recompute denormalized rollups on members.
 * Scans only members who have had activity in the last 90 days to keep it fast.
 */
export async function runReconcilePass() {
  const startedAt = Date.now();
  const since = new Date(Date.now() - 90 * 86_400_000);

  console.log(`[retainedCron] ▶ reconcile pass starting`);

  try {
    const members = await prisma.retainedStaffMember.findMany({
      where: {
        OR: [{ updatedAt: { gte: since } }, { lastPaidAt: { gte: since } }],
      },
      select: { id: true },
    });

    let fixed = 0;
    let checked = 0;
    for (const m of members) {
      checked++;
      try {
        const res = await reconcileMemberRollups(m.id);
        if (res?.fixed) {
          fixed++;
          console.warn(
            `[retainedCron] ⚠ reconciled member ${m.id}: paid drift=${res.diffPaid}, held drift=${res.diffHeld}`,
          );
        }
      } catch (err) {
        console.error(
          `[retainedCron] reconcile member ${m.id} failed:`,
          err.message,
        );
      }
    }

    const elapsed = Date.now() - startedAt;
    console.log(
      `[retainedCron] ✅ reconcile pass done in ${elapsed}ms — checked=${checked}, fixed=${fixed}`,
    );
    return { checked, fixed, elapsed };
  } catch (err) {
    console.error(`[retainedCron] ❌ reconcile pass failed:`, err.message);
    throw err;
  }
}

/**
 * Start both cron tasks. Call from server.js after app.listen.
 * Idempotent — calling twice won't register duplicate tasks.
 */
export function startRetainedStaffCron() {
  if (cycleTask || reconcileTask) {
    console.warn("[retainedCron] already started — skipping");
    return;
  }

  cycleTask = cron.schedule(
    SCHEDULE,
    async () => {
      try {
        await runCyclePass({ trigger: "CRON" });
      } catch (err) {
        // already logged inside runCyclePass
      }
    },
    { timezone: TZ },
  );

  reconcileTask = cron.schedule(
    RECONCILE_SCHEDULE,
    async () => {
      try {
        await runReconcilePass();
      } catch (err) {
        // already logged
      }
    },
    { timezone: TZ },
  );

  console.log(
    `[retainedCron] registered — cycle=${SCHEDULE} (tz=${TZ}), reconcile=${RECONCILE_SCHEDULE}`,
  );
}

/**
 * Stop both cron tasks gracefully (called on SIGINT / SIGTERM).
 */
export function stopRetainedStaffCron() {
  if (cycleTask) {
    cycleTask.stop();
    cycleTask = null;
  }
  if (reconcileTask) {
    reconcileTask.stop();
    reconcileTask = null;
  }
  console.log("[retainedCron] stopped");
}
