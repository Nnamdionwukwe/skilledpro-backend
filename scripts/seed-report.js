// scripts/seed-report.js
// ─────────────────────────────────────────────────────────────────────────────
// Seeds sample Report records into Railway PostgreSQL for dev/testing
// Uses raw pg — never PrismaClient directly
//
// Run: node scripts/seed-report.js
//
// What it seeds:
//  - Fetches real user IDs from your DB
//  - Creates 12 sample reports across different types, reasons, and statuses
//  - Creates 1 RESOLVED (with ban), 1 RESOLVED (warning), 2 DISMISSED,
//    rest PENDING / REVIEWING — so the admin UI has something to show
//  - Safe to re-run — skips if enough reports already exist
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

const REASONS = [
  "SPAM",
  "FAKE_PROFILE",
  "INAPPROPRIATE_CONTENT",
  "FRAUD",
  "HARASSMENT",
  "SCAM",
  "MISLEADING_INFORMATION",
  "FAKE_REVIEWS",
  "UNDERAGE_USER",
  "HATE_SPEECH",
  "OTHER",
];

const DESCRIPTIONS = [
  "This user has been sending unsolicited messages to multiple people.",
  "The profile photo and credentials appear to be stolen from another professional.",
  "The job post contains offensive language and is inappropriate for the platform.",
  "This worker took payment outside the platform and disappeared without completing the work.",
  "I've received threatening messages from this user after leaving an honest review.",
  "This listing is a clear scam — the price is too good to be true and there's no real service.",
  "The listed skills and experience do not match their actual capabilities.",
  "Multiple suspicious 5-star reviews posted within minutes of each other.",
  "Based on the conversation, this user appears to be underage.",
  "This post contains discriminatory language targeting a specific group.",
  "Something suspicious about this account that doesn't fit other categories.",
  "This worker has duplicate accounts to avoid a previous ban.",
];

async function run() {
  const client = await pool.connect();
  console.log(`\n${LINE}`);
  console.log(" SkilledProz — Report System Seed Script");
  console.log(` Started: ${new Date().toLocaleString()}`);
  console.log(LINE);

  try {
    // ── Check if already seeded ───────────────────────────────────────────────
    const existing = await client.query(`SELECT COUNT(*) FROM "Report"`);
    const count = parseInt(existing.rows[0].count);
    if (count >= 10) {
      console.log(`\n⏭  Already have ${count} reports — skipping seed`);
      console.log(
        "  (Delete some reports from the DB if you want to re-seed)\n",
      );
      return;
    }
    console.log(`\n  Found ${count} existing reports — seeding now…`);

    // ── Fetch real user IDs from your DB ──────────────────────────────────────
    const usersRes = await client.query(
      `SELECT id, role FROM "User" WHERE "isActive" = true AND "isBanned" = false ORDER BY "createdAt" ASC LIMIT 20`,
    );
    if (usersRes.rows.length < 3) {
      console.error(
        "\n❌ Need at least 3 active users in the DB to seed reports.",
      );
      console.error("   Run your user seed first: node seed_global.js\n");
      process.exit(1);
    }

    const users = usersRes.rows;
    const adminRes = await client.query(
      `SELECT id FROM "User" WHERE role = 'ADMIN' LIMIT 1`,
    );
    const adminId = adminRes.rows[0]?.id || users[0].id;

    // ── Fetch some job posts and community posts to report ────────────────────
    const jobsRes = await client.query(`SELECT id FROM "JobPost" LIMIT 3`);
    const postsRes = await client.query(`SELECT id FROM "Post" LIMIT 2`);
    const jobs = jobsRes.rows.map((r) => r.id);
    const posts = postsRes.rows.map((r) => r.id);

    // ── Build sample reports ──────────────────────────────────────────────────
    const now = new Date();

    // Helper to get a user who is NOT the reporter
    const getTarget = (reporterIdx, offset = 1) =>
      users[(reporterIdx + offset) % users.length].id;

    const samples = [
      // 1. PENDING — user report
      {
        id: randomUUID(),
        reporterId: users[0].id,
        targetType: "USER",
        targetId: getTarget(0, 1),
        reason: "FRAUD",
        description: DESCRIPTIONS[3],
        evidence: ["https://example.com/screenshot1.jpg"],
        status: "PENDING",
        createdAt: new Date(now - 3600000 * 24 * 2),
      },
      // 2. PENDING — job post report
      {
        id: randomUUID(),
        reporterId: users[1].id,
        targetType: jobs[0] ? "JOB_POST" : "USER",
        targetId: jobs[0] || getTarget(1, 2),
        reason: "SCAM",
        description: DESCRIPTIONS[5],
        evidence: [],
        status: "PENDING",
        createdAt: new Date(now - 3600000 * 24 * 1),
      },
      // 3. PENDING — harassment
      {
        id: randomUUID(),
        reporterId: users[2].id,
        targetType: "USER",
        targetId: getTarget(2, 1),
        reason: "HARASSMENT",
        description: DESCRIPTIONS[4],
        evidence: ["https://example.com/msg-screenshot.png"],
        status: "PENDING",
        createdAt: new Date(now - 3600000 * 5),
      },
      // 4. PENDING — fake profile
      {
        id: randomUUID(),
        reporterId: users[Math.min(3, users.length - 1)].id,
        targetType: "USER",
        targetId: getTarget(3, 2),
        reason: "FAKE_PROFILE",
        description: DESCRIPTIONS[1],
        evidence: [],
        status: "PENDING",
        createdAt: new Date(now - 3600000 * 12),
      },
      // 5. REVIEWING — spam
      {
        id: randomUUID(),
        reporterId: users[0].id,
        targetType: posts[0] ? "POST" : "USER",
        targetId: posts[0] || getTarget(0, 3),
        reason: "SPAM",
        description: DESCRIPTIONS[0],
        evidence: [],
        status: "REVIEWING",
        reviewedById: adminId,
        createdAt: new Date(now - 3600000 * 48),
      },
      // 6. REVIEWING — inappropriate content
      {
        id: randomUUID(),
        reporterId: users[1].id,
        targetType: posts[1] ? "POST" : "USER",
        targetId: posts[1] || getTarget(1, 3),
        reason: "INAPPROPRIATE_CONTENT",
        description: DESCRIPTIONS[2],
        evidence: ["https://example.com/proof.jpg"],
        status: "REVIEWING",
        reviewedById: adminId,
        createdAt: new Date(now - 3600000 * 36),
      },
      // 7. RESOLVED — warning issued
      {
        id: randomUUID(),
        reporterId: users[2].id,
        targetType: "USER",
        targetId: getTarget(2, 2),
        reason: "MISLEADING_INFORMATION",
        description: DESCRIPTIONS[6],
        evidence: [],
        status: "RESOLVED",
        actionTaken: "WARNING_ISSUED",
        adminNote: "Sent warning. User acknowledged. First offense.",
        reviewedById: adminId,
        resolvedAt: new Date(now - 3600000 * 72),
        createdAt: new Date(now - 3600000 * 96),
      },
      // 8. RESOLVED — content removed
      {
        id: randomUUID(),
        reporterId: users[0].id,
        targetType: jobs[1] ? "JOB_POST" : "USER",
        targetId: jobs[1] || getTarget(0, 4),
        reason: "FRAUD",
        description: DESCRIPTIONS[3],
        evidence: ["https://example.com/fraud-evidence.jpg"],
        status: "RESOLVED",
        actionTaken: "CONTENT_REMOVED",
        adminNote: "Confirmed scam listing. Removed and user warned.",
        reviewedById: adminId,
        resolvedAt: new Date(now - 3600000 * 120),
        createdAt: new Date(now - 3600000 * 144),
      },
      // 9. RESOLVED — user suspended
      {
        id: randomUUID(),
        reporterId: users[1].id,
        targetType: "USER",
        targetId: getTarget(1, 4),
        reason: "HARASSMENT",
        description: DESCRIPTIONS[4],
        evidence: [
          "https://example.com/chat1.png",
          "https://example.com/chat2.png",
        ],
        status: "RESOLVED",
        actionTaken: "USER_SUSPENDED",
        adminNote:
          "Multiple harassment complaints. Account suspended pending full review.",
        reviewedById: adminId,
        resolvedAt: new Date(now - 3600000 * 24 * 5),
        createdAt: new Date(now - 3600000 * 24 * 6),
      },
      // 10. DISMISSED — no violation found
      {
        id: randomUUID(),
        reporterId: users[2].id,
        targetType: "USER",
        targetId: getTarget(2, 3),
        reason: "FAKE_REVIEWS",
        description: DESCRIPTIONS[7],
        evidence: [],
        status: "DISMISSED",
        actionTaken: "NO_ACTION",
        adminNote:
          "Reviewed the reviews — all appear to be from genuine verified bookings.",
        reviewedById: adminId,
        resolvedAt: new Date(now - 3600000 * 24 * 3),
        createdAt: new Date(now - 3600000 * 24 * 4),
      },
      // 11. DISMISSED — competitor trying to harm another user
      {
        id: randomUUID(),
        reporterId: users[0].id,
        targetType: "USER",
        targetId: getTarget(0, 5),
        reason: "SCAM",
        description: "Report doesn't have enough evidence to act on.",
        evidence: [],
        status: "DISMISSED",
        actionTaken: "NO_ACTION",
        adminNote:
          "No evidence of scam. Appears to be a competitive grievance. Dismissed.",
        reviewedById: adminId,
        resolvedAt: new Date(now - 3600000 * 24 * 7),
        createdAt: new Date(now - 3600000 * 24 * 8),
      },
      // 12. PENDING — hate speech (newest, most urgent)
      {
        id: randomUUID(),
        reporterId: users[Math.min(4, users.length - 1)].id,
        targetType: "USER",
        targetId: getTarget(4, 1),
        reason: "HATE_SPEECH",
        description: DESCRIPTIONS[9],
        evidence: ["https://example.com/screenshot-hs.jpg"],
        status: "PENDING",
        createdAt: new Date(now - 3600000 * 1), // 1 hour ago — most recent
      },
    ];

    // ── Insert with conflict handling ─────────────────────────────────────────
    let inserted = 0;
    let skipped = 0;

    for (const r of samples) {
      try {
        await client.query(
          `INSERT INTO "Report" (
            "id", "reporterId", "targetType", "targetId", "reason",
            "description", "evidence", "status", "actionTaken",
            "adminNote", "reviewedById", "resolvedAt", "createdAt", "updatedAt"
          ) VALUES (
            $1, $2, $3::\"ReportType\", $4, $5::\"ReportReason\",
            $6, $7, $8::\"ReportStatus\", $9::\"ReportAction\",
            $10, $11, $12, $13, $13
          ) ON CONFLICT DO NOTHING`,
          [
            r.id,
            r.reporterId,
            r.targetType,
            r.targetId,
            r.reason,
            r.description || null,
            r.evidence || [],
            r.status,
            r.actionTaken || null,
            r.adminNote || null,
            r.reviewedById || null,
            r.resolvedAt || null,
            r.createdAt,
          ],
        );
        console.log(
          `  ✓  ${r.status.padEnd(10)} | ${r.reason.padEnd(25)} | ${r.targetType}`,
        );
        inserted++;
      } catch (err) {
        // Skip if unique constraint fires (reporter+type+target already exists)
        if (err.code === "23505" || err.code === "P2002") {
          skipped++;
        } else {
          console.warn(`  ⚠  Skipped one sample: ${err.message}`);
          skipped++;
        }
      }
    }

    console.log(`\n${LINE}`);
    console.log(` ✅  Seed complete!`);
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
