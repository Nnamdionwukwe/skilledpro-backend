// scripts/add-paystack-subscription-fields.js
// Run with: node scripts/add-paystack-subscription-fields.js
// Adds Paystack fields to Subscription table and feePhase to Payment table

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

    // ── Subscription table: add Paystack fields ───────────────────────────────
    console.log("Adding Paystack fields to Subscription table...");

    await client.query(`
      ALTER TABLE "Subscription"
        ADD COLUMN IF NOT EXISTS "paystackSubscriptionCode" TEXT,
        ADD COLUMN IF NOT EXISTS "paystackCustomerCode"     TEXT,
        ADD COLUMN IF NOT EXISTS "paystackPlanCode"         TEXT,
        ADD COLUMN IF NOT EXISTS "paystackEmailToken"       TEXT,
        ADD COLUMN IF NOT EXISTS "nextPaymentDate"          TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "paystackStatus"           TEXT;
    `);
    console.log("  ✅ Paystack subscription fields added");

    // ── Subscription table: change currency default to NGN ────────────────────
    await client.query(`
      ALTER TABLE "Subscription"
        ALTER COLUMN "currency" SET DEFAULT 'NGN';
    `);
    console.log("  ✅ Subscription currency default updated to NGN");

    // ── Payment table: add feePhase for audit trail ───────────────────────────
    console.log("\nAdding feePhase to Payment table...");

    await client.query(`
      ALTER TABLE "Payment"
        ADD COLUMN IF NOT EXISTS "feePhase" INTEGER DEFAULT 1;
    `);
    console.log("  ✅ Payment.feePhase added");

    // ── Index for Paystack subscription lookups ───────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS "Subscription_paystackSubscriptionCode_idx"
        ON "Subscription"("paystackSubscriptionCode");
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS "Subscription_paystackCustomerCode_idx"
        ON "Subscription"("paystackCustomerCode");
    `);
    console.log("  ✅ Paystack indexes created");

    await client.query("COMMIT");
    console.log("\n🎉 Migration complete!");

    // ── Verify ────────────────────────────────────────────────────────────────
    const { rows } = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'Subscription'
        AND column_name IN (
          'paystackSubscriptionCode',
          'paystackCustomerCode',
          'paystackPlanCode',
          'paystackEmailToken',
          'nextPaymentDate',
          'paystackStatus',
          'currency'
        )
      ORDER BY column_name;
    `);
    console.log("\n📋 Verified Subscription columns:");
    rows.forEach((r) =>
      console.log(
        `   ${r.column_name}: ${r.data_type} (default: ${r.column_default})`,
      ),
    );

    const { rows: payRows } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Payment' AND column_name = 'feePhase';
    `);
    console.log(
      "\n📋 Payment.feePhase:",
      payRows.length ? "✅ exists" : "❌ missing",
    );
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
