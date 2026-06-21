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
    console.log("🔌 Connected to Railway database...");
    await client.query("BEGIN");

    // Add new columns to JobPost
    await client.query(`
      ALTER TABLE "JobPost"
        ADD COLUMN IF NOT EXISTS "salaryAmount"    DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS "salaryCurrency"  TEXT,
        ADD COLUMN IF NOT EXISTS "salaryPeriod"    TEXT,
        ADD COLUMN IF NOT EXISTS "educationLevel"  TEXT;
    `);
    console.log(
      "  ✅ Added salaryAmount, salaryCurrency, salaryPeriod, educationLevel",
    );

    // Optionally add indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS "JobPost_salaryCurrency_idx" ON "JobPost"("salaryCurrency");
      CREATE INDEX IF NOT EXISTS "JobPost_salaryPeriod_idx" ON "JobPost"("salaryPeriod");
    `);
    console.log("  ✅ Indexes created");

    await client.query("COMMIT");
    console.log("🎉 Migration complete!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
