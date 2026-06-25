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
    console.log("🔌 Connected to Railway...");

    await client.query("BEGIN");

    // Add disputeReason
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='Booking' AND column_name='disputeReason') THEN
          ALTER TABLE "Booking" ADD COLUMN "disputeReason" TEXT;
        END IF;
      END $$;
    `);

    // Add disputeDescription
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='Booking' AND column_name='disputeDescription') THEN
          ALTER TABLE "Booking" ADD COLUMN "disputeDescription" TEXT;
        END IF;
      END $$;
    `);

    // Add disputeEvidence (JSON array for PostgreSQL – we'll store as JSONB)
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='Booking' AND column_name='disputeEvidence') THEN
          ALTER TABLE "Booking" ADD COLUMN "disputeEvidence" JSONB DEFAULT '[]'::jsonb;
        END IF;
      END $$;
    `);

    await client.query("COMMIT");
    console.log("✅ Dispute columns added to Booking table.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
