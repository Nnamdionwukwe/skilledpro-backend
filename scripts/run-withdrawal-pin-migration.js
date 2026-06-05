#!/usr/bin/env node
// run-withdrawal-pin-migration.js
// Adds withdrawal PIN columns to the Railway User table
// node scripts/run-withdrawal-pin-migration.js

import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

async function run() {
  const client = await pool.connect();
  try {
    console.log("🔌 Connected to Railway\n");

    await client.query("BEGIN");

    await client.query(`
      ALTER TABLE "User"
        ADD COLUMN IF NOT EXISTS "withdrawalPin"             TEXT,
        ADD COLUMN IF NOT EXISTS "withdrawalPinSet"          BOOLEAN      NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS "withdrawalPinAttempts"     INTEGER      NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "withdrawalPinLockedUntil"  TIMESTAMPTZ
    `);

    await client.query("COMMIT");
    console.log("✅  Columns added successfully\n");

    // Verify
    const { rows } = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'User'
        AND column_name IN (
          'withdrawalPin',
          'withdrawalPinSet',
          'withdrawalPinAttempts',
          'withdrawalPinLockedUntil'
        )
      ORDER BY column_name
    `);

    console.log("Columns in DB:");
    rows.forEach((r) =>
      console.log(
        `  ✓ ${r.column_name.padEnd(30)} ${r.data_type}  default=${r.column_default}  nullable=${r.is_nullable}`,
      ),
    );

    console.log("\n✅  Migration complete.");
    console.log("   Next: npx prisma generate (to update the client)\n");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("❌  Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    console.log("🔌 Disconnected.");
  }
}

run();
