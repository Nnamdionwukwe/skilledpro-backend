// scripts/migrate-report.js
// ─────────────────────────────────────────────────────────────────────────────
// Adds the Report / Flag system to Railway PostgreSQL
// NEVER use prisma migrate dev — raw SQL only
//
// Run:  node scripts/migrate-report.js
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

async function run() {
  const client = await pool.connect();
  console.log(`\n${LINE}`);
  console.log(" SkilledProz — Report / Flag System Migration");
  console.log(
    ` Database : ${process.env.DATABASE_URL?.split("@")[1] ?? "connected"}`,
  );
  console.log(` Started  : ${new Date().toLocaleString()}`);
  console.log(LINE);

  try {
    await client.query("BEGIN");

    // ── 1. Enums ──────────────────────────────────────────────────────────────
    console.log("\n[1/6] Creating enums…");

    const enums = [
      {
        name: "ReportType",
        values: ["USER", "JOB_POST", "POST", "REVIEW", "BOOKING", "MESSAGE"],
      },
      {
        name: "ReportReason",
        values: [
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
        ],
      },
      {
        name: "ReportStatus",
        values: ["PENDING", "REVIEWING", "RESOLVED", "DISMISSED"],
      },
      {
        name: "ReportAction",
        values: [
          "NO_ACTION",
          "WARNING_ISSUED",
          "CONTENT_REMOVED",
          "USER_SUSPENDED",
          "USER_BANNED",
        ],
      },
    ];

    for (const e of enums) {
      const exists = await client.query(
        `SELECT 1 FROM pg_type WHERE typname = $1 AND typtype = 'e'`,
        [e.name],
      );
      if (exists.rows.length > 0) {
        console.log(`  ⏭  Enum "${e.name}" already exists — skipping`);

        // Add any new values that may be missing (safe to run multiple times)
        for (const val of e.values) {
          const valExists = await client.query(
            `SELECT 1 FROM pg_enum pe
             JOIN pg_type pt ON pe.enumtypid = pt.oid
             WHERE pt.typname = $1 AND pe.enumlabel = $2`,
            [e.name, val],
          );
          if (valExists.rows.length === 0) {
            await client.query(
              `ALTER TYPE "${e.name}" ADD VALUE IF NOT EXISTS '${val}'`,
            );
            console.log(`  ➕  Added value "${val}" to enum "${e.name}"`);
          }
        }
      } else {
        const vals = e.values.map((v) => `'${v}'`).join(", ");
        await client.query(`CREATE TYPE "${e.name}" AS ENUM (${vals})`);
        console.log(`  ✓  Created enum "${e.name}"`);
      }
    }

    // ── 2. Report table ───────────────────────────────────────────────────────
    console.log("\n[2/6] Creating Report table…");

    const tableExists = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'Report'`,
    );

    if (tableExists.rows.length > 0) {
      console.log(
        '  ⏭  Table "Report" already exists — checking for missing columns',
      );

      // Idempotent column additions
      const columnChecks = [
        {
          col: "evidence",
          sql: `ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "evidence" TEXT[] DEFAULT ARRAY[]::TEXT[]`,
        },
        {
          col: "adminNote",
          sql: `ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "adminNote" TEXT`,
        },
        {
          col: "actionTaken",
          sql: `ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "actionTaken" "ReportAction"`,
        },
        {
          col: "reviewedById",
          sql: `ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT`,
        },
        {
          col: "resolvedAt",
          sql: `ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3)`,
        },
        {
          col: "updatedAt",
          sql: `ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
        },
      ];

      for (const c of columnChecks) {
        await client.query(c.sql);
        console.log(`  ✓  Column "${c.col}" ensured`);
      }
    } else {
      await client.query(`
        CREATE TABLE "Report" (
          "id"           TEXT          NOT NULL,
          "reporterId"   TEXT          NOT NULL,
          "targetType"   "ReportType"  NOT NULL,
          "targetId"     TEXT          NOT NULL,
          "reason"       "ReportReason" NOT NULL,
          "description"  TEXT,
          "evidence"     TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
          "status"       "ReportStatus" NOT NULL DEFAULT 'PENDING',
          "adminNote"    TEXT,
          "actionTaken"  "ReportAction",
          "reviewedById" TEXT,
          "resolvedAt"   TIMESTAMP(3),
          "createdAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

          CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
        )
      `);
      console.log('  ✓  Created table "Report"');
    }

    // ── 3. Unique constraint ──────────────────────────────────────────────────
    console.log("\n[3/6] Adding unique constraint…");

    const ucExists = await client.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'Report_reporterId_targetType_targetId_key'`,
    );
    if (ucExists.rows.length > 0) {
      console.log("  ⏭  Unique constraint already exists");
    } else {
      await client.query(`
        ALTER TABLE "Report"
          ADD CONSTRAINT "Report_reporterId_targetType_targetId_key"
          UNIQUE ("reporterId", "targetType", "targetId")
      `);
      console.log("  ✓  Unique constraint: one report per user per target");
    }

    // ── 4. Foreign keys ───────────────────────────────────────────────────────
    console.log("\n[4/6] Adding foreign keys…");

    const fkeys = [
      {
        name: "Report_reporterId_fkey",
        sql: `ALTER TABLE "Report"
              ADD CONSTRAINT "Report_reporterId_fkey"
              FOREIGN KEY ("reporterId") REFERENCES "User"("id")
              ON DELETE CASCADE ON UPDATE CASCADE`,
      },
      {
        name: "Report_reviewedById_fkey",
        sql: `ALTER TABLE "Report"
              ADD CONSTRAINT "Report_reviewedById_fkey"
              FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
              ON DELETE SET NULL ON UPDATE CASCADE`,
      },
    ];

    for (const fk of fkeys) {
      const exists = await client.query(
        `SELECT 1 FROM pg_constraint WHERE conname = $1`,
        [fk.name],
      );
      if (exists.rows.length > 0) {
        console.log(`  ⏭  FK "${fk.name}" already exists`);
      } else {
        await client.query(fk.sql);
        console.log(`  ✓  FK "${fk.name}"`);
      }
    }

    // ── 5. Indexes ────────────────────────────────────────────────────────────
    console.log("\n[5/6] Creating indexes…");

    const indexes = [
      {
        name: "Report_targetType_targetId_idx",
        sql: `CREATE INDEX IF NOT EXISTS "Report_targetType_targetId_idx"
              ON "Report" ("targetType", "targetId")`,
      },
      {
        name: "Report_status_idx",
        sql: `CREATE INDEX IF NOT EXISTS "Report_status_idx"
              ON "Report" ("status")`,
      },
      {
        name: "Report_reporterId_idx",
        sql: `CREATE INDEX IF NOT EXISTS "Report_reporterId_idx"
              ON "Report" ("reporterId")`,
      },
      {
        name: "Report_createdAt_idx",
        sql: `CREATE INDEX IF NOT EXISTS "Report_createdAt_idx"
              ON "Report" ("createdAt" DESC)`,
      },
      {
        name: "Report_reviewedById_idx",
        sql: `CREATE INDEX IF NOT EXISTS "Report_reviewedById_idx"
              ON "Report" ("reviewedById")`,
      },
    ];

    for (const idx of indexes) {
      await client.query(idx.sql);
      console.log(`  ✓  Index "${idx.name}"`);
    }

    // ── 6. updatedAt auto-update trigger ──────────────────────────────────────
    console.log("\n[6/6] Creating updatedAt trigger…");

    // Create the trigger function if it doesn't exist yet
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW."updatedAt" = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    const trigExists = await client.query(
      `SELECT 1 FROM pg_trigger WHERE tgname = 'report_updated_at_trigger'`,
    );
    if (trigExists.rows.length > 0) {
      console.log("  ⏭  Trigger already exists");
    } else {
      await client.query(`
        CREATE TRIGGER report_updated_at_trigger
        BEFORE UPDATE ON "Report"
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
      `);
      console.log("  ✓  updatedAt auto-trigger created");
    }

    await client.query("COMMIT");

    console.log(`\n${LINE}`);
    console.log(" ✅  Migration complete!");
    console.log(` Next step: npx prisma generate`);
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
