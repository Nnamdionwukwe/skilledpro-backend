// scripts/add-yearly-rate.js
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
    console.log("🔌 Connected...");
    await client.query("BEGIN");

    const { rows } = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'WorkerProfile' AND column_name = 'yearlyRate';
    `);

    if (rows.length === 0) {
      await client.query(`
        ALTER TABLE "WorkerProfile"
        ADD COLUMN "yearlyRate" DOUBLE PRECISION;
      `);
      console.log("✅ yearlyRate added");
    } else {
      console.log("⏩ yearlyRate already exists");
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌", err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
