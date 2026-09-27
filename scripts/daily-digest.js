// scripts/daily-digest.js
// ─────────────────────────────────────────────────────────────────────────────
// Cron entrypoint: builds the digest and sends it.
//
// Usage:
//   node scripts/daily-digest.js             # normal run (skips if already sent today)
//   node scripts/daily-digest.js --force     # ignore "already sent today" guard
//   node scripts/daily-digest.js --dry-run   # build & print, don't send
//
// Cron:
//   0 6 * * *  cd /var/www/skilledpro-backend && /usr/bin/node scripts/daily-digest.js >> /var/log/daily-digest.log 2>&1
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
import prisma from "../src/config/database.js";
import { buildDailyDigest } from "../src/services/digest.service.js";
import { renderDailyDigest } from "../src/templates/dailyDigest.js";
import { sendEmail } from "../src/services/email.service.js";

const RECIPIENT = "skilledprozmarketplace@gmail.com";
const DIGEST_NOTIFICATION_TYPE = "DAILY_DIGEST_SENT";

const argv = process.argv.slice(2);
const FORCE = argv.includes("--force");
const DRY_RUN = argv.includes("--dry-run");

function todayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function alreadySentToday() {
  try {
    // We record sends as a Notification attached to the first admin user.
    // Any Notification row with type=DAILY_DIGEST_SENT and today's date in `data.date`.
    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true },
    });
    if (!admin) return false;

    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);

    const exists = await prisma.notification.findFirst({
      where: {
        userId: admin.id,
        type: DIGEST_NOTIFICATION_TYPE,
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    return !!exists;
  } catch {
    return false;
  }
}

async function recordSend() {
  try {
    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true },
    });
    if (!admin) return;
    await prisma.notification.create({
      data: {
        userId: admin.id,
        title: "Daily digest sent",
        body: `Sent to ${RECIPIENT}`,
        type: DIGEST_NOTIFICATION_TYPE,
        data: { date: todayKey(), recipient: RECIPIENT },
      },
    });
  } catch (err) {
    console.warn("⚠️  Could not record digest send:", err.message);
  }
}

async function main() {
  console.log(`\n━━━ Daily Digest — ${new Date().toISOString()} ━━━`);

  if (!FORCE && (await alreadySentToday())) {
    console.log("⏭️  Digest already sent today. Use --force to send again.");
    process.exit(0);
  }

  console.log("📊 Building digest data…");
  const data = await buildDailyDigest();

  console.log("🎨 Rendering HTML…");
  const html = renderDailyDigest(data);

  if (DRY_RUN) {
    console.log("🔍 DRY RUN — not sending. Summary:");
    console.log(
      "  Users:",
      data.users.newYesterday,
      `(${data.users.delta >= 0 ? "+" : ""}${data.users.delta})`,
    );
    console.log("  Bookings:", data.bookings.newYesterday);
    console.log(
      "  Currencies active:",
      Object.keys(data.revenue.byCurrency).join(", ") || "none",
    );
    console.log("  Attention items:", data.attention.total);
    console.log("  HTML length:", html.length, "bytes");
    process.exit(0);
  }

  console.log(`📧 Sending to ${RECIPIENT}…`);
  const result = await sendEmail({
    to: RECIPIENT,
    subject: `SkilledProz Daily Digest — ${data.windowLabel}`,
    html,
  });

  if (result.success) {
    console.log(`✅ Sent (messageId: ${result.messageId})`);
    await recordSend();
    process.exit(0);
  } else {
    console.error(`❌ Send failed: ${result.error}`);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("❌ Fatal error in daily-digest:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
