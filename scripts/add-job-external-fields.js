import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false, // set to true if required by Railway
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("🔌 Connected to Railway database...\n");
    await client.query("BEGIN");

    // Add columns to JobPost
    await client.query(`
      ALTER TABLE "JobPost"
        ADD COLUMN IF NOT EXISTS "companyName"  TEXT,
        ADD COLUMN IF NOT EXISTS "salaryText"   TEXT;
    `);
    console.log("  ✅ Added companyName and salaryText to JobPost");

    // Optionally add indexes (improves search performance)
    await client.query(`
      CREATE INDEX IF NOT EXISTS "JobPost_companyName_idx"
        ON "JobPost"("companyName");
    `);
    console.log("  ✅ Index on companyName created");

    await client.query("COMMIT");
    console.log("\n🎉 Migration complete!");

    // Verify
    const { rows } = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'JobPost'
        AND column_name IN ('companyName', 'salaryText')
      ORDER BY column_name;
    `);
    console.log("\n📋 Verified columns:");
    rows.forEach((r) => console.log(`   ${r.column_name}: ${r.data_type}`));
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
