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

    // ── Find worker ──────────────────────────────────────────────────────
    console.log(
      `🔍 Looking for worker: ${WORKER_FIRST_NAME} ${WORKER_LAST_NAME}...`,
    );
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

    // ── Fetch categories ──────────────────────────────────────────────────
    const catRes = await client.query(`SELECT * FROM "Category" LIMIT 20;`);
    const categories = catRes.rows;
    if (categories.length === 0) {
      console.error("❌ No categories found. Please seed categories first.");
      return;
    }
    const category = pickRandom(categories);
    console.log(`✅ Selected category: ${category.name}`);

    // ── Yearly booking details ──────────────────────────────────────────
    const unit = "years";
    const value = randomFloat(1, 3, 1); // 1 to 3 years
    const valueStr = String(value);
    const hours = parseFloat((value * 1920).toFixed(2)); // 40h/week * 48 weeks

    const agreedRate = randomFloat(1000, 5000, 2); // higher rate per year
    const currency = "NGN";
    const jobType = pickRandom([
      "FULL_TIME",
      "PART_TIME",
      "CONTRACT",
      "TEMPORARY",
    ]);
    const locationType = pickRandom(["REMOTE", "ON_SITE", "HYBRID"]);
    const status = "PENDING"; // you can change to ACCEPTED if needed
    const scheduledAt = randomFutureDate(1, 30);
    const address =
      locationType === "REMOTE" ? "Remote" : "123 Test Street, Lagos, Nigeria";

    // ── Insert the booking ──────────────────────────────────────────────
    const bookingId = randomId();

    const query = `
      INSERT INTO "Booking" (
        id, "hirerId", "workerId", "categoryId", title, description,
        address, latitude, longitude, "scheduledAt", "estimatedHours",
        "estimatedUnit", "estimatedValue", "agreedRate", currency,
        notes, "jobType", "locationType", "isNegotiated",
        requirements, responsibilities, status, "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, NOW(), NOW()
      )
      RETURNING id, title, "estimatedUnit", "estimatedValue", "estimatedHours";
    `;

    const values = [
      bookingId,
      HIRER_ID,
      worker.id,
      category.id,
      `Yearly Contract: ${category.name} (${value} year${value > 1 ? "s" : ""})`,
      `This is a yearly booking for worker ${worker.firstName} ${worker.lastName}.`,
      address,
      6.5244 + (Math.random() - 0.5) * 0.2,
      3.3792 + (Math.random() - 0.5) * 0.2,
      scheduledAt,
      hours,
      unit,
      valueStr,
      agreedRate,
      currency,
      `Yearly booking note: ${value} year(s) at ${currency} ${agreedRate} per year.`,
      jobType,
      locationType,
      false, // isNegotiated = false
      "Must have extensive experience in this field.",
      "Deliver high-quality work throughout the year.",
      status,
    ];

    const res = await client.query(query, values);
    const booking = res.rows[0];
    console.log(`\n✅ Yearly booking created!`);
    console.log(`   ID: ${booking.id}`);
    console.log(`   Title: ${booking.title}`);
    console.log(`   Unit: ${booking.estimatedUnit}`);
    console.log(`   Value: ${booking.estimatedValue}`);
    console.log(`   Hours: ${booking.estimatedHours}`);
    console.log(`   Rate: ${currency} ${agreedRate}/year`);
    console.log(`   Status: ${status}`);
    console.log(`   Scheduled: ${scheduledAt.toLocaleString()}`);

    console.log("\n🎉 Done!");
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
