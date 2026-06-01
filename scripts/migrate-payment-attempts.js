// scripts/migrate-payment-attempts.js
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

    // ── Step 1: Drop unique constraint on Payment.bookingId ──────────────────
    // Find the exact constraint name first (Prisma names it "Payment_bookingId_key")
    const { rows: constraints } = await client.query(`
      SELECT tc.constraint_name, tc.constraint_type, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema   = kcu.table_schema
      WHERE tc.table_name   = 'Payment'
        AND tc.table_schema = 'public'
        AND tc.constraint_type = 'UNIQUE'
        AND kcu.column_name = 'bookingId';
    `);

    if (constraints.length > 0) {
      const constraintName = constraints[0].constraint_name;
      console.log(`  Found unique constraint: "${constraintName}"`);
      await client.query(
        `ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "${constraintName}"`,
      );
      console.log(`  ✅ Dropped unique constraint on Payment.bookingId`);
    } else {
      console.log("  ✅ No unique constraint on bookingId — already migrated");
    }

    // ── Step 2: Add regular index for fast lookups (replaces the unique one) ─
    await client.query(`
      CREATE INDEX IF NOT EXISTS "Payment_bookingId_idx" ON "Payment"("bookingId")
    `);
    console.log("  ✅ Payment_bookingId_idx created");

    // ── Step 3: Add notes column if missing (stores rejection reasons) ────────
    await client.query(`
      ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "notes" TEXT
    `);
    console.log("  ✅ Payment.notes column ready");

    await client.query("COMMIT");
    console.log("\n🎉 Migration complete!\n");

    // ── Verify ────────────────────────────────────────────────────────────────
    const { rows: finalConstraints } = await client.query(`
      SELECT tc.constraint_name, tc.constraint_type, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema   = kcu.table_schema
      WHERE tc.table_name   = 'Payment'
        AND tc.table_schema = 'public'
        AND tc.constraint_type = 'UNIQUE'
        AND kcu.column_name = 'bookingId';
    `);

    if (finalConstraints.length > 0) {
      console.error(
        "❌ ERROR: Unique constraint still present — manual fix needed.",
      );
      process.exit(1);
    } else {
      console.log("📋 Verified: No unique constraint on Payment.bookingId");
      console.log("   Bookings can now store multiple payment attempts.\n");
    }

    const { rows: colCheck } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name  = 'Payment'
        AND table_schema = 'public'
        AND column_name = 'notes';
    `);
    if (colCheck.length > 0) {
      console.log("📋 Verified: Payment.notes column exists");
    }

    const { rows: idxCheck } = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'Payment'
        AND indexname = 'Payment_bookingId_idx';
    `);
    if (idxCheck.length > 0) {
      console.log("📋 Verified: Payment_bookingId_idx exists");
    }

    const { rows: countRows } = await client.query(
      `SELECT COUNT(*) AS count FROM "Payment"`,
    );
    console.log(
      `\n💳 ${countRows[0].count} existing payment record(s) — all preserved.`,
    );

    console.log("\nNext steps:");
    console.log("  1. Edit schema.prisma:");
    console.log(
      "     • Booking model:  payment Payment?        →  payments Payment[]",
    );
    console.log(
      "     • Payment model:  bookingId String @unique →  bookingId String",
    );
    console.log("  2. Run: npx prisma generate");
    console.log("  3. Apply payment-controller-attempts-fix.js patches\n");
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
