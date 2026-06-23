import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 5,
});

async function addColumns() {
  const client = await pool.connect();
  try {
    console.log("🔍 Checking for missing columns in JobPost...");

    // Check which columns already exist
    const res = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'JobPost'
      AND column_name IN ('applicationEmail', 'applicationWhatsApp', 'applicationPhone')
    `);
    const existing = res.rows.map((r) => r.column_name);
    console.log("Existing columns:", existing.join(", ") || "none");

    // Add missing columns
    if (!existing.includes("applicationEmail")) {
      console.log("📦 Adding column applicationEmail...");
      await client.query(
        `ALTER TABLE "JobPost" ADD COLUMN "applicationEmail" TEXT;`,
      );
    }
    if (!existing.includes("applicationWhatsApp")) {
      console.log("📦 Adding column applicationWhatsApp...");
      await client.query(
        `ALTER TABLE "JobPost" ADD COLUMN "applicationWhatsApp" TEXT;`,
      );
    }
    if (!existing.includes("applicationPhone")) {
      console.log("📦 Adding column applicationPhone...");
      await client.query(
        `ALTER TABLE "JobPost" ADD COLUMN "applicationPhone" TEXT;`,
      );
    }

    // Verify skills exists (should already be there)
    const skillsCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'JobPost'
      AND column_name = 'skills'
    `);
    if (skillsCheck.rows.length === 0) {
      console.log("📦 Adding column skills (array)...");
      await client.query(
        `ALTER TABLE "JobPost" ADD COLUMN skills TEXT[] DEFAULT '{}';`,
      );
    } else {
      console.log("✅ skills column already exists.");
    }

    console.log("✅ All columns are up to date.");
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

addColumns();
