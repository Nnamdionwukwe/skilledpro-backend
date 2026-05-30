// scripts/migrate-device-tokens.js
// ─────────────────────────────────────────────────────────────────────────────
// Adds DeviceToken table to Railway PostgreSQL
// Run: node scripts/migrate-device-tokens.js
// Then: npx prisma generate
// ─────────────────────────────────────────────────────────────────────────────

import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});
const LINE = "─".repeat(70);

async function run() {
  const client = await pool.connect();
  console.log(`\n${LINE}`);
  console.log(" SkilledProz — DeviceToken Migration");
  console.log(` Started: ${new Date().toLocaleString()}`);
  console.log(LINE);

  try {
    await client.query("BEGIN");

    // ── 1. DeviceToken table ─────────────────────────────────────────────────
    console.log("\n[1/4] Creating DeviceToken table…");

    const exists = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'DeviceToken'`,
    );

    if (exists.rows.length > 0) {
      console.log("  ⏭  Table already exists — ensuring all columns present");
      await client.query(
        `ALTER TABLE "DeviceToken" ADD COLUMN IF NOT EXISTS "platform"  TEXT`,
      );
      await client.query(
        `ALTER TABLE "DeviceToken" ADD COLUMN IF NOT EXISTS "active"    BOOLEAN NOT NULL DEFAULT true`,
      );
      await client.query(
        `ALTER TABLE "DeviceToken" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
      );
      console.log("  ✓  Columns ensured");
    } else {
      await client.query(`
        CREATE TABLE "DeviceToken" (
          "id"        TEXT          NOT NULL,
          "userId"    TEXT          NOT NULL,
          "token"     TEXT          NOT NULL,
          "platform"  TEXT,
          "active"    BOOLEAN       NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
        )
      `);
      console.log('  ✓  Created table "DeviceToken"');
    }

    // ── 2. Unique constraint ─────────────────────────────────────────────────
    console.log("\n[2/4] Adding unique constraint…");
    const uc = await client.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'DeviceToken_userId_token_key'`,
    );
    if (uc.rows.length === 0) {
      await client.query(`
        ALTER TABLE "DeviceToken"
          ADD CONSTRAINT "DeviceToken_userId_token_key"
          UNIQUE ("userId", "token")
      `);
      console.log("  ✓  UNIQUE (userId, token)");
    } else {
      console.log("  ⏭  Constraint already exists");
    }

    // ── 3. Foreign key ───────────────────────────────────────────────────────
    console.log("\n[3/4] Adding foreign key…");
    const fk = await client.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'DeviceToken_userId_fkey'`,
    );
    if (fk.rows.length === 0) {
      await client.query(`
        ALTER TABLE "DeviceToken"
          ADD CONSTRAINT "DeviceToken_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      `);
      console.log("  ✓  FK → User.id (cascade delete on user removal)");
    } else {
      console.log("  ⏭  FK already exists");
    }

    // ── 4. Indexes ───────────────────────────────────────────────────────────
    console.log("\n[4/4] Creating indexes…");
    const indexes = [
      {
        name: "DeviceToken_userId_idx",
        sql: `CREATE INDEX IF NOT EXISTS "DeviceToken_userId_idx" ON "DeviceToken" ("userId")`,
      },
      {
        name: "DeviceToken_token_idx",
        sql: `CREATE INDEX IF NOT EXISTS "DeviceToken_token_idx"  ON "DeviceToken" ("token")`,
      },
      {
        name: "DeviceToken_active_idx",
        sql: `CREATE INDEX IF NOT EXISTS "DeviceToken_active_idx" ON "DeviceToken" ("active")`,
      },
    ];
    for (const idx of indexes) {
      await client.query(idx.sql);
      console.log(`  ✓  Index "${idx.name}"`);
    }

    // updatedAt trigger
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN NEW."updatedAt" = CURRENT_TIMESTAMP; RETURN NEW; END;
      $$ language 'plpgsql'
    `);
    const trig = await client.query(
      `SELECT 1 FROM pg_trigger WHERE tgname = 'device_token_updated_at'`,
    );
    if (trig.rows.length === 0) {
      await client.query(`
        CREATE TRIGGER device_token_updated_at
        BEFORE UPDATE ON "DeviceToken"
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
      `);
      console.log("  ✓  updatedAt trigger");
    }

    await client.query("COMMIT");
    console.log(`\n${LINE}`);
    console.log(" ✅  Migration complete!");
    console.log("  Next: npx prisma generate");
    console.log(LINE + "\n");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ FAILED — rolled back:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
