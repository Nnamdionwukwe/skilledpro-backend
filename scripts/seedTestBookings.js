// scripts/seedTestBookings.js
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

// ── Fixed hirer ID (the "gestech com" account) ─────────────────────────
const HIRER_ID = "8f2a4340-c1e4-4086-b059-2ea98c8265ee";
const WORKER_FIRST_NAME = "Gideon";
const WORKER_LAST_NAME = "Solace";

// ── Helpers ──────────────────────────────────────────────────────────────
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

// ── Main ──────────────────────────────────────────────────────────────────
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

    // ── Verify hirer exists ──────────────────────────────────────────────
    const hirerRes = await client.query(
      `SELECT id, "firstName", "lastName", email FROM "User" WHERE id = $1 AND role = 'HIRER'`,
      [HIRER_ID],
    );
    if (hirerRes.rows.length === 0) {
      console.error(
        `❌ Hirer with ID ${HIRER_ID} not found or is not a HIRER.`,
      );
      return;
    }
    const hirer = hirerRes.rows[0];
    console.log(
      `✅ Found hirer: ${hirer.firstName} ${hirer.lastName} (${hirer.email})`,
    );

    // ── Find worker by name ───────────────────────────────────────────────
    const workerRes = await client.query(
      `SELECT u.id, u."firstName", u."lastName"
       FROM "User" u
       WHERE u."firstName" ILIKE $1 AND u."lastName" ILIKE $2 AND u.role = 'WORKER'`,
      [WORKER_FIRST_NAME, WORKER_LAST_NAME],
    );
    if (workerRes.rows.length === 0) {
      console.error(
        `❌ Worker "${WORKER_FIRST_NAME} ${WORKER_LAST_NAME}" not found.`,
      );
      return;
    }
    const worker = workerRes.rows[0];
    console.log(
      `✅ Found worker: ${worker.firstName} ${worker.lastName} (ID: ${worker.id})`,
    );

    // ── Get a category for the worker ──────────────────────────────────
    let categoryId = null;
    const catRes = await client.query(
      `SELECT "categoryId" FROM "WorkerCategory" WHERE "workerProfileId" IN (
         SELECT id FROM "WorkerProfile" WHERE "userId" = $1
       ) LIMIT 1`,
      [worker.id],
    );
    if (catRes.rows.length > 0) {
      categoryId = catRes.rows[0].categoryId;
    } else {
      // Fallback: pick any category
      const anyCat = await client.query(`SELECT id FROM "Category" LIMIT 1`);
      if (anyCat.rows.length === 0) {
        console.error("❌ No categories found. Please seed categories first.");
        return;
      }
      categoryId = anyCat.rows[0].id;
    }
    console.log(`✅ Using category ID: ${categoryId}`);

    // ── Add referral wallet balance to hirer ──────────────────────────────
    await client.query(
      `UPDATE "User"
       SET "walletBalance" = "walletBalance" + 5000,
           "walletLifetimeTotal" = "walletLifetimeTotal" + 5000
       WHERE id = $1`,
      [hirer.id],
    );
    const balRes = await client.query(
      `SELECT "walletBalance" FROM "User" WHERE id = $1`,
      [hirer.id],
    );
    console.log(
      `💰 Added ₦5,000 referral balance to hirer. New balance: ₦${balRes.rows[0].walletBalance}`,
    );

    // ── Predefined booking configurations (real pricing from screenshot) ──
    const bookingConfigs = [
      {
        title: "Test Booking – Hourly (10 hrs)",
        unit: "hours",
        value: "10",
        rate: 500,
        status: "PENDING",
        jobType: "FULL_TIME",
        locationType: "ON_SITE",
      },
      {
        title: "Test Booking – Daily (5 days)",
        unit: "days",
        value: "5",
        rate: 1500,
        status: "ACCEPTED",
        jobType: "PART_TIME",
        locationType: "REMOTE",
      },
      {
        title: "Test Booking – Weekly (2 weeks)",
        unit: "weeks",
        value: "2",
        rate: 5000,
        status: "IN_PROGRESS",
        jobType: "CONTRACT",
        locationType: "HYBRID",
      },
      {
        title: "Test Booking – Monthly (3 months)",
        unit: "months",
        value: "3",
        rate: 20000,
        status: "COMPLETED",
        jobType: "FULL_TIME",
        locationType: "ON_SITE",
      },
      {
        title: "Test Booking – Custom (Website & App)",
        unit: "custom",
        value: "1",
        rate: 5000,
        status: "CANCELLED",
        jobType: "TEMPORARY",
        locationType: "REMOTE",
      },
      {
        title: "Test Booking – Negotiated (10% off)",
        unit: "hours",
        value: "20",
        rate: 450,
        status: "DISPUTED",
        jobType: "FULL_TIME",
        locationType: "ON_SITE",
        isNegotiated: true,
        negotiatedRate: 450,
        negotiationNote: "10% discount for bulk hours",
      },
    ];

    console.log("\n📦 Generating bookings...\n");

    for (const config of bookingConfigs) {
      let hours = null;
      const val = parseFloat(config.value);
      if (config.unit !== "custom") {
        if (config.unit === "hours") hours = val;
        else if (config.unit === "days") hours = val * 8;
        else if (config.unit === "weeks") hours = val * 40;
        else if (config.unit === "months") hours = val * 160;
      }

      const scheduledAt = randomFutureDate(1, 14);
      const isNegotiated = config.isNegotiated || false;
      const agreedRate = isNegotiated ? config.negotiatedRate : config.rate;

      const bookingId = randomId();

      const query = `
        INSERT INTO "Booking" (
          id, "hirerId", "workerId", "categoryId", title, description,
          address, latitude, longitude, "scheduledAt", "estimatedHours",
          "estimatedUnit", "estimatedValue", "agreedRate", currency,
          notes, "jobType", "locationType", "isNegotiated", "negotiatedRate",
          "negotiationNote", requirements, responsibilities, status,
          "completedAt", "checkInAt", "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, NOW(), NOW()
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id, title;
      `;

      const values = [
        bookingId,
        hirer.id,
        worker.id,
        categoryId,
        config.title,
        `Test booking for ${worker.firstName} ${worker.lastName}. Unit: ${config.unit}, Value: ${config.value}`,
        config.locationType === "REMOTE"
          ? "Remote"
          : "123 Test Street, Lagos, Nigeria",
        6.5244 + (Math.random() - 0.5) * 0.1,
        3.3792 + (Math.random() - 0.5) * 0.1,
        scheduledAt,
        hours,
        config.unit,
        config.value,
        agreedRate,
        "NGN",
        `Test note – status: ${config.status}`,
        config.jobType,
        config.locationType,
        isNegotiated,
        isNegotiated ? config.negotiatedRate : null,
        isNegotiated ? config.negotiationNote : null,
        "Must have experience.",
        "Deliver quality work.",
        config.status,
        config.status === "COMPLETED" ? new Date() : null,
        config.status === "IN_PROGRESS" ? new Date() : null,
      ];

      const res = await client.query(query, values);
      if (res.rows.length > 0) {
        console.log(`✅ ${config.title} (ID: ${res.rows[0].id})`);
        console.log(
          `   Status: ${config.status}, Unit: ${config.unit}, Rate: ₦${agreedRate}`,
        );
        if (isNegotiated)
          console.log(`   Negotiated: Yes (${config.negotiationNote})`);
        console.log("---");
      } else {
        console.log(`⏭️ Booking "${config.title}" already exists (skipped).`);
      }
    }

    console.log("\n🎉 Done! Here’s what you can test:");
    console.log("  - PENDING booking: worker must accept before payment.");
    console.log("  - ACCEPTED booking: pay now (referral discount available).");
    console.log(
      "  - IN_PROGRESS: worker has checked in, hirer can release payment.",
    );
    console.log("  - COMPLETED: job done, review and release.");
    console.log("  - CANCELLED: cancellation flow.");
    console.log("  - DISPUTED: dispute resolution flow.");
    console.log(
      `\n💰 Hirer referral wallet: ₦${balRes.rows[0].walletBalance} available.`,
    );
    console.log(`👤 Hirer ID: ${hirer.id}`);
    console.log(`👷 Worker ID: ${worker.id}`);
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    client.release();
    await pool.end();
    console.log("🔌 Connection closed.");
  }
}

main();
