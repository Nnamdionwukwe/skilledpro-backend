// scripts/migrate-saved.js
// ─────────────────────────────────────────────────────────────────────────────
// Creates SavedWorker and SavedJob tables in Railway PostgreSQL
// Run: node scripts/migrate-saved.js
// Then: npx prisma generate
// ─────────────────────────────────────────────────────────────────────────────

import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});
const LINE = "─".repeat(70);

async function ensureTable(client, name, ddl) {
  const exists = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = $1`,
    [name],
  );
  if (exists.rows.length > 0) {
    console.log(`  ⏭  Table "${name}" already exists`);
    return false;
  }
  await client.query(ddl);
  console.log(`  ✓  Created table "${name}"`);
  return true;
}

async function ensureConstraint(client, name, sql) {
  const exists = await client.query(
    `SELECT 1 FROM pg_constraint WHERE conname = $1`,
    [name],
  );
  if (exists.rows.length > 0) {
    console.log(`  ⏭  "${name}" already exists`);
    return;
  }
  await client.query(sql);
  console.log(`  ✓  "${name}"`);
}

async function run() {
  const client = await pool.connect();
  console.log(`\n${LINE}`);
  console.log(" SkilledProz — SavedWorker & SavedJob Migration");
  console.log(` Started: ${new Date().toLocaleString()}`);
  console.log(LINE);

  try {
    await client.query("BEGIN");

    // ── 1. SavedWorker ────────────────────────────────────────────────────────
    console.log("\n[1/4] SavedWorker table…");
    await ensureTable(
      client,
      "SavedWorker",
      `
      CREATE TABLE "SavedWorker" (
        "id"        TEXT          NOT NULL,
        "hirerId"   TEXT          NOT NULL,
        "workerId"  TEXT          NOT NULL,
        "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SavedWorker_pkey" PRIMARY KEY ("id")
      )
    `,
    );

    // ── 2. SavedJob ───────────────────────────────────────────────────────────
    console.log("\n[2/4] SavedJob table…");
    await ensureTable(
      client,
      "SavedJob",
      `
      CREATE TABLE "SavedJob" (
        "id"        TEXT          NOT NULL,
        "workerId"  TEXT          NOT NULL,
        "jobPostId" TEXT          NOT NULL,
        "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SavedJob_pkey" PRIMARY KEY ("id")
      )
    `,
    );

    // ── 3. Unique constraints ─────────────────────────────────────────────────
    console.log("\n[3/4] Unique constraints + foreign keys…");

    await ensureConstraint(
      client,
      "SavedWorker_hirerId_workerId_key",
      `ALTER TABLE "SavedWorker" ADD CONSTRAINT "SavedWorker_hirerId_workerId_key" UNIQUE ("hirerId","workerId")`,
    );

    await ensureConstraint(
      client,
      "SavedJob_workerId_jobPostId_key",
      `ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_workerId_jobPostId_key" UNIQUE ("workerId","jobPostId")`,
    );

    // Foreign keys
    await ensureConstraint(
      client,
      "SavedWorker_hirerId_fkey",
      `ALTER TABLE "SavedWorker" ADD CONSTRAINT "SavedWorker_hirerId_fkey"
       FOREIGN KEY ("hirerId")  REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );

    await ensureConstraint(
      client,
      "SavedWorker_workerId_fkey",
      `ALTER TABLE "SavedWorker" ADD CONSTRAINT "SavedWorker_workerId_fkey"
       FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );

    await ensureConstraint(
      client,
      "SavedJob_workerId_fkey",
      `ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_workerId_fkey"
       FOREIGN KEY ("workerId")  REFERENCES "User"("id")     ON DELETE CASCADE ON UPDATE CASCADE`,
    );

    await ensureConstraint(
      client,
      "SavedJob_jobPostId_fkey",
      `ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_jobPostId_fkey"
       FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id")  ON DELETE CASCADE ON UPDATE CASCADE`,
    );

    // ── 4. Indexes ────────────────────────────────────────────────────────────
    console.log("\n[4/4] Indexes…");
    const indexes = [
      `CREATE INDEX IF NOT EXISTS "SavedWorker_hirerId_idx"  ON "SavedWorker" ("hirerId")`,
      `CREATE INDEX IF NOT EXISTS "SavedWorker_workerId_idx" ON "SavedWorker" ("workerId")`,
      `CREATE INDEX IF NOT EXISTS "SavedJob_workerId_idx"    ON "SavedJob"    ("workerId")`,
      `CREATE INDEX IF NOT EXISTS "SavedJob_jobPostId_idx"   ON "SavedJob"    ("jobPostId")`,
    ];
    for (const sql of indexes) {
      await client.query(sql);
      console.log(`  ✓  ${sql.match(/"([^"]+_idx)"/)[1]}`);
    }

    await client.query("COMMIT");
    console.log(`\n${LINE}`);
    console.log(" ✅  Migration complete!  Next: npx prisma generate");
    console.log(LINE + "\n");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ FAILED — rolled back:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
