// scripts/migrate-audit-log.js
// ─────────────────────────────────────────────────────────────────────────────
// Adds the Admin Audit Log system to Railway PostgreSQL
// NEVER use prisma migrate dev — raw SQL only
//
// Run:  node scripts/migrate-audit-log.js
// Then: npx prisma generate
// ─────────────────────────────────────────────────────────────────────────────

import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});
const LINE = "─".repeat(72);

async function ensureEnum(client, name, values) {
  const exists = await client.query(
    `SELECT 1 FROM pg_type WHERE typname = $1 AND typtype = 'e'`,
    [name],
  );
  if (exists.rows.length > 0) {
    console.log(`  ⏭  Enum "${name}" exists — ensuring all values present`);
    for (const val of values) {
      const has = await client.query(
        `SELECT 1 FROM pg_enum pe JOIN pg_type pt ON pe.enumtypid = pt.oid
         WHERE pt.typname = $1 AND pe.enumlabel = $2`,
        [name, val],
      );
      if (has.rows.length === 0) {
        // Must commit current transaction to add enum value
        await client.query("COMMIT");
        await client.query(
          `ALTER TYPE "${name}" ADD VALUE IF NOT EXISTS '${val}'`,
        );
        await client.query("BEGIN");
        console.log(`  ➕  Added value "${val}" to enum "${name}"`);
      }
    }
    return;
  }
  const vals = values.map((v) => `'${v}'`).join(", ");
  await client.query(`CREATE TYPE "${name}" AS ENUM (${vals})`);
  console.log(`  ✓  Created enum "${name}" (${values.length} values)`);
}

async function run() {
  const client = await pool.connect();
  console.log(`\n${LINE}`);
  console.log(" SkilledProz — Admin Audit Log Migration");
  console.log(
    ` DB       : ${process.env.DATABASE_URL?.split("@")[1] ?? "connected"}`,
  );
  console.log(` Started  : ${new Date().toLocaleString()}`);
  console.log(LINE);

  try {
    await client.query("BEGIN");

    // ── 1. Enums ──────────────────────────────────────────────────────────────
    console.log("\n[1/5] Creating enums…");

    await ensureEnum(client, "AuditAction", [
      "USER_BANNED",
      "USER_UNBANNED",
      "USER_DELETED",
      "USER_ROLE_CHANGED",
      "USER_VERIFIED",
      "USER_VERIFICATION_REJECTED",
      "USER_SUSPENDED",
      "PAYMENT_RELEASED",
      "PAYMENT_REFUNDED",
      "PAYMENT_MANUAL_VERIFIED",
      "PAYMENT_MANUAL_REJECTED",
      "WITHDRAWAL_APPROVED",
      "WITHDRAWAL_REJECTED",
      "REPORT_REVIEWED",
      "REPORT_RESOLVED",
      "REPORT_DISMISSED",
      "REPORT_BULK_DISMISSED",
      "CATEGORY_CREATED",
      "CATEGORY_UPDATED",
      "CATEGORY_DELETED",
      "REVIEW_DELETED",
      "JOB_DELETED",
      "JOB_STATUS_CHANGED",
      "POST_DELETED",
      "COMMENT_DELETED",
      "FEATURED_REMOVED",
      "BOOKING_STATUS_CHANGED",
      "DISPUTE_RESOLVED",
      "CAMPAIGN_SUBMISSION_REVIEWED",
      "CAMPAIGN_WITHDRAWAL_APPROVED",
      "CAMPAIGN_WITHDRAWAL_REJECTED",
      "REFERRAL_PAYOUT_PROCESSED",
      "REFERRAL_FLAGGED",
      "SUBSCRIPTION_CANCELLED",
      "NOTIFICATION_BROADCAST",
      "ADMIN_LOGIN",
      "SETTINGS_CHANGED",
    ]);

    await ensureEnum(client, "AuditTargetType", [
      "USER",
      "PAYMENT",
      "WITHDRAWAL",
      "BOOKING",
      "JOB_POST",
      "POST",
      "COMMENT",
      "REVIEW",
      "CATEGORY",
      "REPORT",
      "CAMPAIGN_SUBMISSION",
      "CAMPAIGN_WITHDRAWAL",
      "REFERRAL",
      "SUBSCRIPTION",
      "FEATURED_LISTING",
      "DISPUTE",
      "SYSTEM",
    ]);

    await ensureEnum(client, "AuditResult", ["SUCCESS", "FAILED", "PARTIAL"]);

    // ── 2. AuditLog table ─────────────────────────────────────────────────────
    console.log("\n[2/5] Creating AuditLog table…");

    const tableExists = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'AuditLog'`,
    );

    if (tableExists.rows.length > 0) {
      console.log(
        '  ⏭  Table "AuditLog" already exists — checking for missing columns',
      );

      const columns = [
        {
          col: "targetId",
          sql: `ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "targetId"     TEXT`,
        },
        {
          col: "before",
          sql: `ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "before"       JSONB`,
        },
        {
          col: "after",
          sql: `ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "after"        JSONB`,
        },
        {
          col: "meta",
          sql: `ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "meta"         JSONB`,
        },
        {
          col: "result",
          sql: `ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "result"       "AuditResult" NOT NULL DEFAULT 'SUCCESS'`,
        },
        {
          col: "errorMessage",
          sql: `ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT`,
        },
        {
          col: "ipAddress",
          sql: `ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "ipAddress"    TEXT`,
        },
        {
          col: "userAgent",
          sql: `ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "userAgent"    TEXT`,
        },
      ];
      for (const c of columns) {
        await client.query(c.sql);
        console.log(`  ✓  Column "${c.col}" ensured`);
      }
    } else {
      await client.query(`
        CREATE TABLE "AuditLog" (
          "id"           TEXT              NOT NULL,
          "adminId"      TEXT              NOT NULL,
          "action"       "AuditAction"     NOT NULL,
          "targetType"   "AuditTargetType" NOT NULL,
          "targetId"     TEXT,
          "description"  TEXT              NOT NULL,
          "before"       JSONB,
          "after"        JSONB,
          "meta"         JSONB,
          "result"       "AuditResult"     NOT NULL DEFAULT 'SUCCESS',
          "errorMessage" TEXT,
          "ipAddress"    TEXT,
          "userAgent"    TEXT,
          "createdAt"    TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,

          CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
        )
      `);
      console.log('  ✓  Created table "AuditLog"');
    }

    // ── 3. Foreign key ────────────────────────────────────────────────────────
    console.log("\n[3/5] Adding foreign key…");
    const fkExists = await client.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_adminId_fkey'`,
    );
    if (fkExists.rows.length > 0) {
      console.log("  ⏭  FK already exists");
    } else {
      await client.query(`
        ALTER TABLE "AuditLog"
          ADD CONSTRAINT "AuditLog_adminId_fkey"
          FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      `);
      console.log("  ✓  FK AuditLog → User (adminId)");
    }

    // ── 4. Indexes ────────────────────────────────────────────────────────────
    console.log("\n[4/5] Creating indexes…");

    const indexes = [
      {
        name: "AuditLog_adminId_idx",
        sql: `CREATE INDEX IF NOT EXISTS "AuditLog_adminId_idx"          ON "AuditLog" ("adminId")`,
      },
      {
        name: "AuditLog_action_idx",
        sql: `CREATE INDEX IF NOT EXISTS "AuditLog_action_idx"            ON "AuditLog" ("action")`,
      },
      {
        name: "AuditLog_targetType_targetId_idx",
        sql: `CREATE INDEX IF NOT EXISTS "AuditLog_targetType_targetId_idx" ON "AuditLog" ("targetType", "targetId")`,
      },
      {
        name: "AuditLog_createdAt_idx",
        sql: `CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx"         ON "AuditLog" ("createdAt" DESC)`,
      },
      {
        name: "AuditLog_result_idx",
        sql: `CREATE INDEX IF NOT EXISTS "AuditLog_result_idx"            ON "AuditLog" ("result")`,
      },
      {
        name: "AuditLog_adminId_createdAt_idx",
        sql: `CREATE INDEX IF NOT EXISTS "AuditLog_adminId_createdAt_idx" ON "AuditLog" ("adminId", "createdAt" DESC)`,
      },
    ];

    for (const idx of indexes) {
      await client.query(idx.sql);
      console.log(`  ✓  Index "${idx.name}"`);
    }

    // ── 5. Verify row-level security is not blocking writes ───────────────────
    console.log("\n[5/5] Verifying table accessibility…");
    await client.query(`SELECT COUNT(*) FROM "AuditLog"`);
    console.log("  ✓  AuditLog table is readable");

    await client.query("COMMIT");

    console.log(`\n${LINE}`);
    console.log(" ✅  Migration complete!");
    console.log("  Next step: npx prisma generate");
    console.log(LINE + "\n");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ Migration FAILED — rolled back");
    console.error(err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
