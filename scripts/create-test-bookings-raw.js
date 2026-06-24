import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

const HIRER_ID = "8f2a4340-c1e4-4086-b059-2ea98c8265ee";
const WORKER_FIRST_NAME = "Gideon";
const WORKER_LAST_NAME = "Solace";

// ── Helpers ──────────────────────────────────────────────────────────────
function randomFutureDate(daysMin = 1, daysMax = 30) {
  const now = new Date();
  const days = Math.floor(Math.random() * (daysMax - daysMin + 1)) + daysMin;
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(Math.floor(Math.random() * 12) + 8, 0, 0, 0);
  return date;
}

function randomFloat(min, max, decimals = 2) {
  const val = Math.random() * (max - min) + min;
  return parseFloat(val.toFixed(decimals));
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomId() {
  // For PostgreSQL, we can use gen_random_uuid() in the query,
  // but for safety we can generate one here.
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

    // ── Find worker by name ──────────────────────────────────────────────
    console.log(
      `🔍 Looking for worker: ${WORKER_FIRST_NAME} ${WORKER_LAST_NAME}...`,
    );
    const workerRes = await client.query(
      `SELECT u.id, u."firstName", u."lastName", wp.id as "profileId"
       FROM "User" u
       JOIN "WorkerProfile" wp ON u.id = wp."userId"
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

    // ── Fetch categories ──────────────────────────────────────────────────
    const catRes = await client.query(`SELECT * FROM "Category" LIMIT 20;`);
    const categories = catRes.rows;
    if (categories.length === 0) {
      console.error("❌ No categories found. Please seed categories first.");
      return;
    }
    console.log(`✅ ${categories.length} categories available.`);

    // ── Predefined options ──────────────────────────────────────────────
    const jobTypes = ["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY"];
    const locationTypes = ["REMOTE", "ON_SITE", "HYBRID"];
    const statuses = [
      "PENDING",
      "ACCEPTED",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
      "DISPUTED",
    ];
    const units = ["hours", "days", "weeks", "months"];
    const currencies = ["NGN", "USD"];
    const addresses = [
      "123 Main St, Lagos, Nigeria",
      "456 Ikoyi Road, Lagos, Nigeria",
      "789 Victoria Island, Lagos, Nigeria",
      "12 Ahmadu Bello Way, Abuja, Nigeria",
      "34 Awolowo Road, Ikoyi, Lagos",
      "56 Marine Road, Apapa, Lagos",
    ];

    // ── Generate 6 bookings ──────────────────────────────────────────────
    console.log("📦 Generating 6 test bookings for Gideon Solace...\n");

    for (let i = 0; i < 6; i++) {
      const category = pickRandom(categories);
      const jobType = pickRandom(jobTypes);
      const locationType = pickRandom(locationTypes);
      const status = pickRandom(statuses);
      const unit = pickRandom(units);
      const currency = pickRandom(currencies);

      // Duration value (estimatedValue) – number of units
      const value = randomFloat(1, 10, 1);
      const valueStr = String(value);

      // Compute estimatedHours based on unit
      let hours = null;
      switch (unit) {
        case "hours":
          hours = value;
          break;
        case "days":
          hours = value * 8;
          break;
        case "weeks":
          hours = value * 40;
          break;
        case "months":
          hours = value * 160;
          break;
        default:
          hours = value;
      }
      hours = parseFloat(hours.toFixed(2));

      // Agreed rate (per unit)
      const agreedRate = randomFloat(10, 200, 2);

      // Negotiation
      const isNegotiated = Math.random() > 0.5;
      let negotiatedRate = null;
      let negotiationNote = null;
      if (isNegotiated) {
        negotiatedRate = randomFloat(5, 250, 2);
        negotiationNote = "Agreed rate via chat – 10% discount for bulk work.";
      }

      // Schedule
      const scheduledAt = randomFutureDate(1, 30);

      // Address
      const address =
        locationType === "REMOTE" ? "Remote" : pickRandom(addresses);

      // Generate a unique ID for the booking
      const bookingId = randomId();

      // Query – include all fields
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
        RETURNING id, title;
      `;

      const values = [
        bookingId,
        HIRER_ID,
        worker.id,
        category.id,
        `Test Booking ${i + 1}: ${category.name} – ${jobType.replace("_", " ")}`,
        `This is a test booking for worker ${worker.firstName} ${worker.lastName}.`,
        address,
        6.5244 + (Math.random() - 0.5) * 0.2,
        3.3792 + (Math.random() - 0.5) * 0.2,
        scheduledAt,
        hours,
        unit,
        valueStr,
        isNegotiated ? negotiatedRate : agreedRate,
        currency,
        `Test note ${i + 1}: Please confirm availability.`,
        jobType,
        locationType,
        isNegotiated,
        isNegotiated ? negotiatedRate : null,
        isNegotiated ? negotiationNote : null,
        "Must have at least 3 years of experience in this field.",
        "Deliver high-quality work within the agreed timeframe.",
        status,
        status === "COMPLETED" ? new Date() : null,
        status === "IN_PROGRESS" ? new Date() : null,
      ];

      const res = await client.query(query, values);
      console.log(
        `✅ Booking "${res.rows[0].title}" created (ID: ${res.rows[0].id})`,
      );
      console.log(
        `   Status: ${status}, Unit: ${unit}, Value: ${valueStr}, Hours: ${hours}`,
      );
      console.log(`   Negotiated: ${isNegotiated ? "Yes" : "No"}`);
      console.log("---");
    }

    console.log("🎉 Done!");
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
