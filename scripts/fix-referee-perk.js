// scripts/fix-referee-perk.js
// ─────────────────────────────────────────────────────────────────────────────
// ROOT CAUSE: Every Referral record has refereePerk = {}
// getHirerFirstBookingDiscount checks perk.type === 'discount' → always false
// → always returns 0 → no discount badge ever shows
//
// FIX PART 1 (this script): backfill existing HIRER referrals with the perk
// FIX PART 2 (manual):      update referral.controller.js createReferral fn
//                            to set refereePerk when the referred user is HIRER
//
// Run: REFERRAL_HIRER_DISCOUNT=500 node scripts/fix-referee-perk.js
//   or: node scripts/fix-referee-perk.js   (defaults to 500 NGN)
// ─────────────────────────────────────────────────────────────────────────────

import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const DISCOUNT_VALUE = parseFloat(process.env.REFERRAL_HIRER_DISCOUNT ?? "500");
const CURRENCY = process.env.REFERRAL_CURRENCY ?? "NGN";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

async function run() {
  const client = await pool.connect();
  try {
    console.log("🔌 Connected\n");
    console.log(
      `💡 Will set refereePerk = { type: 'discount', value: ${DISCOUNT_VALUE}, currency: '${CURRENCY}', used: false }`,
    );
    console.log(
      `   (Override with: REFERRAL_HIRER_DISCOUNT=1000 node scripts/fix-referee-perk.js)\n`,
    );

    const perk = JSON.stringify({
      type: "discount",
      value: DISCOUNT_VALUE,
      currency: CURRENCY,
      used: false,
    });

    // ── 1. Find all HIRER referrals with empty/invalid perk ─────────────────
    const { rows: toFix } = await client.query(`
      SELECT r.id, r.status, u.email
      FROM "Referral" r
      JOIN "User" u ON u.id = r."referredId"
      WHERE r."referredRole" = 'HIRER'
        AND (
          r."refereePerk" = '{}'
          OR r."refereePerk" IS NULL
          OR r."refereePerk"::text = '""'
          OR (r."refereePerk"->>'type') IS NULL
        )
    `);

    console.log(
      `📋 Found ${toFix.length} HIRER referral(s) with empty refereePerk:`,
    );
    toFix.forEach((r) =>
      console.log(
        `   • ${r.id.slice(0, 8)}… — ${r.email} (status: ${r.status})`,
      ),
    );

    if (toFix.length === 0) {
      console.log("   Nothing to update.\n");
    } else {
      await client.query("BEGIN");

      const ids = toFix.map((r) => r.id);
      const { rowCount } = await client.query(
        `UPDATE "Referral"
         SET "refereePerk" = $1::jsonb
         WHERE id = ANY($2::text[])
           AND "referredRole" = 'HIRER'`,
        [perk, ids],
      );

      await client.query("COMMIT");
      console.log(`\n✅ Updated ${rowCount} referral record(s).`);
    }

    // ── 2. Verify ────────────────────────────────────────────────────────────
    console.log("\n🔍 Verifying updated records:");
    const { rows: verified } = await client.query(`
      SELECT r.id, r."referredRole", r."refereePerk", u.email
      FROM "Referral" r
      JOIN "User" u ON u.id = r."referredId"
      WHERE r."referredRole" = 'HIRER'
      ORDER BY r."createdAt" DESC
      LIMIT 10
    `);

    verified.forEach((r) => {
      let p = {};
      try {
        p = r.refereePerk || {};
      } catch {}
      const ok = p.type === "discount" && p.value > 0 && p.used === false;
      console.log(
        `   ${ok ? "✅" : "❌"} ${r.email} — refereePerk: ${JSON.stringify(p)}`,
      );
    });

    // ── 3. Simulation: would getHirerFirstBookingDiscount now return > 0? ───
    console.log("\n🧪 Simulating getHirerFirstBookingDiscount after fix:");
    const { rows: sim } = await client.query(`
      SELECT
        r.id,
        r.status,
        r."refereePerk",
        r."expiresAt",
        u.email,
        (SELECT COUNT(*) FROM "Payment" p2
         JOIN "Booking" b ON b.id = p2."bookingId"
         WHERE b."hirerId" = r."referredId"
           AND p2.status IN ('HELD','RELEASED')
        ) AS "completedPayments"
      FROM "Referral" r
      JOIN "User" u ON u.id = r."referredId"
      WHERE r."referredRole" = 'HIRER'
        AND r.status NOT IN ('EXPIRED','FLAGGED')
      ORDER BY r."createdAt" DESC
      LIMIT 5
    `);

    sim.forEach((r) => {
      const p = r.refereePerk || {};
      const expired = new Date(r.expiresAt) < new Date();
      const used = p.used === true;
      const hasDisc = p.type === "discount" && p.value > 0;
      const noPrevPay = parseInt(r.completedPayments) === 0;
      const discount = hasDisc && !used && !expired && noPrevPay ? p.value : 0;
      console.log(
        `   ${discount > 0 ? "✅" : "❌"} ${r.email} → discount = ${discount} ${p.currency || ""}`,
      );
    });

    // ── 4. Instructions for referral.controller.js ───────────────────────────
    console.log(`
═══════════════════════════════════════════════════
PART 2: Fix referral.controller.js (new referrals)
═══════════════════════════════════════════════════

In your createReferral (or wherever Referral records are created),
find where you set refereePerk and add the discount for HIRER referrals:

  // FIND something like:
  await prisma.referral.create({
    data: {
      referrerId: referrer.id,
      referredId:  newUser.id,
      code:        referralCode,
      referredRole: newUser.role,
      expiresAt:   ...,
      refereePerk: {},    // ← THIS IS THE BUG
    }
  });

  // REPLACE refereePerk: {} WITH:
  refereePerk: newUser.role === 'HIRER'
    ? { type: 'discount', value: ${DISCOUNT_VALUE}, currency: '${CURRENCY}', used: false }
    : {},

This ensures every new referred hirer gets the discount perk populated.
Also update getHirerFirstBookingDiscount to mark perk.used = true after applying.
═══════════════════════════════════════════════════
`);

    console.log("🎉 Done — restart server and retest the payment flow.\n");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("❌ Failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    console.log("🔌 Disconnected.");
  }
}

run();
