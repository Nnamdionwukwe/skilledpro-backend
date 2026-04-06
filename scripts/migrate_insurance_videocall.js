import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:fEWRzooUrCKKwRPHStLWAoJFCMtfRhyF@centerbeam.proxy.rlwy.net:17141/railway",
  ssl: false,
});

const migrations = [
  // Insurance on Booking
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "insuranceRef"    TEXT`,
    "Booking.insuranceRef",
  ],
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "insurancePlan"   TEXT`,
    "Booking.insurancePlan",
  ],
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "insurancePaidAt" TIMESTAMPTZ`,
    "Booking.insurancePaidAt",
  ],

  // VideoCall table
  [
    `CREATE TABLE IF NOT EXISTS "VideoCall" (
    "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "bookingId"   TEXT NOT NULL UNIQUE,
    "initiatorId" TEXT NOT NULL,
    "receiverId"  TEXT NOT NULL,
    "roomId"      TEXT NOT NULL UNIQUE,
    "status"      TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt"   TIMESTAMPTZ,
    "endedAt"     TIMESTAMPTZ,
    "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE
  )`,
    "VideoCall (table)",
  ],

  [
    `CREATE INDEX IF NOT EXISTS "VideoCall_bookingId_idx" ON "VideoCall"("bookingId")`,
    "VideoCall.bookingId_idx",
  ],
  [
    `CREATE INDEX IF NOT EXISTS "VideoCall_receiverId_idx" ON "VideoCall"("receiverId")`,
    "VideoCall.receiverId_idx",
  ],
  [
    `CREATE INDEX IF NOT EXISTS "VideoCall_initiatorId_idx" ON "VideoCall"("initiatorId")`,
    "VideoCall.initiatorId_idx",
  ],
];

async function run() {
  const client = await pool.connect();
  console.log("✅ Connected\n");
  let ok = 0,
    skip = 0;
  try {
    await client.query("BEGIN");
    for (const [sql, label] of migrations) {
      await client.query(sql);
      console.log(`  ✅ ${label}`);
      ok++;
    }
    await client.query("COMMIT");
    console.log(`\n🎉 Done — ${ok} applied`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}
run();
