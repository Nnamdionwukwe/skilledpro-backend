import cron from "node-cron";
import { autoCloseResolvedTickets } from "../services/support.ticket.service.js";

export function startSupportJobs() {
  // Auto-close RESOLVED tickets after 7 days — hourly check
  cron.schedule("0 * * * *", async () => {
    try {
      const n = await autoCloseResolvedTickets();
      if (n > 0) console.log(`[support] auto-closed ${n} resolved ticket(s)`);
    } catch (err) {
      console.error("[support] auto-close failed:", err.message);
    }
  });
  console.log("[support] cron jobs started");
}
