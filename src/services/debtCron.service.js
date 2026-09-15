// src/services/debtCron.service.js
// ─────────────────────────────────────────────────────────────────────────────
// Worker Debt Cron
//
// Runs once per day. Automatically forgives debts that have been outstanding
// for more than N days AND belong to workers who have had NO earnings in the
// same period. This keeps the admin debt dashboard clean and doesn't punish
// inactive workers who are unlikely to ever repay.
//
// Configurable via env:
//   DEBT_AUTO_FORGIVE_DAYS  (default: 90)
//   DEBT_CRON_ENABLED       (default: "true")
// ─────────────────────────────────────────────────────────────────────────────
import cron from "node-cron";
import prisma from "../config/database.js";
import { createNotification } from "./notification.service.js";

const AUTO_FORGIVE_DAYS = parseInt(process.env.DEBT_AUTO_FORGIVE_DAYS || "90");
const CRON_ENABLED = process.env.DEBT_CRON_ENABLED !== "false";

// ── Core job logic ─────────────────────────────────────────────────────────
export async function runDebtAutoForgive() {
  const startTime = Date.now();
  const cutoff = new Date(Date.now() - AUTO_FORGIVE_DAYS * 86400000);

  console.log(
    `[debtCron] Running auto-forgive for debts older than ${AUTO_FORGIVE_DAYS} days (cutoff ${cutoff.toISOString()})`,
  );

  try {
    // Find candidate debts
    const candidates = await prisma.workerDebt.findMany({
      where: {
        status: "OUTSTANDING",
        createdAt: { lt: cutoff },
      },
      include: {
        worker: {
          select: { id: true, firstName: true, email: true },
        },
      },
      take: 500, // hard cap per run
    });

    if (candidates.length === 0) {
      console.log(`[debtCron] No debts eligible for auto-forgive.`);
      return { forgiven: 0, skipped: 0, errors: 0 };
    }

    let forgiven = 0;
    let skipped = 0;
    let errors = 0;

    for (const debt of candidates) {
      try {
        // Skip if worker has earned anything in the last N days
        const recentPayment = await prisma.payment.findFirst({
          where: {
            booking: { workerId: debt.workerId },
            status: "RELEASED",
            createdAt: { gte: cutoff },
          },
          select: { id: true },
        });

        if (recentPayment) {
          skipped++;
          continue;
        }

        const remainingOwed =
          debt.amount - debt.amountPaid - debt.amountForgiven;

        if (remainingOwed <= 0) {
          skipped++;
          continue;
        }

        // Forgive the debt
        await prisma.workerDebt.update({
          where: { id: debt.id },
          data: {
            amountForgiven: debt.amount,
            status: "FORGIVEN",
            forgivenAt: new Date(),
            // Note: no forgivenById because it's a system action
            meta: {
              ...(debt.meta || {}),
              forgivenReason: "AUTO_FORGIVE_INACTIVE_WORKER",
              forgivenAt: new Date().toISOString(),
              daysOutstanding: Math.floor(
                (Date.now() - debt.createdAt.getTime()) / 86400000,
              ),
            },
          },
        });

        // Reduce the worker's aggregate debt balance
        await prisma.workerProfile
          .update({
            where: { userId: debt.workerId },
            data: {
              debtBalance: { decrement: remainingOwed },
            },
          })
          .catch(() => {
            // Non-fatal if no worker profile
          });

        // Notify the worker
        await createNotification({
          userId: debt.workerId,
          title: "Debt forgiven",
          body: `Your outstanding balance of ${debt.currency} ${remainingOwed.toFixed(2)} has been forgiven.`,
          type: "WORKER_DEBT_FORGIVEN",
          data: {
            debtId: debt.id,
            amountForgiven: remainingOwed,
            reason: "AUTO_FORGIVE_INACTIVE_WORKER",
          },
          icon: "FaCheckCircle",
        }).catch(() => {});

        forgiven++;

        console.log(
          `[debtCron] Forgave debt ${debt.id} (${remainingOwed.toFixed(2)} ${debt.currency}) for worker ${debt.workerId}`,
        );
      } catch (err) {
        errors++;
        console.error(
          `[debtCron] Failed to forgive debt ${debt.id}:`,
          err.message,
        );
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `[debtCron] Done — forgiven: ${forgiven}, skipped: ${skipped}, errors: ${errors}, elapsed: ${elapsed}ms`,
    );

    return { forgiven, skipped, errors };
  } catch (err) {
    console.error("[debtCron] Fatal error:", err.message);
    return { forgiven: 0, skipped: 0, errors: 1, fatal: true };
  }
}

// ── Schedule ───────────────────────────────────────────────────────────────
// Runs every day at 03:00 server time.
// Cron format: second minute hour day-of-month month day-of-week
export function startDebtCron() {
  if (!CRON_ENABLED) {
    console.log("[debtCron] Disabled via DEBT_CRON_ENABLED=false");
    return;
  }

  console.log(
    `[debtCron] Scheduling daily auto-forgive at 03:00 (auto-forgive threshold: ${AUTO_FORGIVE_DAYS} days)`,
  );

  cron.schedule(
    "0 0 3 * * *", // 03:00:00 every day
    async () => {
      try {
        await runDebtAutoForgive();
      } catch (err) {
        console.error("[debtCron] Scheduled run failed:", err.message);
      }
    },
    {
      timezone: "Africa/Lagos", // change if your server is in a different TZ
    },
  );
}
