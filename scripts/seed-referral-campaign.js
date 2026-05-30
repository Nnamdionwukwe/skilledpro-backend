#!/usr/bin/env node
// scripts/seed-referral-campaign.js
// ─────────────────────────────────────────────────────────────────────────────
// Seeds referral + campaign test data for the registered hirer on Railway.
//
// Run:  node scripts/seed-referral-campaign.js
//
// Uses pg directly (same as migration scripts) — no Prisma client needed.
// Reads DATABASE_URL from .env automatically via dotenv.
// ─────────────────────────────────────────────────────────────────────────────
import pg from "pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config(); // ← loads .env from project root

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("\n  ❌  DATABASE_URL not found in .env\n");
  process.exit(1);
}

// Show which DB we are connecting to (host only, not the password)
const dbHost = DATABASE_URL.match(/@([^/:]+)/)?.[1] ?? "unknown";
console.log(`\n  Connecting to: ${dbHost}`);

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: false });

const HIRER_ID = "8f2a4340-c1e4-4086-b059-2ea98c8265ee";
const REF_CODE = "SPTEST01";
const LINE = "─".repeat(64);

// ─────────────────────────────────────────────────────────────────────────────
// TEST DATA
// ─────────────────────────────────────────────────────────────────────────────
const REFERRED_USERS = [
  // REWARDED — these drive the SILVER tier (min 6 successful referrals)
  {
    firstName: "Emeka",
    lastName: "Okafor",
    email: "emeka.ref1@test.sp",
    role: "WORKER",
    state: "REWARDED",
    bonus: 800,
    daysAgo: 55,
  },
  {
    firstName: "Chioma",
    lastName: "Nwosu",
    email: "chioma.ref2@test.sp",
    role: "WORKER",
    state: "REWARDED",
    bonus: 800,
    daysAgo: 49,
  },
  {
    firstName: "Adaeze",
    lastName: "Obi",
    email: "adaeze.ref3@test.sp",
    role: "HIRER",
    state: "REWARDED",
    bonus: 600,
    daysAgo: 43,
  },
  {
    firstName: "Tunde",
    lastName: "Bello",
    email: "tunde.ref4@test.sp",
    role: "WORKER",
    state: "REWARDED",
    bonus: 800,
    daysAgo: 38,
  },
  {
    firstName: "Ngozi",
    lastName: "Eze",
    email: "ngozi.ref5@test.sp",
    role: "HIRER",
    state: "REWARDED",
    bonus: 600,
    daysAgo: 33,
  },
  {
    firstName: "Kola",
    lastName: "Ade",
    email: "kola.ref6@test.sp",
    role: "WORKER",
    state: "REWARDED",
    bonus: 1200,
    daysAgo: 27,
  },
  {
    firstName: "Fatima",
    lastName: "Hassan",
    email: "fatima.ref7@test.sp",
    role: "HIRER",
    state: "REWARDED",
    bonus: 900,
    daysAgo: 20,
  },
  {
    firstName: "Chidi",
    lastName: "Okonkwo",
    email: "chidi.ref8@test.sp",
    role: "WORKER",
    state: "REWARDED",
    bonus: 1200,
    daysAgo: 14,
  },
  // QUALIFIED — verified email, first booking not done yet
  {
    firstName: "Bola",
    lastName: "Akin",
    email: "bola.ref9@test.sp",
    role: "WORKER",
    state: "QUALIFIED",
    bonus: 1200,
    daysAgo: 8,
  },
  {
    firstName: "Sade",
    lastName: "Coker",
    email: "sade.ref10@test.sp",
    role: "HIRER",
    state: "QUALIFIED",
    bonus: 900,
    daysAgo: 6,
  },
  // PENDING — just signed up, email not verified yet
  {
    firstName: "Dele",
    lastName: "Ojo",
    email: "dele.ref11@test.sp",
    role: "WORKER",
    state: "PENDING",
    bonus: 1200,
    daysAgo: 3,
  },
  {
    firstName: "Yetunde",
    lastName: "Ade",
    email: "yetunde.ref12@test.sp",
    role: "HIRER",
    state: "PENDING",
    bonus: 900,
    daysAgo: 1,
  },
];

const REWARDED = REFERRED_USERS.filter((u) => u.state === "REWARDED");
const totalBonus = REWARDED.reduce((s, u) => s + u.bonus, 0); // ₦6,900 BEFORE SILVER boost
// Recalculate correctly: first 5 at BRONZE, last 3 at SILVER
// Doesn't matter for seeding — we just use the bonus values in the array
const WITHDRAWN = 4_800;
const WALLET_BAL = totalBonus - WITHDRAWN;

function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

function future(n) {
  return new Date(Date.now() + n * 86_400_000).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
async function q(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

async function run(label, sql, params = []) {
  try {
    await q(sql, params);
    console.log(`  ✅  ${label}`);
  } catch (err) {
    if (err.message?.includes("duplicate") || err.code === "23505") {
      console.log(`  ⏭   ${label} (already exists)`);
    } else {
      console.log(`  ⚠️   ${label}\n      ${err.message.split("\n")[0]}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${LINE}`);
console.log(" SkilledProz — Referral + Campaign Test Seed");
console.log(LINE);

// ── 0. Verify hirer exists ────────────────────────────────────────────────────
const {
  rows: [hirer],
} = await q(
  `SELECT id, "firstName", "lastName", email FROM "User" WHERE id = $1`,
  [HIRER_ID],
);
if (!hirer) {
  console.error(
    `\n  ❌  Hirer ${HIRER_ID} not found — check the ID or run this against Railway.\n`,
  );
  await pool.end();
  process.exit(1);
}
console.log(
  `\n  Hirer  : ${hirer.firstName} ${hirer.lastName} (${hirer.email})`,
);
console.log(`  DB     : ${dbHost}\n`);

// ── 1. Hirer referral profile ─────────────────────────────────────────────────
console.log("§ 1  Referral profile");
await run(
  "Set referral code + SILVER tier + wallet balance",
  `UPDATE "User" SET
     "referralCode"        = $1,
     "referralTier"        = 'SILVER',
     "totalReferrals"      = $2,
     "successfulReferrals" = $3,
     "walletBalance"       = $4,
     "walletLifetimeTotal" = $5
   WHERE id = $6`,
  [
    REF_CODE,
    REFERRED_USERS.length,
    REWARDED.length,
    WALLET_BAL,
    totalBonus,
    HIRER_ID,
  ],
);

// ── 2. Create referred users ──────────────────────────────────────────────────
console.log("\n§ 2  Referred users");
const hashed = await bcrypt.hash("Test1234!", 12);
const createdIds = {};

for (const u of REFERRED_USERS) {
  const id = crypto.randomUUID();
  // Check if already exists
  const {
    rows: [existing],
  } = await q(`SELECT id FROM "User" WHERE email = $1`, [u.email]);

  if (existing) {
    createdIds[u.email] = existing.id;
    console.log(`  ⏭   ${u.firstName} ${u.lastName} (already exists)`);
  } else {
    await run(
      `Create ${u.firstName} ${u.lastName} [${u.role}, ${u.state}]`,
      `INSERT INTO "User"
         (id, "firstName", "lastName", email, password, role,
          "isEmailVerified", "isActive", "isBanned",
          "referredById", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,false,$8,$9,$9)`,
      [
        id,
        u.firstName,
        u.lastName,
        u.email,
        hashed,
        u.role,
        u.state !== "PENDING", // email verified if not PENDING
        HIRER_ID, // referredById
        daysAgo(u.daysAgo),
      ],
    );
    // Create role profile
    if (u.role === "WORKER") {
      await run(
        `WorkerProfile for ${u.firstName}`,
        `INSERT INTO "WorkerProfile" (id, "userId", title, "hourlyRate", currency, "createdAt", "updatedAt")
         VALUES ($1,$2,$3,0,'NGN',$4,$4)
         ON CONFLICT ("userId") DO NOTHING`,
        [
          crypto.randomUUID(),
          id,
          `${u.firstName} ${u.lastName}`,
          daysAgo(u.daysAgo),
        ],
      );
    } else {
      await run(
        `HirerProfile for ${u.firstName}`,
        `INSERT INTO "HirerProfile" (id, "userId", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$3)
         ON CONFLICT ("userId") DO NOTHING`,
        [crypto.randomUUID(), id, daysAgo(u.daysAgo)],
      );
    }
    createdIds[u.email] = id;
  }
}

// ── 3. Referral records ───────────────────────────────────────────────────────
console.log("\n§ 3  Referral records");
for (const u of REFERRED_USERS) {
  const refId = createdIds[u.email];
  if (!refId) continue;

  const qualifiedAt = u.state !== "PENDING" ? daysAgo(u.daysAgo - 1) : null;
  const convertedAt = u.state === "REWARDED" ? daysAgo(u.daysAgo - 1) : null;
  const paidAt = convertedAt;
  const expiresAt = future(90);

  await run(
    `Referral → ${u.firstName} ${u.lastName} [${u.state}]`,
    `INSERT INTO "Referral"
       (id, "referrerId", "referredId", code, status, "referredRole",
        "referrerBonus", currency, "expiresAt",
        "qualifiedAt", "convertedAt", "paidAt",
        "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,'NGN',$8,$9,$10,$11,$12,$12)
     ON CONFLICT ("referredId") DO UPDATE SET
       status = EXCLUDED.status,
       "referrerBonus" = EXCLUDED."referrerBonus"`,
    [
      crypto.randomUUID(),
      HIRER_ID,
      refId,
      REF_CODE,
      u.state,
      u.role,
      u.bonus,
      expiresAt,
      qualifiedAt,
      convertedAt,
      paidAt,
      daysAgo(u.daysAgo),
    ],
  );
}

// ── 4. Wallet transactions ────────────────────────────────────────────────────
console.log("\n§ 4  Wallet transactions");
for (const u of REWARDED) {
  const refId = createdIds[u.email];
  await run(
    `Bonus ₦${u.bonus} ← ${u.firstName} ${u.lastName}`,
    `INSERT INTO "WalletTransaction"
       (id, "userId", type, amount, currency, description, meta, "createdAt")
     VALUES ($1,$2,'REFERRAL_BONUS',$3,'NGN',$4,$5,$6)`,
    [
      crypto.randomUUID(),
      HIRER_ID,
      u.bonus,
      `Referral bonus — ${u.firstName} completed their first booking`,
      JSON.stringify({
        tier: "SILVER",
        referredRole: u.role,
        referredId: refId,
      }),
      daysAgo(u.daysAgo - 1),
    ],
  );
}

await run(
  `Withdrawal ₦${WITHDRAWN}`,
  `INSERT INTO "WalletTransaction"
     (id, "userId", type, amount, currency, description, meta, "createdAt")
   VALUES ($1,$2,'WITHDRAWAL',$3,'NGN',$4,$5,$6)`,
  [
    crypto.randomUUID(),
    HIRER_ID,
    -WITHDRAWN,
    "Wallet withdrawal to First Bank — 0123456789",
    JSON.stringify({
      bankName: "First Bank",
      accountNumber: "0123456789",
      accountName: `${hirer.firstName} ${hirer.lastName}`,
      status: "COMPLETED",
    }),
    daysAgo(5),
  ],
);

// ── 5. Campaign referrals ──────────────────────────────────────────────────────
console.log("\n§ 5  Campaign referrals");
// Seed 5 campaign referrals (subset of the referral records above)
const campaignUsers = REFERRED_USERS.slice(0, 5);
for (const u of campaignUsers) {
  const refId = createdIds[u.email];
  if (!refId) continue;

  await run(
    `CampaignReferral → ${u.firstName} [${u.state === "REWARDED" ? "APPROVED" : "PENDING"}]`,
    `INSERT INTO "CampaignReferral"
       (id, "referrerId", "referredId", code, status,
        "hasDownloadedApp", "hasSetupProfile",
        "hasFollowedFb", "hasFollowedIg", "hasFollowedTt",
        "rewardAmount", currency, "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,true,$6,$7,$8,false,100,'NGN',$9,$9)
     ON CONFLICT ("referredId") DO NOTHING`,
    [
      crypto.randomUUID(),
      HIRER_ID,
      refId,
      REF_CODE,
      u.state === "REWARDED" ? "APPROVED" : "TASKS_DONE",
      u.state === "REWARDED", // hasSetupProfile
      u.state === "REWARDED", // hasFollowedFb
      u.state === "REWARDED", // hasFollowedIg
      daysAgo(u.daysAgo),
    ],
  );
}

// ── 6. Campaign submissions ───────────────────────────────────────────────────
console.log("\n§ 6  Campaign submissions");
const SUBMISSIONS = [
  {
    daysAgo: 14,
    status: "APPROVED",
    total: 3,
    approved: 3,
    net: 300,
    date: "2026-05-16",
  },
  {
    daysAgo: 13,
    status: "APPROVED",
    total: 2,
    approved: 2,
    net: 200,
    date: "2026-05-17",
  },
  {
    daysAgo: 10,
    status: "APPROVED",
    total: 4,
    approved: 3,
    net: 300,
    date: "2026-05-20",
  },
  {
    daysAgo: 8,
    status: "APPROVED",
    total: 2,
    approved: 2,
    net: 200,
    date: "2026-05-22",
  },
  {
    daysAgo: 5,
    status: "APPROVED",
    total: 1,
    approved: 1,
    net: 100,
    date: "2026-05-25",
  },
  {
    daysAgo: 2,
    status: "PENDING",
    total: 3,
    approved: 0,
    net: 0,
    date: "2026-05-28",
  },
  {
    daysAgo: 0,
    status: "PENDING",
    total: 2,
    approved: 0,
    net: 0,
    date: "2026-05-30",
  },
];
const campaignApproved = SUBMISSIONS.filter(
  (s) => s.status === "APPROVED",
).reduce((sum, s) => sum + s.net, 0); // ₦1,100

for (const s of SUBMISSIONS) {
  await run(
    `Submission ${s.date} [${s.status}, net ₦${s.net}]`,
    `INSERT INTO "CampaignSubmission"
       (id, "referrerId", "submissionDate", "totalSubmitted",
        "totalApproved", "totalRejected",
        "grossAmount", "netAmount", status,
        "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
     ON CONFLICT ("referrerId", "submissionDate") DO NOTHING`,
    [
      crypto.randomUUID(),
      HIRER_ID,
      s.date,
      s.total,
      s.approved,
      s.total - s.approved,
      s.total * 100,
      s.net,
      s.status,
      daysAgo(s.daysAgo),
    ],
  );
}

// ── 7. Update campaign wallet balance ─────────────────────────────────────────
console.log("\n§ 7  Campaign wallet");
await run(
  `Campaign wallet balance ₦${campaignApproved}`,
  `UPDATE "User" SET
     "campaignWalletBalance"       = $1,
     "campaignWalletLifetimeTotal" = $2
   WHERE id = $3`,
  [campaignApproved, campaignApproved, HIRER_ID],
);

// ── 8. Notifications ──────────────────────────────────────────────────────────
console.log("\n§ 8  Notifications");
const NOTIFS = [
  {
    title: "You earned ₦1,200! 💰",
    body: `Chidi Okonkwo completed their first booking. Tier: 🥈 Silver.`,
    type: "REFERRAL_CONVERTED",
    daysAgo: 13,
  },
  {
    title: "New Referral 🎉",
    body: `Dele Ojo signed up with your code ${REF_CODE}! Earn ₦1,200 on conversion.`,
    type: "REFERRAL_SIGNUP",
    daysAgo: 3,
  },
  {
    title: "Campaign payout ✅",
    body: `3 referrals approved. ₦300 added to your campaign wallet.`,
    type: "CAMPAIGN_PAYOUT",
    daysAgo: 9,
  },
  {
    title: "🥈 SILVER tier!",
    body: `You've hit 6 successful referrals. Higher bonuses now unlocked.`,
    type: "REFERRAL_TIER_UP",
    daysAgo: 20,
  },
  {
    title: "Withdrawal processed 💸",
    body: `Your ₦4,800 wallet withdrawal has been processed.`,
    type: "WALLET_WITHDRAWAL",
    daysAgo: 4,
  },
];
for (const n of NOTIFS) {
  await run(
    n.title.slice(0, 45),
    `INSERT INTO "Notification"
       (id, "userId", title, body, type, "isRead", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,false,$6,$6)`,
    [
      crypto.randomUUID(),
      HIRER_ID,
      n.title,
      n.body,
      n.type,
      daysAgo(n.daysAgo),
    ],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
await pool.end();

console.log(`\n${LINE}`);
console.log(` Done — ${hirer.firstName} ${hirer.lastName} on ${dbHost}`);
console.log(LINE);
console.log(`
  Referral code      : ${REF_CODE}
  Tier               : SILVER  (${REWARDED.length} of ${REFERRED_USERS.length} converted)
  Wallet balance     : ₦${WALLET_BAL.toLocaleString()} (withdraw enabled — min ₦5,000)
  Lifetime earned    : ₦${totalBonus.toLocaleString()}
  Withdrawn          : ₦${WITHDRAWN.toLocaleString()}

  Referral funnel    :
    REWARDED         : ${REFERRED_USERS.filter((u) => u.state === "REWARDED").length}
    QUALIFIED        : ${REFERRED_USERS.filter((u) => u.state === "QUALIFIED").length}
    PENDING          : ${REFERRED_USERS.filter((u) => u.state === "PENDING").length}

  Campaign wallet    : ₦${campaignApproved.toLocaleString()}
  Submissions        : ${SUBMISSIONS.filter((s) => s.status === "APPROVED").length} approved, ${SUBMISSIONS.filter((s) => s.status === "PENDING").length} pending

  Referred user login password : Test1234!
  Test signup flow  → use code ${REF_CODE} at /signup?ref=${REF_CODE}
`);
