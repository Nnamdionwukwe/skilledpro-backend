// scripts/seed-audit-log.js
// ─────────────────────────────────────────────────────────────────────────────
// Seeds realistic AuditLog records into Railway PostgreSQL for dev/testing.
// Uses raw pg — never PrismaClient.
//
// Run: node scripts/seed-audit-log.js
//
// Seeds 35 audit entries spread over the past 30 days across:
//   - All major action types
//   - Multiple admins (or the same admin if only one exists)
//   - Mix of SUCCESS, FAILED, PARTIAL results
//   - Realistic before/after/meta JSON payloads
// ─────────────────────────────────────────────────────────────────────────────

import pg from "pg";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});
const LINE = "─".repeat(70);

// ─── Spread timestamps across the past N days ─────────────────────────────────
function daysAgo(n, jitterHours = 0) {
  const d = new Date(Date.now() - n * 86400000);
  d.setHours(d.getHours() - jitterHours);
  return d;
}

// ─── Random element ───────────────────────────────────────────────────────────
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const IPS = [
  "41.58.102.14",
  "105.112.55.200",
  "197.210.84.16",
  "41.204.66.38",
  "41.58.103.11",
  "102.89.34.72",
];

const UAS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
];

async function run() {
  const client = await pool.connect();
  console.log(`\n${LINE}`);
  console.log(" SkilledProz — Audit Log Seed Script");
  console.log(` Started: ${new Date().toLocaleString()}`);
  console.log(LINE);

  try {
    // ── Guard: skip if already seeded ────────────────────────────────────────
    const existing = await client.query(`SELECT COUNT(*) FROM "AuditLog"`);
    if (parseInt(existing.rows[0].count) >= 30) {
      console.log(
        `\n⏭  Already have ${existing.rows[0].count} audit entries — skipping`,
      );
      return;
    }

    // ── Fetch real IDs ────────────────────────────────────────────────────────
    const adminsRes = await client.query(
      `SELECT id, email FROM "User" WHERE role = 'ADMIN' LIMIT 3`,
    );
    const usersRes = await client.query(
      `SELECT id, email FROM "User" WHERE role != 'ADMIN' AND "isActive" = true LIMIT 15`,
    );
    const jobsRes = await client.query(`SELECT id FROM "JobPost" LIMIT 5`);
    const postsRes = await client.query(`SELECT id FROM "Post" LIMIT 3`);
    const booksRes = await client.query(`SELECT id FROM "Booking" LIMIT 3`);
    const payRes = await client.query(`SELECT id FROM "Payment" LIMIT 3`);
    const wdRes = await client.query(`SELECT id FROM "Withdrawal" LIMIT 3`);
    const catsRes = await client.query(
      `SELECT id, name FROM "Category" LIMIT 3`,
    );

    if (adminsRes.rows.length === 0) {
      console.error("\n❌ No admin users found. Create an admin user first.");
      process.exit(1);
    }

    const admins = adminsRes.rows;
    const users = usersRes.rows;
    const jobs = jobsRes.rows.map((r) => r.id);
    const posts = postsRes.rows.map((r) => r.id);
    const books = booksRes.rows.map((r) => r.id);
    const pays = payRes.rows.map((r) => r.id);
    const wds = wdRes.rows.map((r) => r.id);
    const cats = catsRes.rows;

    const admin = (i = 0) => admins[i % admins.length];
    const user = (i = 0) => users[i % Math.max(users.length, 1)];
    const fake = () => randomUUID();

    // ─── Build seed entries ───────────────────────────────────────────────────
    const entries = [
      // ── User management ──────────────────────────────────────────────────
      {
        adminId: admin(0).id,
        action: "USER_BANNED",
        targetType: "USER",
        targetId: user(0)?.id || fake(),
        description: `Banned user ${user(0)?.email || "test@example.com"} — Reason: Multiple fraud reports`,
        before: { isBanned: false, isActive: true },
        after: { isBanned: true, isActive: false },
        meta: { reason: "Multiple fraud reports confirmed", reportCount: 4 },
        result: "SUCCESS",
        createdAt: daysAgo(1, 2),
      },
      {
        adminId: admin(0).id,
        action: "USER_UNBANNED",
        targetType: "USER",
        targetId: user(1)?.id || fake(),
        description: `Unbanned user ${user(1)?.email || "user2@example.com"} after appeal`,
        before: { isBanned: true, isActive: false },
        after: { isBanned: false, isActive: true },
        meta: { reason: "Appeal accepted — ban was incorrect" },
        result: "SUCCESS",
        createdAt: daysAgo(2, 4),
      },
      {
        adminId: admin(0).id,
        action: "USER_ROLE_CHANGED",
        targetType: "USER",
        targetId: user(2)?.id || fake(),
        description: `Changed role for ${user(2)?.email || "user3@example.com"} from WORKER to HIRER`,
        before: { role: "WORKER" },
        after: { role: "HIRER" },
        meta: { previousRole: "WORKER", newRole: "HIRER" },
        result: "SUCCESS",
        createdAt: daysAgo(3, 1),
      },
      {
        adminId: admin(0).id,
        action: "USER_VERIFIED",
        targetType: "USER",
        targetId: user(3)?.id || fake(),
        description: `Verified worker profile for ${user(3)?.email || "worker@example.com"}`,
        before: { verificationStatus: "PENDING" },
        after: { verificationStatus: "VERIFIED" },
        meta: { method: "ID + selfie verified" },
        result: "SUCCESS",
        createdAt: daysAgo(4, 3),
      },
      {
        adminId: admin(1 % admins.length).id,
        action: "USER_VERIFICATION_REJECTED",
        targetType: "USER",
        targetId: user(4)?.id || fake(),
        description: `Rejected verification for ${user(4)?.email || "worker2@example.com"} — ID documents unclear`,
        before: { verificationStatus: "PENDING" },
        after: { verificationStatus: "REJECTED" },
        meta: { reason: "ID documents were blurry and unreadable" },
        result: "SUCCESS",
        createdAt: daysAgo(5, 6),
      },
      {
        adminId: admin(0).id,
        action: "USER_DELETED",
        targetType: "USER",
        targetId: fake(),
        description: "Soft-deleted user who requested account deletion",
        before: { isActive: true, email: "deleted_user@example.com" },
        after: { isActive: false, email: `deleted_${Date.now()}@example.com` },
        meta: { reason: "User-requested deletion — GDPR" },
        result: "SUCCESS",
        createdAt: daysAgo(6, 2),
      },

      // ── Payment management ────────────────────────────────────────────────
      {
        adminId: admin(0).id,
        action: "PAYMENT_MANUAL_VERIFIED",
        targetType: "PAYMENT",
        targetId: pays[0] || fake(),
        description:
          "Verified bank transfer for booking — reference BT-1234567890-ABCD",
        before: { status: "PENDING" },
        after: { status: "HELD" },
        meta: {
          provider: "bank_transfer",
          reference: "BT-1234567890-ABCD",
          amount: 52500,
          currency: "NGN",
        },
        result: "SUCCESS",
        createdAt: daysAgo(2, 5),
      },
      {
        adminId: admin(0).id,
        action: "PAYMENT_MANUAL_REJECTED",
        targetType: "PAYMENT",
        targetId: pays[1] || fake(),
        description:
          "Rejected crypto payment — tx hash not found on BSC explorer",
        before: { status: "PENDING" },
        after: { status: "FAILED" },
        meta: {
          reason: "Transaction hash not found on BSC explorer",
          txHash: "0xfake123",
          provider: "crypto",
        },
        result: "SUCCESS",
        createdAt: daysAgo(7, 3),
      },
      {
        adminId: admin(0).id,
        action: "PAYMENT_RELEASED",
        targetType: "PAYMENT",
        targetId: pays[2] || fake(),
        description: "Released escrowed payment for completed booking",
        before: { status: "HELD" },
        after: { status: "RELEASED" },
        meta: {
          amount: 75000,
          currency: "NGN",
          note: "Admin override — hirer unresponsive for 14 days",
        },
        result: "SUCCESS",
        createdAt: daysAgo(10, 1),
      },
      {
        adminId: admin(1 % admins.length).id,
        action: "PAYMENT_REFUNDED",
        targetType: "PAYMENT",
        targetId: fake(),
        description: "Refunded payment — booking cancelled by mutual agreement",
        before: { status: "HELD" },
        after: { status: "REFUNDED" },
        meta: { amount: 30000, currency: "NGN", reason: "Mutual cancellation" },
        result: "SUCCESS",
        createdAt: daysAgo(12, 4),
      },

      // ── Withdrawal management ─────────────────────────────────────────────
      {
        adminId: admin(0).id,
        action: "WITHDRAWAL_APPROVED",
        targetType: "WITHDRAWAL",
        targetId: wds[0] || fake(),
        description: `Approved withdrawal of NGN 25,000 to First Bank`,
        before: { status: "PENDING" },
        after: { status: "PROCESSING" },
        meta: {
          amount: 25000,
          currency: "NGN",
          bankName: "First Bank",
          method: "bank_transfer",
        },
        result: "SUCCESS",
        createdAt: daysAgo(3, 2),
      },
      {
        adminId: admin(0).id,
        action: "WITHDRAWAL_REJECTED",
        targetType: "WITHDRAWAL",
        targetId: wds[1] || fake(),
        description: "Rejected withdrawal — account details do not match",
        before: { status: "PENDING" },
        after: { status: "FAILED" },
        meta: {
          reason: "Account name does not match registered name",
          amount: 15000,
        },
        result: "SUCCESS",
        createdAt: daysAgo(8, 7),
      },

      // ── Report management ─────────────────────────────────────────────────
      {
        adminId: admin(1 % admins.length).id,
        action: "REPORT_RESOLVED",
        targetType: "REPORT",
        targetId: fake(),
        description: "Resolved fraud report — user banned",
        before: { status: "REVIEWING" },
        after: { status: "RESOLVED", actionTaken: "USER_BANNED" },
        meta: {
          action: "USER_BANNED",
          reason: "Confirmed fraud activity across 3 bookings",
        },
        result: "SUCCESS",
        createdAt: daysAgo(1, 8),
      },
      {
        adminId: admin(0).id,
        action: "REPORT_DISMISSED",
        targetType: "REPORT",
        targetId: fake(),
        description: "Dismissed spam report — no violation found",
        before: { status: "REVIEWING" },
        after: { status: "DISMISSED", actionTaken: "NO_ACTION" },
        meta: {
          reason:
            "Profile is legitimate — report appears to be competitor harassment",
        },
        result: "SUCCESS",
        createdAt: daysAgo(4, 5),
      },
      {
        adminId: admin(0).id,
        action: "REPORT_BULK_DISMISSED",
        targetType: "REPORT",
        targetId: null,
        description:
          "Bulk dismissed 8 spam reports flagged during coordinated attack",
        meta: {
          count: 8,
          reason: "Coordinated false reporting from competitor accounts",
        },
        result: "SUCCESS",
        createdAt: daysAgo(9, 2),
      },

      // ── Content management ────────────────────────────────────────────────
      {
        adminId: admin(0).id,
        action: "CATEGORY_CREATED",
        targetType: "CATEGORY",
        targetId: cats[0]?.id || fake(),
        description: `Created category: ${cats[0]?.name || "Digital Marketing"}`,
        after: {
          name: cats[0]?.name || "Digital Marketing",
          slug: "digital-marketing",
        },
        meta: { name: cats[0]?.name || "Digital Marketing" },
        result: "SUCCESS",
        createdAt: daysAgo(15, 3),
      },
      {
        adminId: admin(0).id,
        action: "CATEGORY_UPDATED",
        targetType: "CATEGORY",
        targetId: cats[1]?.id || fake(),
        description: `Updated category: ${cats[1]?.name || "Web Development"}`,
        before: { description: "Old description" },
        after: { description: "Updated description with more detail" },
        meta: { field: "description" },
        result: "SUCCESS",
        createdAt: daysAgo(20, 1),
      },
      {
        adminId: admin(1 % admins.length).id,
        action: "REVIEW_DELETED",
        targetType: "REVIEW",
        targetId: fake(),
        description:
          "Deleted fake review — confirmed to be from a duplicate account",
        meta: {
          reason: "Review submitted from a sockpuppet account",
          rating: 5,
        },
        result: "SUCCESS",
        createdAt: daysAgo(6, 4),
      },
      {
        adminId: admin(0).id,
        action: "JOB_DELETED",
        targetType: "JOB_POST",
        targetId: jobs[0] || fake(),
        description: "Deleted job post — scam listing with unrealistic rates",
        meta: {
          reason:
            "Scam listing — offering ₦50,000 for unrealistic deliverables",
        },
        result: "SUCCESS",
        createdAt: daysAgo(11, 6),
      },
      {
        adminId: admin(0).id,
        action: "JOB_STATUS_CHANGED",
        targetType: "JOB_POST",
        targetId: jobs[1] || fake(),
        description:
          "Changed job post status to CANCELLED — hirer requested closure",
        before: { status: "OPEN" },
        after: { status: "CANCELLED" },
        meta: { reason: "Hirer requested closure", previousStatus: "OPEN" },
        result: "SUCCESS",
        createdAt: daysAgo(13, 2),
      },
      {
        adminId: admin(1 % admins.length).id,
        action: "POST_DELETED",
        targetType: "POST",
        targetId: posts[0] || fake(),
        description: "Deleted community post — contained hate speech",
        meta: {
          reason: "Hate speech targeting ethnic group",
          reportId: fake(),
        },
        result: "SUCCESS",
        createdAt: daysAgo(7, 8),
      },
      {
        adminId: admin(0).id,
        action: "FEATURED_REMOVED",
        targetType: "FEATURED_LISTING",
        targetId: fake(),
        description:
          "Removed featured listing — worker violated featured content guidelines",
        meta: { reason: "Profile description contained false certifications" },
        result: "SUCCESS",
        createdAt: daysAgo(16, 3),
      },

      // ── Booking & disputes ────────────────────────────────────────────────
      {
        adminId: admin(0).id,
        action: "BOOKING_STATUS_CHANGED",
        targetType: "BOOKING",
        targetId: books[0] || fake(),
        description:
          "Changed booking status to CANCELLED — admin override after investigation",
        before: { status: "DISPUTED" },
        after: { status: "CANCELLED" },
        meta: {
          reason: "Dispute resolved in hirer's favour",
          previousStatus: "DISPUTED",
        },
        result: "SUCCESS",
        createdAt: daysAgo(5, 7),
      },
      {
        adminId: admin(1 % admins.length).id,
        action: "DISPUTE_RESOLVED",
        targetType: "DISPUTE",
        targetId: books[1] || fake(),
        description:
          "Resolved dispute — SPLIT decision (50% refund, 50% released)",
        meta: {
          resolution: "SPLIT",
          refundPercent: 50,
          releasePercent: 50,
          reason: "Work partially completed",
        },
        result: "SUCCESS",
        createdAt: daysAgo(18, 4),
      },

      // ── Campaign management ───────────────────────────────────────────────
      {
        adminId: admin(0).id,
        action: "CAMPAIGN_SUBMISSION_REVIEWED",
        targetType: "CAMPAIGN_SUBMISSION",
        targetId: fake(),
        description: "Reviewed campaign submission — 8/10 referrals approved",
        before: { status: "PENDING", totalSubmitted: 10 },
        after: {
          status: "PARTIAL",
          totalApproved: 8,
          totalRejected: 2,
          netAmount: 800,
        },
        meta: {
          approvedCount: 8,
          rejectedCount: 2,
          netAmount: 800,
          currency: "NGN",
        },
        result: "SUCCESS",
        createdAt: daysAgo(2, 9),
      },
      {
        adminId: admin(0).id,
        action: "CAMPAIGN_WITHDRAWAL_APPROVED",
        targetType: "CAMPAIGN_WITHDRAWAL",
        targetId: fake(),
        description: "Approved campaign wallet withdrawal of NGN 5,000",
        before: { status: "PENDING" },
        after: { status: "APPROVED" },
        meta: { amount: 5000, currency: "NGN", bankName: "Access Bank" },
        result: "SUCCESS",
        createdAt: daysAgo(4, 6),
      },

      // ── Referral management ───────────────────────────────────────────────
      {
        adminId: admin(0).id,
        action: "REFERRAL_FLAGGED",
        targetType: "REFERRAL",
        targetId: fake(),
        description:
          "Flagged referral for investigation — self-referral suspicion",
        meta: {
          reason:
            "Same device fingerprint detected for referrer and referred user",
          referrerId: fake(),
        },
        result: "SUCCESS",
        createdAt: daysAgo(9, 3),
      },

      // ── Subscription ──────────────────────────────────────────────────────
      {
        adminId: admin(0).id,
        action: "SUBSCRIPTION_CANCELLED",
        targetType: "SUBSCRIPTION",
        targetId: fake(),
        description:
          "Cancelled subscription — payment reversal after chargeback",
        before: { status: "ACTIVE" },
        after: { status: "CANCELLED" },
        meta: {
          reason: "Chargeback filed — subscription benefits revoked",
          tier: "PRO",
        },
        result: "SUCCESS",
        createdAt: daysAgo(14, 2),
      },

      // ── Broadcast ─────────────────────────────────────────────────────────
      {
        adminId: admin(0).id,
        action: "NOTIFICATION_BROADCAST",
        targetType: "SYSTEM",
        targetId: null,
        description:
          "Broadcast platform announcement to all users: new payment features",
        meta: {
          title: "New Payment Methods Available 💳",
          body: "You can now pay with USDC and USDT on SkilledProz.",
          recipients: 1243,
          role: null,
        },
        result: "SUCCESS",
        createdAt: daysAgo(22, 5),
      },

      // ── System / failed actions ───────────────────────────────────────────
      {
        adminId: admin(0).id,
        action: "WITHDRAWAL_APPROVED",
        targetType: "WITHDRAWAL",
        targetId: wds[2] || fake(),
        description:
          "Attempted to approve withdrawal — Paystack API returned 502",
        before: { status: "PENDING" },
        meta: { amount: 45000, currency: "NGN", bankCode: "058" },
        result: "FAILED",
        errorMessage:
          "Paystack API error: Service temporarily unavailable (502)",
        createdAt: daysAgo(3, 11),
      },
      {
        adminId: admin(0).id,
        action: "PAYMENT_MANUAL_VERIFIED",
        targetType: "PAYMENT",
        targetId: fake(),
        description:
          "Attempted to verify bank transfer — booking was already HELD",
        meta: { reason: "Duplicate verification attempt" },
        result: "FAILED",
        errorMessage: "Payment is already HELD — cannot verify again",
        createdAt: daysAgo(6, 9),
      },
      {
        adminId: admin(1 % admins.length).id,
        action: "USER_BANNED",
        targetType: "USER",
        targetId: fake(),
        description: "Attempted to ban admin user — operation blocked",
        meta: { reason: "Accidental selection" },
        result: "FAILED",
        errorMessage: "Cannot ban an admin user",
        createdAt: daysAgo(17, 3),
      },

      // ── Login ─────────────────────────────────────────────────────────────
      {
        adminId: admin(0).id,
        action: "ADMIN_LOGIN",
        targetType: "SYSTEM",
        targetId: null,
        description: `Admin ${admin(0).email} logged in`,
        meta: { email: admin(0).email },
        result: "SUCCESS",
        createdAt: daysAgo(0, 1), // 1 hour ago
      },
      {
        adminId: admin(1 % admins.length).id,
        action: "ADMIN_LOGIN",
        targetType: "SYSTEM",
        targetId: null,
        description: `Admin ${admin(1 % admins.length).email} logged in`,
        meta: { email: admin(1 % admins.length).email },
        result: "SUCCESS",
        createdAt: daysAgo(1, 3),
      },
    ];

    // ── Insert ────────────────────────────────────────────────────────────────
    let inserted = 0,
      skipped = 0;

    for (const e of entries) {
      try {
        await client.query(
          `INSERT INTO "AuditLog" (
            "id", "adminId", "action", "targetType", "targetId",
            "description", "before", "after", "meta",
            "result", "errorMessage", "ipAddress", "userAgent", "createdAt"
          ) VALUES (
            $1, $2, $3::"AuditAction", $4::"AuditTargetType", $5,
            $6, $7, $8, $9,
            $10::"AuditResult", $11, $12, $13, $14
          ) ON CONFLICT DO NOTHING`,
          [
            randomUUID(),
            e.adminId,
            e.action,
            e.targetType,
            e.targetId || null,
            e.description,
            e.before ? JSON.stringify(e.before) : null,
            e.after ? JSON.stringify(e.after) : null,
            e.meta ? JSON.stringify(e.meta) : null,
            e.result || "SUCCESS",
            e.errorMessage || null,
            pick(IPS),
            pick(UAS),
            e.createdAt,
          ],
        );
        const label = e.result === "FAILED" ? "❌ FAILED " : "✓ SUCCESS";
        console.log(`  ${label} | ${e.action.padEnd(32)} | ${e.targetType}`);
        inserted++;
      } catch (err) {
        console.warn(
          `  ⚠  Skipped "${e.action}": ${err.message.split("\n")[0]}`,
        );
        skipped++;
      }
    }

    console.log(`\n${LINE}`);
    console.log(" ✅  Seed complete!");
    console.log(`  Inserted : ${inserted}`);
    console.log(`  Skipped  : ${skipped}`);
    console.log(LINE + "\n");
  } catch (err) {
    console.error("\n❌ Seed FAILED:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
