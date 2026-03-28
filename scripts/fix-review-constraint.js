// scripts/fix-review-constraint.js
// Run with: node scripts/fix-review-constraint.js

import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

async function fixReviewConstraint() {
  const client = await pool.connect();

  try {
    console.log("🔌 Connected to Railway database...");

    // Step 1 — Check existing constraints on Review table
    const { rows: constraints } = await client.query(`
      SELECT conname, contype
      FROM pg_constraint
      WHERE conrelid = '"Review"'::regclass
      ORDER BY conname;
    `);

    console.log("\n📋 Current constraints on Review table:");
    constraints.forEach((c) =>
      console.log(
        `  - ${c.conname} (${c.contype === "u" ? "UNIQUE" : c.contype})`,
      ),
    );

    // Step 2 — Drop old single-column unique constraint if it exists
    const oldConstraint = constraints.find(
      (c) => c.conname === "Review_bookingId_key",
    );
    if (oldConstraint) {
      console.log('\n🗑  Dropping old constraint "Review_bookingId_key"...');
      await client.query(
        `ALTER TABLE "Review" DROP CONSTRAINT "Review_bookingId_key";`,
      );
      console.log("✅ Old constraint dropped.");
    } else {
      console.log(
        '\n⚠️  Old constraint "Review_bookingId_key" not found — skipping drop.',
      );
    }

    // Step 3 — Check if new composite constraint already exists
    const newConstraint = constraints.find(
      (c) => c.conname === "Review_bookingId_giverId_key",
    );
    if (!newConstraint) {
      console.log(
        '\n➕ Adding new composite constraint "Review_bookingId_giverId_key"...',
      );
      await client.query(`
        ALTER TABLE "Review"
        ADD CONSTRAINT "Review_bookingId_giverId_key"
        UNIQUE ("bookingId", "giverId");
      `);
      console.log("✅ New composite constraint added.");
    } else {
      console.log(
        '\n✅ New constraint "Review_bookingId_giverId_key" already exists — skipping.',
      );
    }

    // Step 4 — Verify final state
    const { rows: final } = await client.query(`
      SELECT conname, contype
      FROM pg_constraint
      WHERE conrelid = '"Review"'::regclass
      ORDER BY conname;
    `);

    console.log("\n📋 Final constraints on Review table:");
    final.forEach((c) =>
      console.log(
        `  - ${c.conname} (${c.contype === "u" ? "UNIQUE" : c.contype === "p" ? "PRIMARY KEY" : c.contype === "f" ? "FOREIGN KEY" : c.contype})`,
      ),
    );

    console.log(
      "\n🎉 Migration complete! Both hirer and worker can now leave reviews.",
    );
  } catch (err) {
    console.error("\n❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    console.log("🔌 Database connection closed.");
  }
}

fixReviewConstraint();
