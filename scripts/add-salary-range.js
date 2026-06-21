import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      ALTER TABLE "JobPost"
        ADD COLUMN IF NOT EXISTS "salaryMin" DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS "salaryMax" DOUBLE PRECISION;
    `);
    console.log("✅ Added salaryMin and salaryMax columns.");
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", err);
  } finally {
    client.release();
    await pool.end();
  }
}
migrate();
