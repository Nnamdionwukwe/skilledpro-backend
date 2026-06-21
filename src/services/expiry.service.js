// src/services/expiry.service.js
import cron from "node-cron";
import prisma from "../config/database.js";
import { logAdminAction } from "../utils/auditLog.js";

async function expireJobs() {
  const now = new Date();
  const expired = await prisma.jobPost.updateMany({
    where: {
      expiryDate: { lt: now },
      status: { not: "CANCELLED" },
    },
    data: { status: "CANCELLED" },
  });

  if (expired.count > 0) {
    await logAdminAction({
      req: null,
      adminId: "system",
      action: "JOB_STATUS_CHANGED",
      targetType: "SYSTEM",
      description: `Auto-expired ${expired.count} job posts`,
      meta: { count: expired.count, expiredAt: now },
    });
    console.log(`[Cron] Expired ${expired.count} job posts.`);
  }
}

cron.schedule("0 0 * * *", async () => {
  console.log("[Cron] Running job expiry check...");
  await expireJobs();
});

export { expireJobs };
