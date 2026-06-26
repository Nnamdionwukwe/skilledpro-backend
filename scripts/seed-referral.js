// scripts/seedTestBookings.js
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("railway")
    ? { rejectUnauthorized: false }
    : false,
});

const HIRER_ID = "a9865435-365b-45ab-a2a8-5a2025dd08c9";
const WORKER_ID = "8f2a4340-c1e4-4086-b059-2ea98c8265ee";

async function main() {
  const client = await pool.connect();
  try {
    console.log("🔌 Connected to database...\n");

    // ── 1. Check if User table exists ─────────────────────────────────────
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'User'
      );
    `);
    if (!tableCheck.rows[0].exists) {
      throw new Error("User table does not exist – run migrations first.");
    }

    // ── 2. Verify worker exists and get a category ──────────────────────
    const workerRes = await client.query(
      `SELECT id FROM "User" WHERE id = $1 AND role = 'WORKER'`,
      [WORKER_ID],
    );
    if (workerRes.rowCount === 0) {
      throw new Error(`Worker ${WORKER_ID} not found or not a WORKER`);
    }

    // Get a category ID (any category from the worker's profile, or fallback)
    let categoryId = null;
    const catRes = await client.query(
      `SELECT "categoryId" FROM "WorkerCategory" WHERE "workerProfileId" IN (
        SELECT id FROM "WorkerProfile" WHERE "userId" = $1
      ) LIMIT 1`,
      [WORKER_ID],
    );
    if (catRes.rowCount > 0) {
      categoryId = catRes.rows[0].categoryId;
    } else {
      // fallback: pick any existing category
      const anyCat = await client.query(`SELECT id FROM "Category" LIMIT 1`);
      if (anyCat.rowCount === 0) {
        throw new Error("No categories found – please create one first.");
      }
      categoryId = anyCat.rows[0].id;
    }
    console.log(`✅ Using category: ${categoryId}`);

    // ── 3. Ensure hirer exists ──────────────────────────────────────────
    const hirerRes = await client.query(
      `SELECT id FROM "User" WHERE id = $1 AND role = 'HIRER'`,
      [HIRER_ID],
    );
    if (hirerRes.rowCount === 0) {
      throw new Error(`Hirer ${HIRER_ID} not found or not a HIRER`);
    }

    // ── 4. Add referral wallet balance to hirer ──────────────────────────
    await client.query(
      `UPDATE "User" SET "walletBalance" = "walletBalance" + 5000,
        "walletLifetimeTotal" = "walletLifetimeTotal" + 5000
       WHERE id = $1`,
      [HIRER_ID],
    );
    console.log(`💰 Added ₦5,000 referral balance to hirer.`);

    // ── 5. Define booking data ──────────────────────────────────────────
    const now = new Date();
    const bookingsData = [
      {
        title: "Test Booking – Hourly (10 hrs)",
        estimatedUnit: "hours",
        estimatedValue: "10",
        agreedRate: 500,
        scheduledAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
      },
      {
        title: "Test Booking – Daily (5 days)",
        estimatedUnit: "days",
        estimatedValue: "5",
        agreedRate: 1500,
        scheduledAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
      },
      {
        title: "Test Booking – Weekly (2 weeks)",
        estimatedUnit: "weeks",
        estimatedValue: "2",
        agreedRate: 5000,
        scheduledAt: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
      },
      {
        title: "Test Booking – Monthly (3 months)",
        estimatedUnit: "months",
        estimatedValue: "3",
        agreedRate: 20000,
        scheduledAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
      {
        title: "Test Booking – Custom (Website & App)",
        estimatedUnit: "custom",
        estimatedValue: "1",
        agreedRate: 5000,
        scheduledAt: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
      },
    ];

    // ── 6. Insert each booking ──────────────────────────────────────────
    for (const data of bookingsData) {
      // Compute estimatedHours (approx)
      let estimatedHours = null;
      if (data.estimatedUnit !== "custom") {
        const val = parseFloat(data.estimatedValue);
        if (data.estimatedUnit === "hours") estimatedHours = val;
        else if (data.estimatedUnit === "days") estimatedHours = val * 8;
        else if (data.estimatedUnit === "weeks") estimatedHours = val * 40;
        else if (data.estimatedUnit === "months") estimatedHours = val * 160;
      }

      const result = await client.query(
        `
        INSERT INTO "Booking" (
          id, "hirerId", "workerId", "categoryId",
          title, description, address, latitude, longitude,
          "scheduledAt", "estimatedHours", "estimatedUnit", "estimatedValue",
          "agreedRate", currency, status, notes,
          "jobType", "locationType", requirements, responsibilities,
          "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), $1, $2, $3,
          $4, $5, $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14, $15, $16,
          $17, $18, $19, $20,
          NOW(), NOW()
        )
        RETURNING id, title;
        `,
        [
          HIRER_ID,
          WORKER_ID,
          categoryId,
          data.title,
          `Test booking for ${data.title}`,
          "123 Test Street, Lagos, Nigeria",
          6.5244,
          3.3792,
          data.scheduledAt,
          estimatedHours,
          data.estimatedUnit,
          data.estimatedValue,
          data.agreedRate,
          "NGN",
          "ACCEPTED", // status so payment can be initiated
          "Created by seed script for testing.",
          "FULL_TIME",
          "ON_SITE",
          "Must have experience",
          "Complete the job as agreed",
        ],
      );
      const booking = result.rows[0];
      console.log(`✅ Created booking: "${booking.title}" (ID: ${booking.id})`);
    }

    // ── 7. Get final wallet balance for confirmation ────────────────────
    const balRes = await client.query(
      `SELECT "walletBalance" FROM "User" WHERE id = $1`,
      [HIRER_ID],
    );
    const balance = balRes.rows[0]?.walletBalance || 0;

    console.log("\n🎉 All test bookings created successfully!");
    console.log(`👉 Hirer can now visit /bookings and initiate payments.`);
    console.log(`👉 Referral wallet: ₦${balance} available.`);
  } catch (err) {
    console.error("❌ Error seeding bookings:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    console.log("🔌 Connection closed.");
  }
}

main();
