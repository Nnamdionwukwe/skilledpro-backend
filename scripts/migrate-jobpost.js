// scripts/migrate-jobpost.js
// Run with: node scripts/migrate-jobpost.js
//
// Adds the new JobPost columns directly to the Railway (production) database
// using raw SQL — same pattern as fix-review-constraint.js.
// No `prisma migrate dev` needed. Works against any Postgres URL in .env.

import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

async function migrateJobPost() {
  const client = await pool.connect();

  try {
    console.log("🔌 Connected to Railway database...");

    // ── 1. Check which columns already exist on JobPost ──────────────────────
    const { rows: existingCols } = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'JobPost'
      ORDER BY column_name;
    `);

    const cols = existingCols.map((r) => r.column_name);
    console.log("\n📋 Existing JobPost columns:", cols.join(", "));

    // ── 2. Create enums if they don't exist ──────────────────────────────────

    const enums = [
      {
        name: "JobType",
        values: ["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY"],
      },
      {
        name: "LocationType",
        values: ["REMOTE", "ON_SITE", "HYBRID"],
      },
      {
        name: "BudgetType",
        values: ["FIXED", "HOURLY", "DAILY", "WEEKLY", "MONTHLY", "CUSTOM"],
      },
      {
        name: "DurationType",
        values: ["HOURS", "DAYS", "WEEKS", "MONTHS", "CUSTOM"],
      },
    ];

    console.log("\n🔧 Checking enums...");

    for (const { name, values } of enums) {
      const { rows } = await client.query(
        `SELECT 1 FROM pg_type WHERE typname = $1`,
        [name],
      );

      if (rows.length > 0) {
        console.log(`  ⏭️  Enum "${name}" already exists — skipped`);
      } else {
        const valueList = values.map((v) => `'${v}'`).join(", ");
        await client.query(`CREATE TYPE "${name}" AS ENUM (${valueList});`);
        console.log(`  ➕  Created enum "${name}" (${values.join(" | ")})`);
      }
    }

    // ── 3. Make address optional (drop NOT NULL if present) ──────────────────

    console.log('\n🔧 Checking "address" nullability...');
    const { rows: addressInfo } = await client.query(`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_name = 'JobPost' AND column_name = 'address';
    `);

    if (addressInfo.length > 0 && addressInfo[0].is_nullable === "NO") {
      await client.query(
        `ALTER TABLE "JobPost" ALTER COLUMN "address" DROP NOT NULL;`,
      );
      console.log('  ✏️  "address" is now optional (nullable)');
    } else {
      console.log('  ⏭️  "address" is already nullable — skipped');
    }

    // ── 4. Add missing columns ───────────────────────────────────────────────

    const newColumns = [
      {
        name: "jobType",
        sql: `ALTER TABLE "JobPost" ADD COLUMN "jobType" "JobType" NOT NULL DEFAULT 'FULL_TIME';`,
      },
      {
        name: "locationType",
        sql: `ALTER TABLE "JobPost" ADD COLUMN "locationType" "LocationType" NOT NULL DEFAULT 'REMOTE';`,
      },
      {
        name: "budgetType",
        sql: `ALTER TABLE "JobPost" ADD COLUMN "budgetType" "BudgetType" NOT NULL DEFAULT 'FIXED';`,
      },
      {
        name: "durationType",
        sql: `ALTER TABLE "JobPost" ADD COLUMN "durationType" "DurationType" NOT NULL DEFAULT 'HOURS';`,
      },
      {
        name: "durationValue",
        sql: `ALTER TABLE "JobPost" ADD COLUMN "durationValue" TEXT;`,
      },
      {
        name: "skills",
        sql: `ALTER TABLE "JobPost" ADD COLUMN "skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];`,
      },
    ];

    console.log("\n🔧 Adding missing columns...");

    for (const col of newColumns) {
      if (cols.includes(col.name)) {
        console.log(`  ⏭️  Column "${col.name}" already exists — skipped`);
      } else {
        await client.query(col.sql);
        console.log(`  ➕  Added column "${col.name}"`);
      }
    }

    // ── 5. Verify final state ────────────────────────────────────────────────

    const { rows: finalCols } = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'JobPost'
      ORDER BY ordinal_position;
    `);

    console.log("\n📋 Final JobPost columns:");
    finalCols.forEach((c) => {
      console.log(
        `  - ${c.column_name.padEnd(20)} ${c.data_type.padEnd(24)} nullable=${c.is_nullable}`,
      );
    });

    console.log(
      "\n🎉 Migration complete! JobPost table is ready for the new fields.",
    );
  } catch (err) {
    console.error("\n❌ Migration failed:", err.message);
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    console.log("🔌 Database connection closed.");
  }
}

migrateJobPost();
