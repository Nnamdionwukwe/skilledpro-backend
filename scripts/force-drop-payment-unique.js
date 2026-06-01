// scripts/force-drop-payment-unique.js
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
    console.log("🔌 Connected\n");

    // ── 1. Show every index on Payment and its definition ─────────────────
    console.log('📑 All indexes on "Payment":');
    const { rows: indexes } = await client.query(`
      SELECT indexname, indexdef
      FROM   pg_indexes
      WHERE  tablename = 'Payment'
      ORDER  BY indexname;
    `);

    if (indexes.length === 0) {
      console.log("   (none)");
    } else {
      indexes.forEach((r) =>
        console.log(`   "${r.indexname}"\n      ${r.indexdef}`),
      );
    }

    // ── 2. Drop every UNIQUE index that covers bookingId (not PK) ─────────
    console.log('\n🗑️  Dropping unique indexes on "bookingId"...');
    let dropped = 0;
    for (const { indexname, indexdef } of indexes) {
      const isUnique = indexdef.toUpperCase().includes("UNIQUE");
      const onBookingId =
        indexdef.includes('"bookingId"') || indexdef.includes("bookingId");
      const isPrimaryKey = indexname.includes("pkey");

      if (isUnique && onBookingId && !isPrimaryKey) {
        console.log(`   Dropping "${indexname}"...`);
        await client.query(`DROP INDEX IF EXISTS "${indexname}"`);
        console.log(`   ✅ Dropped.`);
        dropped++;
      }
    }
    if (dropped === 0) console.log("   Nothing to drop.");

    // ── 3. Drop any unique CONSTRAINT on bookingId (belt-and-suspenders) ──
    console.log('\n🗑️  Dropping unique constraints on "bookingId"...');
    const { rows: uqs } = await client.query(`
      SELECT tc.constraint_name
      FROM   information_schema.table_constraints  tc
      JOIN   information_schema.key_column_usage   kcu
             ON  tc.constraint_name = kcu.constraint_name
             AND tc.table_schema    = kcu.table_schema
      WHERE  tc.table_name      = 'Payment'
        AND  tc.table_schema    = 'public'
        AND  tc.constraint_type = 'UNIQUE'
        AND  kcu.column_name    = 'bookingId';
    `);

    if (uqs.length === 0) {
      console.log("   Nothing to drop.");
    } else {
      for (const { constraint_name } of uqs) {
        await client.query(
          `ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "${constraint_name}"`,
        );
        console.log(`   ✅ Dropped constraint "${constraint_name}"`);
      }
    }

    // ── 4. Ensure a plain (non-unique) index exists ────────────────────────
    console.log('\n📑 Ensuring plain index "Payment_bookingId_idx"...');
    await client.query(
      `CREATE INDEX IF NOT EXISTS "Payment_bookingId_idx" ON "Payment"("bookingId")`,
    );
    console.log("   ✅ Ready.");

    // ── 5. Final check — list all indexes again ────────────────────────────
    console.log("\n🔍 Final index state:");
    const { rows: finalIdx } = await client.query(`
      SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'Payment' ORDER BY indexname
    `);
    finalIdx.forEach((r) => {
      const flag = r.indexdef.toUpperCase().includes("UNIQUE")
        ? "⚠️  UNIQUE"
        : "✅ plain ";
      console.log(`   ${flag}  "${r.indexname}"`);
    });

    const stillUnique = finalIdx.filter(
      (r) =>
        r.indexdef.toUpperCase().includes("UNIQUE") &&
        r.indexdef.includes("bookingId") &&
        !r.indexname.includes("pkey"),
    );

    if (stillUnique.length > 0) {
      console.log("\n❌ Unique constraint/index still present. Check above.");
      process.exit(1);
    }

    console.log(
      "\n✅ bookingId is no longer unique — multiple payment attempts now work.",
    );

    // ── 6. Quick insert test ───────────────────────────────────────────────
    // Try inserting two payments with the same bookingId to confirm.
    // Uses an existing bookingId from the DB (read-only peek, then rollback).
    const { rows: sample } = await client.query(
      `SELECT "bookingId" FROM "Payment" LIMIT 1`,
    );

    if (sample.length > 0) {
      const testBookingId = sample[0].bookingId;
      try {
        await client.query("SAVEPOINT test_insert");
        await client.query(
          `INSERT INTO "Payment" ("id","bookingId","userId","amount","currency","status","provider","providerRef","createdAt","updatedAt")
           VALUES (gen_random_uuid()::text, $1, 'test', 0, 'NGN', 'PENDING', 'test', 'TEST-REF', NOW(), NOW())`,
          [testBookingId],
        );
        await client.query("ROLLBACK TO SAVEPOINT test_insert");
        console.log(
          `\n🧪 Insert test: ✅ Second payment for bookingId "${testBookingId}" succeeded (rolled back).`,
        );
      } catch (e) {
        await client.query("ROLLBACK TO SAVEPOINT test_insert");
        console.log(`\n🧪 Insert test: ❌ Still blocked — ${e.message}`);
        console.log(
          "   The schema.prisma may still have @unique on bookingId.",
        );
        console.log(
          "   Check: grep -n '@unique\\|bookingId' prisma/schema.prisma",
        );
        process.exit(1);
      }
    }

    console.log("\n🎉 All done.\n");
  } catch (err) {
    console.error("\n❌ Failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    console.log("🔌 Disconnected.");
  }
}

run();
