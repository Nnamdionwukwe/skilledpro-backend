// scripts/diagnose-referral-discount.js
// ─────────────────────────────────────────────────────────────────────────────
// Diagnoses why referralDiscount is 0 on admin manual payment panel.
// Checks every layer: DB payment records, Referral table, refereePerk values.
//
// Run: node scripts/diagnose-referral-discount.js
// ─────────────────────────────────────────────────────────────────────────────

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

    // ── 1. Check all manual payment records ────────────────────────────────
    console.log("═══════════════════════════════════════════════════");
    console.log("§ 1  RECENT MANUAL PAYMENTS (last 20)");
    console.log("═══════════════════════════════════════════════════");

    const { rows: payments } = await client.query(`
      SELECT
        p.id,
        p."bookingId",
        p."userId",
        p.amount,
        p."platformFee",
        p."workerPayout",
        p.status,
        p.provider,
        p."createdAt",
        ROUND(
          GREATEST(0, COALESCE(p."workerPayout",0) + COALESCE(p."platformFee",0) - COALESCE(p.amount,0))::numeric,
          2
        ) AS "computedReferralDiscount",
        u.email AS "hirerEmail"
      FROM "Payment" p
      LEFT JOIN "User" u ON u.id = p."userId"
      WHERE p.provider IN ('bank_transfer','crypto')
      ORDER BY p."createdAt" DESC
      LIMIT 20
    `);

    if (payments.length === 0) {
      console.log("  No manual payments found.\n");
    } else {
      payments.forEach((p) => {
        const disc = parseFloat(p.computedReferralDiscount);
        const flag = disc > 0 ? "✅ HAS DISCOUNT" : "❌ discount=0";
        console.log(`\n  Payment ${p.id.slice(0, 8)}…`);
        console.log(`    Hirer:       ${p.hirerEmail}`);
        console.log(`    Provider:    ${p.provider}`);
        console.log(`    Status:      ${p.status}`);
        console.log(`    amount:      ${p.amount}`);
        console.log(`    platformFee: ${p.platformFee}`);
        console.log(`    workerPay:   ${p.workerPayout}`);
        console.log(
          `    gross:       ${(parseFloat(p.workerPayout || 0) + parseFloat(p.platformFee || 0)).toFixed(2)}`,
        );
        console.log(`    referralDisc: ${disc}  ${flag}`);
        console.log(`    Created:     ${p.createdAt}`);
      });
    }

    // ── 2. Check Referral table ─────────────────────────────────────────────
    console.log("\n═══════════════════════════════════════════════════");
    console.log("§ 2  REFERRAL TABLE");
    console.log("═══════════════════════════════════════════════════");

    // Check if Referral table exists
    const { rows: tableCheck } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name='Referral'
    `);

    if (tableCheck.length === 0) {
      console.log("  ❌ Referral table does NOT exist in the database.");
      console.log("  → Run migrate-referral.js first.\n");
    } else {
      const { rows: referrals } = await client.query(`
        SELECT
          r.id,
          r.status,
          r."referredRole",
          r."referrerBonus",
          r."refereePerk",
          r."expiresAt",
          r."convertedAt",
          r."paidAt",
          ref.email AS "referredEmail",
          rer.email AS "referrerEmail"
        FROM "Referral" r
        LEFT JOIN "User" ref ON ref.id = r."referredId"
        LEFT JOIN "User" rer ON rer.id = r."referrerId"
        ORDER BY r."createdAt" DESC
        LIMIT 20
      `);

      if (referrals.length === 0) {
        console.log("  ❌ No Referral records found.");
        console.log(
          "  → No hirer has been referred, so getHirerFirstBookingDiscount always returns 0.\n",
        );
      } else {
        referrals.forEach((r) => {
          let perk = {};
          try {
            perk = JSON.parse(r.refereePerk);
          } catch {}
          console.log(`\n  Referral ${r.id.slice(0, 8)}…`);
          console.log(
            `    Referred:    ${r.referredEmail}  (role: ${r.referredRole})`,
          );
          console.log(`    Referrer:    ${r.referrerEmail}`);
          console.log(`    Status:      ${r.status}`);
          console.log(`    refereePerk: ${r.refereePerk}`);
          console.log(`    perk.type:   ${perk.type || "(none)"}`);
          console.log(`    perk.value:  ${perk.value || "(none)"}`);
          console.log(`    perk.used:   ${perk.used ?? "(none)"}`);
          console.log(`    expiresAt:   ${r.expiresAt}`);
          console.log(`    convertedAt: ${r.convertedAt}`);
          console.log(
            `    Expired?     ${new Date(r.expiresAt) < new Date() ? "❌ YES — EXPIRED" : "✅ No"}`,
          );
        });
      }
    }

    // ── 3. Check User referral columns ─────────────────────────────────────
    console.log("\n═══════════════════════════════════════════════════");
    console.log("§ 3  USER REFERRAL COLUMNS (hirers only)");
    console.log("═══════════════════════════════════════════════════");

    const { rows: users } = await client
      .query(
        `
      SELECT
        u.id,
        u.email,
        u.role,
        u."referralCode",
        u."referredById",
        u."walletBalance"
      FROM "User" u
      WHERE u.role = 'HIRER'
      ORDER BY u."createdAt" DESC
      LIMIT 10
    `,
      )
      .catch(() => ({ rows: [] }));

    if (users.length === 0) {
      console.log("  No hirers found or referral columns missing.\n");
    } else {
      users.forEach((u) => {
        const hasRef = !!u.referredById;
        console.log(`\n  ${u.email}`);
        console.log(`    referralCode: ${u.referralCode || "(none)"}`);
        console.log(
          `    referredById: ${u.referredById || "(none)"}  ${hasRef ? "✅ was referred" : "❌ not referred"}`,
        );
        console.log(`    walletBalance: ${u.walletBalance}`);
      });
    }

    // ── 4. Check getHirerFirstBookingDiscount conditions ───────────────────
    console.log("\n═══════════════════════════════════════════════════");
    console.log("§ 4  getHirerFirstBookingDiscount SIMULATION");
    console.log("     (checks what the function would return per hirer)");
    console.log("═══════════════════════════════════════════════════");

    // The function typically:
    // 1. Finds the Referral for this hirer (where referredId = hirerId, referredRole = HIRER)
    // 2. Checks refereePerk JSON for { type: 'discount', value: X, used: false }
    // 3. Returns the discount value, or 0 if not found/used/expired

    const { rows: hirerReferrals } = await client
      .query(
        `
      SELECT
        r.*,
        u.email AS "hirerEmail",
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
    `,
      )
      .catch(() => ({ rows: [] }));

    if (hirerReferrals.length === 0) {
      console.log("\n  ❌ No HIRER referrals found.");
      console.log("  → getHirerFirstBookingDiscount returns 0 for everyone.\n");
      console.log("  To test this: sign up a new hirer using a referral code.");
    } else {
      hirerReferrals.forEach((r) => {
        let perk = {};
        try {
          perk = JSON.parse(r.refereePerk);
        } catch {}
        const expired = new Date(r.expiresAt) < new Date();
        const used = perk.used === true;
        const hasDiscount = perk.type === "discount" && !isNaN(perk.value);
        const completedPay = parseInt(r.completedPayments);
        const wouldReturn =
          hasDiscount && !used && !expired && completedPay === 0
            ? `✅ DISCOUNT = ${perk.value}`
            : `❌ returns 0 (used=${used}, expired=${expired}, hasDiscount=${hasDiscount}, completedPayments=${completedPay})`;

        console.log(`\n  Hirer: ${r.hirerEmail}`);
        console.log(`    refereePerk: ${r.refereePerk}`);
        console.log(`    status:      ${r.status}`);
        console.log(`    expired?     ${expired}`);
        console.log(`    perk.used?   ${used}`);
        console.log(`    completedPayments: ${completedPay}`);
        console.log(`    → getHirerFirstBookingDiscount would: ${wouldReturn}`);
      });
    }

    // ── 5. Summary ──────────────────────────────────────────────────────────
    console.log("\n═══════════════════════════════════════════════════");
    console.log("§ 5  DIAGNOSIS SUMMARY");
    console.log("═══════════════════════════════════════════════════");

    const paymentsWithDiscount = payments.filter(
      (p) => parseFloat(p.computedReferralDiscount) > 0,
    );

    if (paymentsWithDiscount.length > 0) {
      console.log(
        `\n✅ Found ${paymentsWithDiscount.length} payment(s) with referral discount > 0.`,
      );
      console.log("   The admin panel SHOULD be showing the banner for these.");
      console.log(
        "   If it's still not showing, the frontend fetch may need a hard refresh.\n",
      );
    } else {
      console.log("\n❌ All manual payments have referralDiscount = 0.");
      console.log("\n   Most likely cause:");
      console.log(
        "   A) No hirer has been referred — Referral table is empty.",
      );
      console.log(
        "      FIX: Test with a hirer who signed up via a referral link.",
      );
      console.log("");
      console.log(
        "   B) Referrals exist but refereePerk.used = true (already consumed).",
      );
      console.log(
        "      FIX: The discount can only apply once; create a fresh referral.",
      );
      console.log("");
      console.log("   C) Referrals exist but have EXPIRED.");
      console.log("      FIX: Check expiresAt in § 2 above.");
      console.log("");
      console.log("   D) Payments were created BEFORE the fix was applied.");
      console.log(
        "      FIX: Submit a new payment; old records won't be updated.",
      );
      console.log("");
      console.log(
        "   E) getHirerFirstBookingDiscount checks 'first booking only'",
      );
      console.log("      and this hirer already has a completed payment.");
      console.log(
        "      FIX: Use a brand-new hirer account that was referred.\n",
      );
    }
  } catch (err) {
    console.error("❌ Script error:", err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    console.log("🔌 Disconnected.");
  }
}

run();
