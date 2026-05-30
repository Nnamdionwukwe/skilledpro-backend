// scripts/seed-test-accounts.js
// ─────────────────────────────────────────────────────────────────────────────
// Seeds 5 test accounts into Railway PostgreSQL:
//
//   Role    Name              Email                           Password
//   ──────  ────────────────  ──────────────────────────────  ──────────────
//   ADMIN   Super Admin       admin@skilledproz.test          Admin1234!
//   WORKER  Emeka Okafor      emeka@skilledproz.test          Worker1234!
//   WORKER  Amaka Eze         amaka@skilledproz.test          Worker1234!
//   HIRER   Chidi Nwosu       chidi@skilledproz.test          Hirer1234!
//   HIRER   Ngozi Adeyemi     ngozi@skilledproz.test          Hirer1234!
//
// Also seeds:
//   • WorkerProfile + categories for both workers
//   • HirerProfile for both hirers
//   • 1 completed booking (Chidi → Emeka, plumbing)
//   • 1 active booking (Ngozi → Amaka, web dev)
//   • 1 payment in escrow
//   • 1 review from Chidi on Emeka
//   • Sample notifications for each user
//   • Referral codes for all 5 accounts
//
// Run: node scripts/seed-test-accounts.js
// ─────────────────────────────────────────────────────────────────────────────

import pg from "pg";
import bcryptjs from "bcryptjs";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});
const LINE = "─".repeat(72);
const uuid = () => crypto.randomUUID();

// ── Referral code generator ───────────────────────────────────────────────────
function genCode(len = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(len))
    .map((b) => chars[b % chars.length])
    .join("");
}

// ── Unique payment/booking reference ─────────────────────────────────────────
function ref(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
const PASSWORD_HASH = await bcryptjs.hash("Worker1234!", 12);
const ADMIN_HASH = await bcryptjs.hash("Admin1234!", 12);
const HIRER_HASH = await bcryptjs.hash("Hirer1234!", 12);

const ACCOUNTS = {
  admin: {
    id: uuid(),
    role: "ADMIN",
    firstName: "Super",
    lastName: "Admin",
    email: "admin@skilledproz.test",
    password: ADMIN_HASH,
    phone: "+2348000000001",
    country: "Nigeria",
    city: "Lagos",
    referralCode: genCode(),
    isEmailVerified: true,
    isActive: true,
  },
  emeka: {
    id: uuid(),
    role: "WORKER",
    firstName: "Emeka",
    lastName: "Okafor",
    email: "emeka@skilledproz.test",
    password: PASSWORD_HASH,
    phone: "+2348011111111",
    country: "Nigeria",
    city: "Lagos",
    state: "Lagos",
    referralCode: genCode(),
    isEmailVerified: true,
    isActive: true,
    profile: {
      title: "Expert Plumber & Pipe Fitter",
      description:
        "10+ years experience in residential and commercial plumbing. Emergency repairs, pipe installation, leak detection. Fully insured and certified.",
      hourlyRate: 5000,
      currency: "NGN",
      yearsExperience: 10,
      serviceRadius: 30,
      isAvailable: true,
      verificationStatus: "VERIFIED",
      avgRating: 4.8,
      totalReviews: 12,
      completedJobs: 12,
    },
  },
  amaka: {
    id: uuid(),
    role: "WORKER",
    firstName: "Amaka",
    lastName: "Eze",
    email: "amaka@skilledproz.test",
    password: PASSWORD_HASH,
    phone: "+2348022222222",
    country: "Nigeria",
    city: "Abuja",
    state: "FCT",
    referralCode: genCode(),
    isEmailVerified: true,
    isActive: true,
    profile: {
      title: "Full-Stack Web Developer (React + Node.js)",
      description:
        "5 years building scalable web applications. Expert in React, Next.js, Node.js, PostgreSQL, and mobile-responsive design. Available for freelance and contract projects.",
      hourlyRate: 8000,
      currency: "NGN",
      yearsExperience: 5,
      serviceRadius: 10,
      isAvailable: true,
      verificationStatus: "PENDING",
      avgRating: 4.6,
      totalReviews: 8,
      completedJobs: 8,
    },
  },
  chidi: {
    id: uuid(),
    role: "HIRER",
    firstName: "Chidi",
    lastName: "Nwosu",
    email: "chidi@skilledproz.test",
    password: HIRER_HASH,
    phone: "+2348033333333",
    country: "Nigeria",
    city: "Lagos",
    referralCode: genCode(),
    isEmailVerified: true,
    isActive: true,
    hirerProfile: {
      companyName: "Nwosu Properties Ltd",
      companySize: "10-50",
      website: "https://nwosuproperties.ng",
    },
  },
  ngozi: {
    id: uuid(),
    role: "HIRER",
    firstName: "Ngozi",
    lastName: "Adeyemi",
    email: "ngozi@skilledproz.test",
    password: HIRER_HASH,
    phone: "+2348044444444",
    country: "Nigeria",
    city: "Abuja",
    referralCode: genCode(),
    isEmailVerified: true,
    isActive: true,
    hirerProfile: {
      companyName: "TechNigeria Solutions",
      companySize: "50-200",
      website: "https://technigeria.ng",
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
async function upsertUser(client, u) {
  await client.query(
    `
    INSERT INTO "User" (
      "id","firstName","lastName","email","password","role","phone",
      "country","city","state","referralCode","isEmailVerified","isActive",
      "isBanned","createdAt","updatedAt"
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false,NOW(),NOW()
    ) ON CONFLICT ("email") DO UPDATE SET
      "isEmailVerified" = EXCLUDED."isEmailVerified",
      "isActive"        = EXCLUDED."isEmailVerified",
      "updatedAt"       = NOW()
  `,
    [
      u.id,
      u.firstName,
      u.lastName,
      u.email,
      u.password,
      u.role,
      u.phone,
      u.country,
      u.city,
      u.state || null,
      u.referralCode,
      u.isEmailVerified,
      u.isActive,
    ],
  );
}

async function getOrFetchUserId(client, email) {
  const r = await client.query(`SELECT id FROM "User" WHERE email = $1`, [
    email,
  ]);
  return r.rows[0]?.id;
}

async function getFirstCategory(client, nameHint) {
  const r = await client.query(
    `SELECT id FROM "Category" WHERE name ILIKE $1 LIMIT 1`,
    [`%${nameHint}%`],
  );
  if (r.rows.length > 0) return r.rows[0].id;

  // Fallback: any category
  const fb = await client.query(`SELECT id FROM "Category" LIMIT 1`);
  return fb.rows[0]?.id || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function run() {
  const client = await pool.connect();
  console.log(`\n${LINE}`);
  console.log(" SkilledProz — Test Accounts Seed");
  console.log(` Started : ${new Date().toLocaleString()}`);
  console.log(
    ` DB      : ${process.env.DATABASE_URL?.split("@")[1] ?? "connected"}`,
  );
  console.log(LINE);

  try {
    await client.query("BEGIN");

    // ── 1. Create all 5 users ─────────────────────────────────────────────────
    console.log("\n[1/7] Creating user accounts…");
    for (const [key, u] of Object.entries(ACCOUNTS)) {
      await upsertUser(client, u);
      console.log(
        `  ✓  ${u.role.padEnd(7)} ${u.firstName} ${u.lastName} <${u.email}>`,
      );
    }

    // Re-fetch IDs (in case of ON CONFLICT the DB keeps the original ID)
    const ids = {};
    for (const [key, u] of Object.entries(ACCOUNTS)) {
      ids[key] = await getOrFetchUserId(client, u.email);
    }

    // ── 2. Worker profiles ────────────────────────────────────────────────────
    console.log("\n[2/7] Creating worker profiles…");
    for (const key of ["emeka", "amaka"]) {
      const u = ACCOUNTS[key];
      const p = u.profile;
      await client.query(
        `
        INSERT INTO "WorkerProfile" (
          "id","userId","title","description","hourlyRate","currency",
          "yearsExperience","serviceRadius","isAvailable","verificationStatus",
          "avgRating","totalReviews","completedJobs","createdAt","updatedAt"
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW()
        ) ON CONFLICT ("userId") DO UPDATE SET
          "title"              = EXCLUDED."title",
          "verificationStatus" = EXCLUDED."verificationStatus",
          "updatedAt"          = NOW()
      `,
        [
          uuid(),
          ids[key],
          p.title,
          p.description,
          p.hourlyRate,
          p.currency,
          p.yearsExperience,
          p.serviceRadius,
          p.isAvailable,
          p.verificationStatus,
          p.avgRating,
          p.totalReviews,
          p.completedJobs,
        ],
      );
      console.log(`  ✓  WorkerProfile for ${u.firstName} ${u.lastName}`);
    }

    // ── 3. Hirer profiles ─────────────────────────────────────────────────────
    console.log("\n[3/7] Creating hirer profiles…");
    for (const key of ["chidi", "ngozi"]) {
      const u = ACCOUNTS[key];
      const h = u.hirerProfile;
      await client.query(
        `
        INSERT INTO "HirerProfile" (
          "id","userId","companyName","companySize","website","createdAt","updatedAt"
        ) VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
        ON CONFLICT ("userId") DO UPDATE SET
          "companyName" = EXCLUDED."companyName",
          "updatedAt"   = NOW()
      `,
        [uuid(), ids[key], h.companyName, h.companySize, h.website],
      );
      console.log(
        `  ✓  HirerProfile for ${u.firstName} ${u.lastName} — ${h.companyName}`,
      );
    }

    // ── 4. Attach categories to workers ──────────────────────────────────────
    console.log("\n[4/7] Linking worker categories…");

    const plumbingCatId = await getFirstCategory(client, "Plumbing");
    const webDevCatId = await getFirstCategory(client, "Web");

    const emekaProfileId = (
      await client.query(`SELECT id FROM "WorkerProfile" WHERE "userId" = $1`, [
        ids.emeka,
      ])
    ).rows[0]?.id;
    const amakaProfileId = (
      await client.query(`SELECT id FROM "WorkerProfile" WHERE "userId" = $1`, [
        ids.amaka,
      ])
    ).rows[0]?.id;

    if (emekaProfileId && plumbingCatId) {
      await client.query(
        `
        INSERT INTO "WorkerCategory" ("id","workerProfileId","categoryId","isPrimary","createdAt")
        VALUES ($1,$2,$3,true,NOW())
        ON CONFLICT ("workerProfileId","categoryId") DO NOTHING
      `,
        [uuid(), emekaProfileId, plumbingCatId],
      );
      console.log(`  ✓  Emeka linked to category (plumbing)`);
    } else {
      console.log("  ⚠️  No plumbing category found — add categories first");
    }

    if (amakaProfileId && webDevCatId) {
      await client.query(
        `
        INSERT INTO "WorkerCategory" ("id","workerProfileId","categoryId","isPrimary","createdAt")
        VALUES ($1,$2,$3,true,NOW())
        ON CONFLICT ("workerProfileId","categoryId") DO NOTHING
      `,
        [uuid(), amakaProfileId, webDevCatId],
      );
      console.log(`  ✓  Amaka linked to category (web dev)`);
    } else {
      console.log("  ⚠️  No web dev category found — add categories first");
    }

    // Use plumbing cat (or web dev cat) as fallback for bookings
    const bookingCatId = plumbingCatId || webDevCatId;

    // ── 5. Sample bookings ────────────────────────────────────────────────────
    console.log("\n[5/7] Creating sample bookings…");

    let booking1Id = null;
    let booking2Id = null;
    let payment1Id = null;

    if (bookingCatId) {
      // Booking 1: Chidi hired Emeka for plumbing — COMPLETED
      booking1Id = uuid();
      payment1Id = uuid();
      const bookRef1 = ref("BK");
      await client.query(
        `
        INSERT INTO "Booking" (
          "id","hirerId","workerId","categoryId","title","description",
          "agreedRate","currency","status","scheduledAt","completedAt",
          "createdAt","updatedAt"
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,'NGN','COMPLETED',
          NOW() - INTERVAL '7 days', NOW() - INTERVAL '6 days',
          NOW() - INTERVAL '8 days', NOW() - INTERVAL '6 days'
        ) ON CONFLICT DO NOTHING
      `,
        [
          booking1Id,
          ids.chidi,
          ids.emeka,
          bookingCatId,
          "Fix leaking bathroom pipes at Victoria Island apartment",
          "Three pipes leaking in the master bathroom. Need urgent repair and replacement of old fixtures.",
          15000,
          15000,
        ],
      );

      // Payment for booking 1 — RELEASED
      await client.query(
        `
        INSERT INTO "Payment" (
          "id","bookingId","userId","amount","currency","platformFee","workerPayout",
          "status","provider","providerRef","createdAt","updatedAt","escrowReleasedAt"
        ) VALUES (
          $1,$2,$3,15750,'NGN',750,15000,'RELEASED','paystack',$4,
          NOW() - INTERVAL '8 days', NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days'
        ) ON CONFLICT DO NOTHING
      `,
        [payment1Id, booking1Id, ids.chidi, ref("PAY")],
      );

      console.log(`  ✓  Booking 1: Chidi → Emeka (COMPLETED, ₦15,000)`);

      // Booking 2: Ngozi hired Amaka for web dev — IN_PROGRESS (payment in escrow)
      booking2Id = uuid();
      const payment2Id = uuid();
      await client.query(
        `
        INSERT INTO "Booking" (
          "id","hirerId","workerId","categoryId","title","description",
          "agreedRate","currency","status","scheduledAt","createdAt","updatedAt"
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,'NGN','IN_PROGRESS',
          NOW() + INTERVAL '2 days',
          NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'
        ) ON CONFLICT DO NOTHING
      `,
        [
          booking2Id,
          ids.ngozi,
          ids.amaka,
          webDevCatId || bookingCatId,
          "Company website redesign — TechNigeria Solutions",
          "Redesign our company website using React and Next.js. Must be mobile responsive and SEO optimised.",
          120000,
          120000,
        ],
      );

      // Payment for booking 2 — HELD (in escrow)
      await client.query(
        `
        INSERT INTO "Payment" (
          "id","bookingId","userId","amount","currency","platformFee","workerPayout",
          "status","provider","providerRef","createdAt","updatedAt"
        ) VALUES (
          $1,$2,$3,126000,'NGN',6000,120000,'HELD','paystack',$4,
          NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'
        ) ON CONFLICT DO NOTHING
      `,
        [payment2Id, booking2Id, ids.ngozi, ref("PAY")],
      );

      console.log(
        `  ✓  Booking 2: Ngozi → Amaka (IN_PROGRESS, ₦120,000 in escrow)`,
      );
    } else {
      console.log(
        "  ⚠️  No categories found — skipping bookings (run category seed first)",
      );
    }

    // ── 6. Review ─────────────────────────────────────────────────────────────
    console.log("\n[6/7] Creating sample review…");
    if (booking1Id) {
      await client.query(
        `
        INSERT INTO "Review" (
          "id","bookingId","giverId","receiverId","rating","comment","type","createdAt","updatedAt"
        ) VALUES (
          $1,$2,$3,$4,5,
          'Emeka was punctual, professional, and fixed the leaking pipes within 2 hours. Highly recommended for any plumbing work in Lagos. Will definitely hire again!',
          'WORKER', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'
        ) ON CONFLICT DO NOTHING
      `,
        [uuid(), booking1Id, ids.chidi, ids.emeka],
      );
      console.log("  ✓  5-star review: Chidi → Emeka");
    } else {
      console.log("  ⚠️  Skipped (no booking available)");
    }

    // ── 7. Notifications ──────────────────────────────────────────────────────
    console.log("\n[7/7] Creating welcome notifications…");
    const notifs = [
      {
        userId: ids.admin,
        title: "Welcome, Admin! 👋",
        body: "You're logged in as the platform administrator. Use the admin panel to manage users, payments, and disputes.",
        type: "SYSTEM",
      },
      {
        userId: ids.emeka,
        title: "Profile Verified ✅",
        body: "Your worker profile has been verified! Hirers can now see your verified badge and book you with confidence.",
        type: "VERIFICATION_APPROVED",
      },
      {
        userId: ids.amaka,
        title: "Welcome to SkilledProz! 🎉",
        body: "Your account is active. Complete your profile verification to get more bookings.",
        type: "WELCOME",
      },
      {
        userId: ids.chidi,
        title: "Booking Completed ✅",
        body: "Your plumbing job has been completed. Payment of ₦15,000 was released to Emeka. Please leave a review!",
        type: "BOOKING_COMPLETED",
      },
      {
        userId: ids.ngozi,
        title: "Payment Secured 💳",
        body: "Your payment of ₦126,000 is held in escrow for the TechNigeria website redesign. Release it when the work is complete.",
        type: "PAYMENT_HELD",
      },
    ];

    for (const n of notifs) {
      await client.query(
        `
        INSERT INTO "Notification" ("id","userId","title","body","type","isRead","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5,false,NOW(),NOW())
        ON CONFLICT DO NOTHING
      `,
        [uuid(), n.userId, n.title, n.body, n.type],
      );
    }
    console.log(`  ✓  ${notifs.length} welcome notifications created`);

    await client.query("COMMIT");

    // ── Print credentials summary ─────────────────────────────────────────────
    console.log(`\n${LINE}`);
    console.log(" ✅  Seed complete! Test account credentials:\n");
    console.log(
      "  Role    Name              Email                          Password",
    );
    console.log(
      "  ──────  ────────────────  ─────────────────────────────  ─────────────",
    );
    console.log(
      `  ADMIN   Super Admin        admin@skilledproz.test         Admin1234!`,
    );
    console.log(
      `  WORKER  Emeka Okafor       emeka@skilledproz.test         Worker1234!`,
    );
    console.log(
      `  WORKER  Amaka Eze          amaka@skilledproz.test         Worker1234!`,
    );
    console.log(
      `  HIRER   Chidi Nwosu        chidi@skilledproz.test         Hirer1234!`,
    );
    console.log(
      `  HIRER   Ngozi Adeyemi      ngozi@skilledproz.test         Hirer1234!`,
    );
    console.log();
    console.log("  Referral codes:");
    for (const [, u] of Object.entries(ACCOUNTS)) {
      console.log(`    ${u.firstName.padEnd(10)} ${u.referralCode}`);
    }
    console.log(LINE + "\n");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ Seed FAILED — rolled back:", err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
