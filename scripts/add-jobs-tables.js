// scripts/add-jobs-tables.js
// Run with: node scripts/add-jobs-tables.js

import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("🔌 Connected to Railway database...\n");

    await client.query("BEGIN");

    // ── Create enums ──────────────────────────────────────────────────────────
    console.log("Creating enums...");

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "JobPostStatus" AS ENUM ('OPEN', 'FILLED', 'CANCELLED', 'EXPIRED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    console.log("  ✅ JobPostStatus enum");

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    console.log("  ✅ ApplicationStatus enum");

    // ── Create JobPost table ──────────────────────────────────────────────────
    console.log("\nCreating JobPost table...");

    await client.query(`
      CREATE TABLE IF NOT EXISTS "JobPost" (
        "id"             TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
        "hirerId"        TEXT         NOT NULL,
        "categoryId"     TEXT         NOT NULL,
        "title"          TEXT         NOT NULL,
        "description"    TEXT         NOT NULL,
        "address"        TEXT         NOT NULL,
        "latitude"       DOUBLE PRECISION,
        "longitude"      DOUBLE PRECISION,
        "scheduledAt"    TIMESTAMP(3) NOT NULL,
        "estimatedHours" DOUBLE PRECISION,
        "budget"         DOUBLE PRECISION NOT NULL,
        "currency"       TEXT         NOT NULL DEFAULT 'NGN',
        "notes"          TEXT,
        "status"         "JobPostStatus" NOT NULL DEFAULT 'OPEN',
        "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "JobPost_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "JobPost_hirerId_fkey"
          FOREIGN KEY ("hirerId") REFERENCES "User"("id")
          ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT "JobPost_categoryId_fkey"
          FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
          ON UPDATE CASCADE ON DELETE RESTRICT
      );
    `);
    console.log("  ✅ JobPost table created");

    // ── Create JobApplication table ───────────────────────────────────────────
    console.log("\nCreating JobApplication table...");

    await client.query(`
      CREATE TABLE IF NOT EXISTS "JobApplication" (
        "id"          TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
        "jobPostId"   TEXT         NOT NULL,
        "workerId"    TEXT         NOT NULL,
        "message"     TEXT,
        "status"      "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
        "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "JobApplication_jobPostId_fkey"
          FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id")
          ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT "JobApplication_workerId_fkey"
          FOREIGN KEY ("workerId") REFERENCES "User"("id")
          ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT "JobApplication_jobPostId_workerId_key"
          UNIQUE ("jobPostId", "workerId")
      );
    `);
    console.log("  ✅ JobApplication table created");

    // ── Create indexes ────────────────────────────────────────────────────────
    console.log("\nCreating indexes...");

    await client.query(
      `CREATE INDEX IF NOT EXISTS "JobPost_hirerId_idx" ON "JobPost"("hirerId");`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "JobPost_categoryId_idx" ON "JobPost"("categoryId");`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "JobPost_status_idx" ON "JobPost"("status");`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "JobApplication_workerId_idx" ON "JobApplication"("workerId");`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "JobApplication_jobPostId_idx" ON "JobApplication"("jobPostId");`,
    );
    console.log("  ✅ Indexes created");

    await client.query("COMMIT");

    console.log(
      "\n🎉 Migration complete! JobPost and JobApplication tables are ready.",
    );

    // ── Verify ────────────────────────────────────────────────────────────────
    const { rows } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('JobPost', 'JobApplication')
      ORDER BY table_name;
    `);
    console.log(
      "\n📋 Verified tables:",
      rows.map((r) => r.table_name).join(", "),
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    console.log("🔌 Connection closed.");
  }
}

migrate();
