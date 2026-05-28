// scripts/seed-referral.js
import pg from "pg";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("railway")
    ? { rejectUnauthorized: false }
    : false,
});

function makeCode() {
  return `SP${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log("🔌 Connected...\n");

    // ── Step 1: verify columns exist ──────────────────────────────────────────
    const col = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'User' AND column_name = 'referralCode';
    `);
    if (col.rows.length === 0)
      throw new Error("referralCode column missing — run migration first");
    console.log("✅ Schema verified");

    // ── Step 2: generate codes for users who don't have one ───────────────────
    const { rows: users } = await client.query(
      `SELECT id FROM "User" WHERE "referralCode" IS NULL;`,
    );
    console.log(`\n🎫 Generating codes for ${users.length} users...`);

    if (users.length > 0) {
      const { rows: existing } = await client.query(
        `SELECT "referralCode" FROM "User" WHERE "referralCode" IS NOT NULL;`,
      );
      const used = new Set(existing.map((r) => r.referralCode));

      const BATCH = 50;
      let done = 0;
      for (let i = 0; i < users.length; i += BATCH) {
        const chunk = users.slice(i, i + BATCH);
        await client.query("BEGIN");
        for (const u of chunk) {
          let code,
            attempts = 0;
          do {
            code = makeCode();
            attempts++;
          } while (used.has(code) && attempts < 30);
          used.add(code);
          await client.query(
            `UPDATE "User" SET "referralCode" = $1 WHERE id = $2`,
            [code, u.id],
          );
        }
        await client.query("COMMIT");
        done += chunk.length;
        process.stdout.write(`\r  ${done}/${users.length}`);
      }
      console.log(`\n✅ ${users.length} codes generated`);
    } else {
      console.log("✅ All users already have codes");
    }

    // ── Step 3: fix tiers ─────────────────────────────────────────────────────
    console.log("\n🏆 Fixing tiers...");
    const t = await client.query(`
      UPDATE "User"
      SET "referralTier" = CASE
        WHEN "successfulReferrals" >= 51 THEN 'DIAMOND'::"ReferralTier"
        WHEN "successfulReferrals" >= 21 THEN 'GOLD'::"ReferralTier"
        WHEN "successfulReferrals" >= 6  THEN 'SILVER'::"ReferralTier"
        ELSE                                  'BRONZE'::"ReferralTier"
      END
      WHERE "referralTier" IS DISTINCT FROM CASE
        WHEN "successfulReferrals" >= 51 THEN 'DIAMOND'::"ReferralTier"
        WHEN "successfulReferrals" >= 21 THEN 'GOLD'::"ReferralTier"
        WHEN "successfulReferrals" >= 6  THEN 'SILVER'::"ReferralTier"
        ELSE                                  'BRONZE'::"ReferralTier"
      END;
    `);
    console.log(`✅ Fixed ${t.rowCount} tiers`);

    // ── Step 4: expire stale referrals (skip if table missing) ───────────────
    const refTable = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'Referral';`,
    );
    if (refTable.rows.length > 0) {
      console.log("\n⏰ Expiring stale referrals...");
      const exp = await client.query(`
        UPDATE "Referral"
        SET status = 'EXPIRED'::"ReferralStatus"
        WHERE status IN ('PENDING', 'QUALIFIED') AND "expiresAt" < NOW();
      `);
      console.log(`✅ Expired ${exp.rowCount} referrals`);

      // Sync counts
      console.log("\n🔢 Syncing referral counts...");
      const sync = await client.query(`
        UPDATE "User" u
        SET
          "totalReferrals"      = COALESCE(r.total, 0),
          "successfulReferrals" = COALESCE(r.successful, 0)
        FROM (
          SELECT "referrerId",
            COUNT(*)                                     AS total,
            COUNT(*) FILTER (WHERE status = 'REWARDED') AS successful
          FROM "Referral" GROUP BY "referrerId"
        ) r
        WHERE u.id = r."referrerId";
      `);
      console.log(`✅ Synced ${sync.rowCount} referrers`);
    } else {
      console.log("\n⏭️  Referral table not found — skipping steps 4 & 5");
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log("\n📊 Summary");
    console.log("─".repeat(40));
    const {
      rows: [s],
    } = await client.query(`
      SELECT
        COUNT(*)                           AS users,
        COUNT("referralCode")              AS with_code,
        SUM("totalReferrals")              AS total_refs,
        SUM("successfulReferrals")         AS successful,
        ROUND(SUM("walletBalance")::numeric, 0) AS wallet_total
      FROM "User";
    `);
    console.log(`  Users:             ${s.users}`);
    console.log(`  With codes:        ${s.with_code}`);
    console.log(`  Total referrals:   ${s.total_refs || 0}`);
    console.log(`  Successful:        ${s.successful || 0}`);
    console.log(
      `  Wallet balances:   ₦${Number(s.wallet_total || 0).toLocaleString()}`,
    );

    const { rows: tiers } = await client.query(`
      SELECT "referralTier", COUNT(*) AS cnt FROM "User"
      GROUP BY "referralTier"
      ORDER BY CASE "referralTier"
        WHEN 'BRONZE' THEN 1 WHEN 'SILVER' THEN 2
        WHEN 'GOLD'   THEN 3 WHEN 'DIAMOND' THEN 4
      END;
    `);
    const emoji = { BRONZE: "🥉", SILVER: "🥈", GOLD: "🥇", DIAMOND: "💎" };
    console.log("\n  Tiers:");
    tiers.forEach((r) =>
      console.log(`    ${emoji[r.referralTier]} ${r.referralTier}: ${r.cnt}`),
    );
    console.log("─".repeat(40));

    console.log("\n✅ Seed complete!\n");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("❌ Failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    console.log("🔌 Connection closed.");
  }
}

main();
