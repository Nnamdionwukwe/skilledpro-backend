import pg from "pg";
import dotenv from "dotenv";
import crypto from "crypto";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("railway")
    ? { rejectUnauthorized: false }
    : false,
});

// ── Correct IDs ──────────────────────────────────────────────────────────
const HIRER_ID = "8f2a4340-c1e4-4086-b059-2ea98c8265ee"; // gestech com
const WORKER_ID = "a9865435-365b-45ab-a2a8-5a2025dd08c9"; // Gideon Solace

function randomFutureDate(daysMin = 1, daysMax = 14) {
  const now = new Date();
  const days = Math.floor(Math.random() * (daysMax - daysMin + 1)) + daysMin;
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(Math.floor(Math.random() * 12) + 8, 0, 0, 0);
  return date;
}

function randomId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
}

async function main() {
  const client = await pool.connect();
  try {
    console.log("🔌 Connected to Railway database...");

    // ── Check if tables exist ──────────────────────────────────────────────
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'User'
      );
    `);
    if (!tableCheck.rows[0].exists) {
      console.error("❌ Table 'User' does not exist. Run migrations first:");
      console.error("   npx prisma db push");
      return;
    }
    console.log("✅ Schema verified.");

    // ── Verify worker exists ──────────────────────────────────────────────
    const workerRes = await client.query(
      `SELECT u.id, u."firstName", u."lastName"
       FROM "User" u
       WHERE u.id = $1 AND u.role = 'WORKER'`,
      [WORKER_ID],
    );
    if (workerRes.rows.length === 0) {
      console.error(`❌ Worker ${WORKER_ID} not found.`);
      return;
    }
    const worker = workerRes.rows[0];
    console.log(`✅ Found worker: ${worker.firstName} ${worker.lastName}`);

    // ── Verify hirer exists ──────────────────────────────────────────────
    const hirerRes = await client.query(
      `SELECT id FROM "User" WHERE id = $1 AND role = 'HIRER'`,
      [HIRER_ID],
    );
    if (hirerRes.rows.length === 0) {
      console.error(`❌ Hirer ${HIRER_ID} not found.`);
      return;
    }
    console.log(`✅ Found hirer.`);

    // ── Get a category from the worker's profile ──────────────────────────
    let categoryId = null;
    const catRes = await client.query(
      `SELECT "categoryId" FROM "WorkerCategory" WHERE "workerProfileId" IN (
         SELECT id FROM "WorkerProfile" WHERE "userId" = $1
       ) LIMIT 1`,
      [WORKER_ID],
    );
    if (catRes.rows.length > 0) {
      categoryId = catRes.rows[0].categoryId;
    } else {
      const anyCat = await client.query(`SELECT id FROM "Category" LIMIT 1`);
      if (anyCat.rows.length === 0) {
        console.error("❌ No categories found. Please seed categories first.");
        return;
      }
      categoryId = anyCat.rows[0].id;
    }
    console.log(`✅ Using category ID: ${categoryId}`);

    // ── Add a small referral wallet balance to the hirer ──────────────────
    await client.query(
      `UPDATE "User"
       SET "walletBalance" = "walletBalance" + 2000,
           "walletLifetimeTotal" = "walletLifetimeTotal" + 2000
       WHERE id = $1`,
      [HIRER_ID],
    );
    const balRes = await client.query(
      `SELECT "walletBalance" FROM "User" WHERE id = $1`,
      [HIRER_ID],
    );
    console.log(
      `💰 Added ₦2,000 referral balance. New balance: ₦${balRes.rows[0].walletBalance}`,
    );

    // ── 5 PENDING bookings ────────────────────────────────────────────────
    const bookingConfigs = [
      {
        title: "Pending – Hourly (8 hrs)",
        unit: "hours",
        value: "8",
        rate: 500,
        jobType: "FULL_TIME",
        locationType: "ON_SITE",
      },
      {
        title: "Pending – Daily (3 days)",
        unit: "days",
        value: "3",
        rate: 1500,
        jobType: "PART_TIME",
        locationType: "REMOTE",
      },
      {
        title: "Pending – Weekly (1 week)",
        unit: "weeks",
        value: "1",
        rate: 5000,
        jobType: "CONTRACT",
        locationType: "HYBRID",
      },
      {
        title: "Pending – Monthly (2 months)",
        unit: "months",
        value: "2",
        rate: 20000,
        jobType: "FULL_TIME",
        locationType: "ON_SITE",
      },
      {
        title: "Pending – Custom (Website Design)",
        unit: "custom",
        value: "1",
        rate: 5000,
        jobType: "TEMPORARY",
        locationType: "REMOTE",
      },
    ];

    console.log("\n📦 Generating 5 PENDING bookings...\n");

    for (const config of bookingConfigs) {
      let hours = null;
      const val = parseFloat(config.value);
      if (config.unit !== "custom") {
        if (config.unit === "hours") hours = val;
        else if (config.unit === "days") hours = val * 8;
        else if (config.unit === "weeks") hours = val * 40;
        else if (config.unit === "months") hours = val * 160;
      }

      const scheduledAt = randomFutureDate(2, 10);
      const bookingId = randomId();

      const query = `
        INSERT INTO "Booking" (
          id, "hirerId", "workerId", "categoryId", title, description,
          address, latitude, longitude, "scheduledAt", "estimatedHours",
          "estimatedUnit", "estimatedValue", "agreedRate", currency,
          notes, "jobType", "locationType", "isNegotiated",
          requirements, responsibilities, status,
          "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, false,
          $19, $20, $21,
          NOW(), NOW()
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id, title;
      `;

      const values = [
        bookingId,
        HIRER_ID,
        WORKER_ID,
        categoryId,
        config.title,
        `Test pending booking – ${config.unit} ${config.value}`,
        config.locationType === "REMOTE"
          ? "Remote"
          : "123 Test Street, Lagos, Nigeria",
        6.5244 + (Math.random() - 0.5) * 0.1,
        3.3792 + (Math.random() - 0.5) * 0.1,
        scheduledAt,
        hours,
        config.unit,
        config.value,
        config.rate,
        "NGN",
        `Pending booking – worker has not accepted yet.`,
        config.jobType,
        config.locationType,
        "Must have experience.",
        "Deliver quality work.",
        "PENDING",
      ];

      const res = await client.query(query, values);
      if (res.rows.length > 0) {
        console.log(`✅ "${res.rows[0].title}" (ID: ${res.rows[0].id})`);
        console.log(
          `   Status: PENDING, Unit: ${config.unit}, Rate: ₦${config.rate}`,
        );
        console.log("---");
      } else {
        console.log(`⏭️ Booking "${config.title}" already exists (skipped).`);
      }
    }

    console.log("\n🎉 Done! All 5 bookings are PENDING.");
    console.log("👉 Log in as the hirer, go to Bookings, and you'll see them.");
    console.log(
      "👉 The worker can now accept them, then payments can be made.",
    );
    console.log(
      `💰 Hirer referral wallet: ₦${balRes.rows[0].walletBalance} available.`,
    );
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    client.release();
    await pool.end();
    console.log("🔌 Connection closed.");
  }
}

main();
