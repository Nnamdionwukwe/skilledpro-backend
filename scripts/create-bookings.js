import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

const HIRER_ID = "8f2a4340-c1e4-4086-b059-2ea98c8265ee";

function randomFutureDate() {
  const now = new Date();
  const days = Math.floor(Math.random() * 14) + 1;
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(Math.floor(Math.random() * 12) + 8, 0, 0, 0);
  return date;
}

function randomFloat(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log("🔌 Connected to Railway database...");

    // ── Fetch workers (limit to 10, include user info) ──
    const workersRes = await client.query(`
      SELECT wp.*, u.id as "userId", u."firstName", u."lastName"
      FROM "WorkerProfile" wp
      JOIN "User" u ON wp."userId" = u.id
      LIMIT 10;
    `);
    const workers = workersRes.rows;
    if (workers.length === 0) {
      console.error("❌ No workers found.");
      return;
    }

    // ── Fetch categories ──
    const catRes = await client.query(`SELECT * FROM "Category" LIMIT 10;`);
    const categories = catRes.rows;
    if (categories.length === 0) {
      console.error("❌ No categories found.");
      return;
    }

    console.log(
      `✅ Found ${workers.length} workers and ${categories.length} categories.`,
    );

    // ── Insert 5 bookings ──
    for (let i = 0; i < 5; i++) {
      const worker = workers[Math.floor(Math.random() * workers.length)];
      const category =
        categories[Math.floor(Math.random() * categories.length)];

      const scheduledAt = randomFutureDate();
      const agreedRate = randomFloat(10, 100);
      const estimatedHours = randomFloat(2, 8);
      const statuses = ["PENDING", "ACCEPTED", "IN_PROGRESS", "COMPLETED"];
      const status = statuses[Math.floor(Math.random() * statuses.length)];

      const latitude = 6.5244 + (Math.random() - 0.5) * 0.1;
      const longitude = 3.3792 + (Math.random() - 0.5) * 0.1;

      // Generate a UUID for the booking
      const id = crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 15);

      const query = `
        INSERT INTO "Booking" (
          id, "hirerId", "workerId", "categoryId", title, description,
          address, latitude, longitude, "scheduledAt", "estimatedHours",
          "agreedRate", currency, notes, status, "jobType", "locationType",
          "estimatedUnit", "estimatedValue", "isNegotiated", "completedAt", "checkInAt",
          "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW(), NOW()
        )
        RETURNING id, title;
      `;

      const values = [
        id,
        HIRER_ID,
        worker.userId,
        category.id,
        `Sample Booking ${i + 1}: ${category.name}`,
        `This is a test booking for worker ${worker.firstName} ${worker.lastName}.`,
        "123 Test Street, Lagos, Nigeria",
        latitude,
        longitude,
        scheduledAt,
        estimatedHours,
        agreedRate,
        "NGN",
        `Test note ${i + 1}`,
        status,
        "FULL_TIME",
        "ON_SITE",
        "hours",
        String(Math.round(estimatedHours * agreedRate * 100) / 100),
        false,
        status === "COMPLETED" ? new Date() : null,
        status === "IN_PROGRESS" ? new Date() : null,
      ];

      const res = await client.query(query, values);
      console.log(
        `✅ Booking "${res.rows[0].title}" created (ID: ${res.rows[0].id})`,
      );
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
