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

    // ── Add referralDeduct column if missing ──
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'Payment' AND column_name = 'referralDeduct'
        ) THEN
          ALTER TABLE "Payment" ADD COLUMN "referralDeduct" DOUBLE PRECISION DEFAULT 0;
        END IF;
      END $$;
    `);

    console.log("✅ referralDeduct column added/verified on Payment table.");

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
