// scripts/seed-referred-hirer.js
// ─────────────────────────────────────────────────────────────────────────────
// Creates a fresh HIRER test account in Railway that was referred by
// gestechc@gmail.com, so you can test the referral discount end-to-end.
//
// Run: node scripts/seed-referred-hirer.js
// ─────────────────────────────────────────────────────────────────────────────

import pg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import crypto from "crypto";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

// ── Config ────────────────────────────────────────────────────────────────────
const TEST_HIRER = {
  email: "ref.hirer.test@test.sp",
  password: "Test1234!", // plain — will be hashed
  firstName: "RefTest",
  lastName: "Hirer",
};

// REFEREE_PERKS.HIRER from referral.controller.js
const HIRER_PERK = {
  type: "FIRST_BOOKING_DISCOUNT",
  discountRate: 0.05,
  maxDiscountAmount: 2500,
  cashBonus: 150,
  description: "5% off first booking (up to ₦2,500) + ₦150 wallet credit",
};

async function run() {
  const client = await pool.connect();
  try {
    console.log("🔌 Connected to Railway\n");

    // ── 1. Find gestechc (the referrer) ──────────────────────────────────────
    const {
      rows: [referrer],
    } = await client.query(
      `SELECT id, "referralCode", "referralTier" FROM "User" WHERE email = 'gestechc@gmail.com' LIMIT 1`,
    );
    if (!referrer) {
      console.error(
        "❌ gestechc@gmail.com not found — cannot create referral.",
      );
      process.exit(1);
    }
    console.log(
      `✅ Referrer found: gestechc (id: ${referrer.id}, code: ${referrer.referralCode}, tier: ${referrer.referralTier})`,
    );

    // ── 2. Check if test hirer already exists ─────────────────────────────────
    const { rows: existing } = await client.query(
      `SELECT id FROM "User" WHERE email = $1`,
      [TEST_HIRER.email],
    );

    let hirerId;

    if (existing.length > 0) {
      hirerId = existing[0].id;
      console.log(
        `ℹ️  Test hirer already exists (id: ${hirerId}) — updating referral record.`,
      );
    } else {
      // ── 3. Create the hirer user ───────────────────────────────────────────
      const hash = await bcrypt.hash(TEST_HIRER.password, 10);
      const newId = crypto.randomUUID();

      await client.query(
        `
        INSERT INTO "User" (
          id, email, password, "firstName", "lastName", role,
          "isActive", "isEmailVerified", "referredById",
          "walletBalance", "walletLifetimeTotal", "referralTier",
          "totalReferrals", "successfulReferrals",
          "createdAt", "updatedAt"
        ) VALUES (
          $1,$2,$3,$4,$5,'HIRER',
          true, true, $6,
          150, 150, 'BRONZE',
          0, 0,
          NOW(), NOW()
        )
      `,
        [
          newId,
          TEST_HIRER.email,
          hash,
          TEST_HIRER.firstName,
          TEST_HIRER.lastName,
          referrer.id,
        ],
      );

      hirerId = newId;
      console.log(`✅ Created hirer: ${TEST_HIRER.email}  (id: ${hirerId})`);
      console.log(`   Password: ${TEST_HIRER.password}`);
      console.log(`   walletBalance seeded with ₦150 signup credit`);
    }

    // ── 4. Upsert Referral record with correct perk ───────────────────────────
    // Delete old referral for this user if any (to start fresh)
    await client.query(`DELETE FROM "Referral" WHERE "referredId" = $1`, [
      hirerId,
    ]);

    const refId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 90 * 86_400_000); // 90 days

    await client.query(
      `
      INSERT INTO "Referral" (
        id, "referrerId", "referredId", code, status,
        "referredRole", "referrerBonus", "refereePerk", currency,
        "expiresAt", "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, 'QUALIFIED',
        'HIRER', 600, $5, 'NGN',
        $6, NOW(), NOW()
      )
    `,
      [
        refId,
        referrer.id,
        hirerId,
        referrer.referralCode || "SPTEST01",
        JSON.stringify(HIRER_PERK),
        expiresAt,
      ],
    );

    console.log(
      `✅ Referral record created (status: QUALIFIED, perk stored correctly)`,
    );

    // ── 5. Also fix ALL existing HIRER referral records with empty perk ───────
    const { rowCount } = await client.query(
      `
      UPDATE "Referral"
      SET "refereePerk" = $1::jsonb
      WHERE "referredRole" = 'HIRER'
        AND (
          "refereePerk"::text = '{}'
          OR "refereePerk" IS NULL
          OR ("refereePerk" -> 'type') IS NULL
        )
    `,
      [JSON.stringify(HIRER_PERK)],
    );

    if (rowCount > 0) {
      console.log(
        `✅ Fixed ${rowCount} existing HIRER referral record(s) with empty refereePerk`,
      );
    }

    // ── 6. Verify ─────────────────────────────────────────────────────────────
    console.log("\n🔍 Final state:");
    const { rows: check } = await client.query(
      `
      SELECT
        r.status,
        r."refereePerk",
        r."expiresAt",
        u.email,
        u."referredById"
      FROM "Referral" r
      JOIN "User" u ON u.id = r."referredId"
      WHERE r."referredId" = $1
    `,
      [hirerId],
    );

    if (check.length > 0) {
      const r = check[0];
      const perk = r.refereePerk;
      console.log(`   Email:        ${r.email}`);
      console.log(`   referredById: ${r.referredById}`);
      console.log(`   status:       ${r.status}`);
      console.log(`   refereePerk:  ${JSON.stringify(perk)}`);
      console.log(`   expiresAt:    ${r.expiresAt}`);
      console.log(`   perk.type:    ${perk?.type}`);
      console.log(`   perk.discountRate: ${perk?.discountRate}`);
    }

    console.log(`
════════════════════════════════════════════════════
✅  SEED COMPLETE — HOW TO TEST
════════════════════════════════════════════════════

1. Log in as the referred hirer:
   Email:    ${TEST_HIRER.email}
   Password: ${TEST_HIRER.password}

2. Create a booking (any worker) and accept it.

3. Initiate a bank transfer or crypto payment.
   For a ₦10,000 job:
     platform fee  = ₦500
     total gross   = ₦10,500
     5% discount   = ₦500  (5% of agreedRate, max ₦2,500)
     charged       = ₦10,000

4. Confirm the payment (upload any receipt image).

5. Admin panel → Manual Payments → Pending.
   You will see: 🎁 −NGN 500 referral  banner ✓

NOTE: The discount only applies once (first booking).
After one HELD payment, completedBookings check won't
block it yet — it's based on COMPLETED status.
════════════════════════════════════════════════════
`);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    console.log("🔌 Disconnected.");
  }
}

run();
