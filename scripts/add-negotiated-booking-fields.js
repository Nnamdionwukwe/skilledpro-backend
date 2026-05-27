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

    await client.query(`
      ALTER TABLE "Booking"
        ADD COLUMN IF NOT EXISTS "isNegotiated"    BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "negotiatedRate"   DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS "negotiationNote"  TEXT;
    `);
    console.log("  ✅ Negotiated rate fields added to Booking");

    await client.query(`
      CREATE INDEX IF NOT EXISTS "Booking_isNegotiated_idx"
        ON "Booking"("isNegotiated");
    `);
    console.log("  ✅ Index created");

    await client.query("COMMIT");
    console.log("\n🎉 Migration complete!");

    const { rows } = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'Booking'
        AND column_name IN ('isNegotiated', 'negotiatedRate', 'negotiationNote')
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
