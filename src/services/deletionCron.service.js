import cron from "node-cron";
import prisma from "../config/database.js";

// Runs daily at 2:00 AM server time
export function startDeletionCron() {
  cron.schedule("0 2 * * *", async () => {
    console.log("[deletionCron] Running scheduled deletions…");
    try {
      const due = await prisma.user.findMany({
        where: {
          deletionScheduledAt: { lte: new Date() },
          isActive: true,
        },
        select: { id: true, email: true },
      });

      for (const user of due) {
        try {
          // Full anonymization — keeps FKs intact, strips PII
          await prisma.user.update({
            where: { id: user.id },
            data: {
              isActive: false,
              email: `deleted_${Date.now()}_${user.email}`,
              firstName: "Deleted",
              lastName: "User",
              phone: null,
              avatar: null,
              bio: null,
              address: null,
              city: null,
              state: null,
              country: null,
              googleId: null,
              refreshToken: null,
              profileVisible: false,
              deletionScheduledAt: null,
            },
          });
          console.log(`[deletionCron] ✅ Deleted user ${user.id}`);
        } catch (err) {
          console.error(
            `[deletionCron] ❌ Failed to delete user ${user.id}:`,
            err.message,
          );
        }
      }

      console.log(`[deletionCron] Processed ${due.length} account(s)`);
    } catch (err) {
      console.error("[deletionCron] Fatal error:", err.message);
    }
  });

  console.log("[deletionCron] Scheduled daily account deletion at 02:00");
}
