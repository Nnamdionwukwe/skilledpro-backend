// src/jobs/support.jobs.js
import cron from "node-cron";
import { autoCloseResolvedTickets } from "../services/support.ticket.service.js";

/**
 * Support cron jobs:
 *   • Auto-close RESOLVED tickets after 7 days (checked hourly)
 *
 * Started once from app.js at boot. Guarded by a module-level flag
 * so HMR / double-import in dev doesn't register the task twice.
 */
let started = false;

export function startSupportJobs() {
  if (started) {
    console.log("[support] cron already running — skipping duplicate start");
    return;
  }
  started = true;

  // Runs at the top of every hour
  cron.schedule(
    "0 * * * *",
    async () => {
      try {
        const n = await autoCloseResolvedTickets();
        if (n > 0) {
          console.log(`[support] auto-closed ${n} resolved ticket(s)`);
        }
      } catch (err) {
        console.error("[support] auto-close failed:", err.message);
      }
    },
    { timezone: "UTC" },
  );

  console.log("[support] ✅ cron jobs started");
}
