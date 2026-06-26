import pg from "pg";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

// ── Helpers ──────────────────────────────────────────────────────────────
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const REASONS = [
  "PAYMENT_NOT_RELEASED",
  "WORK_NOT_COMPLETED",
  "POOR_QUALITY_WORK",
  "NO_SHOW",
  "OVERCHARGING",
  "HARASSMENT",
  "DAMAGE_TO_PROPERTY",
  "OTHER",
];

const DESCRIPTIONS = [
  "The work was not completed as agreed. We discussed a full website build but only got a landing page.",
  "Payment is overdue by 2 weeks. I've sent multiple reminders but no response.",
  "The quality delivered was far below expectations – many bugs and unfinished features.",
  "The worker never showed up on the scheduled start date.",
  "The invoice charges $500 more than the agreed rate.",
  "Received inappropriate messages during the job.",
  "A valuable item was damaged during the work.",
  "Other issues – the job scope was not followed as discussed.",
];

function generateEvidence() {
  const count = randomInt(1, 3);
  const urls = [];
  for (let i = 0; i < count; i++) {
    const id = randomInt(1, 200);
    urls.push(`https://picsum.photos/id/${id}/400/300`);
  }
  return urls;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();
  try {
    console.log("🔌 Connected to Railway...");
    await client.query("BEGIN");

    // Fetch bookings that are not already disputed
    const bookingRes = await client.query(`
      SELECT id, "hirerId", "workerId", title, status
      FROM "Booking"
      WHERE status IN ('ACCEPTED', 'IN_PROGRESS', 'COMPLETED')
        AND "disputeReason" IS NULL
      ORDER BY "createdAt" DESC
      LIMIT 10;
    `);
    let bookings = bookingRes.rows;

    if (bookings.length < 5) {
      console.warn(
        `⚠️  Only ${bookings.length} eligible bookings found. Need at least 5.`,
      );
      console.warn("Creating additional test bookings...");

      const userRes = await client.query(
        `SELECT id FROM "User" WHERE role = 'HIRER' LIMIT 1;`,
      );
      const hirers = userRes.rows;
      const workerRes = await client.query(
        `SELECT id FROM "User" WHERE role = 'WORKER' LIMIT 1;`,
      );
      const workers = workerRes.rows;
      if (hirers.length === 0 || workers.length === 0) {
        console.error(
          "❌ Need at least one hirer and one worker to create test bookings.",
        );
        return;
      }
      const hirerId = hirers[0].id;
      const workerId = workers[0].id;

      for (let i = 0; i < 5; i++) {
        const id = randomUUID();
        const title = `Test Booking ${i + 1} for Dispute`;
        const description = `This booking was created for dispute testing.`;
        const scheduledAt = new Date(
          Date.now() + 86400000 * (i + 1),
        ).toISOString();
        const agreedRate = 50 + i * 20;
        const currency = "NGN";
        const address = "123 Test Street, Lagos";
        const latitude = 6.5244 + (Math.random() - 0.5) * 0.1;
        const longitude = 3.3792 + (Math.random() - 0.5) * 0.1;
        const catRes = await client.query(`SELECT id FROM "Category" LIMIT 1;`);
        const categoryId = catRes.rows[0]?.id || null;

        await client.query(
          `
          INSERT INTO "Booking" (
            id, "hirerId", "workerId", "categoryId", title, description,
            address, latitude, longitude, "scheduledAt", "agreedRate", currency,
            status, "estimatedUnit", "estimatedValue", "createdAt", "updatedAt"
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ACCEPTED', 'hours', '4', NOW(), NOW()
          )
        `,
          [
            id,
            hirerId,
            workerId,
            categoryId,
            title,
            description,
            address,
            latitude,
            longitude,
            scheduledAt,
            agreedRate,
            currency,
          ],
        );
        console.log(`📦 Created test booking: ${title} (ID: ${id})`);
        bookings.push({ id, hirerId, workerId, title, status: "ACCEPTED" });
      }
    }

    const selected = bookings.slice(0, 5);
    console.log(
      `✅ Found ${selected.length} bookings to update with disputes.`,
    );

    const scenarios = [
      {
        status: "DISPUTED",
        reason: "PAYMENT_NOT_RELEASED",
        description: pickRandom(DESCRIPTIONS),
        evidence: generateEvidence(),
      },
      {
        status: "DISPUTED",
        reason: "WORK_NOT_COMPLETED",
        description: pickRandom(DESCRIPTIONS),
        evidence: generateEvidence(),
      },
      {
        status: "COMPLETED",
        reason: "POOR_QUALITY_WORK",
        description: pickRandom(DESCRIPTIONS),
        evidence: generateEvidence(),
        resolved: true,
      },
      {
        status: "CANCELLED",
        reason: "NO_SHOW",
        description: pickRandom(DESCRIPTIONS),
        evidence: generateEvidence(),
        cancelled: true,
      },
      {
        status: "DISPUTED",
        reason: "OVERCHARGING",
        description: pickRandom(DESCRIPTIONS),
        evidence: generateEvidence(),
      },
    ];

    for (let i = 0; i < selected.length; i++) {
      const booking = selected[i];
      const scenario = scenarios[i % scenarios.length];
      const now = new Date().toISOString();

      // Build the SQL – use ARRAY[...]::text[] for text[] column
      const query = `
        UPDATE "Booking"
        SET
          status = $1,
          "disputeReason" = $2,
          "disputeDescription" = $3,
          "disputeEvidence" = $4::text[],
          "updatedAt" = $5,
          "completedAt" = $6,
          "cancelReason" = $7
        WHERE id = $8
        RETURNING id, title, status, "disputeReason";
      `;

      const values = [
        scenario.status,
        scenario.reason,
        scenario.description,
        scenario.evidence, // array of strings – cast to text[] in query
        now,
        scenario.status === "COMPLETED" ? now : null,
        scenario.cancelled ? "Dispute cancelled by user" : null,
        booking.id,
      ];

      const res = await client.query(query, values);
      if (res.rows.length > 0) {
        console.log(
          `✅ Dispute ${i + 1} for "${booking.title}" -> Status: ${scenario.status}, Reason: ${scenario.reason}, Evidence: ${scenario.evidence.length} images`,
        );
      } else {
        console.warn(`⚠️ Failed to update booking ${booking.id}`);
      }
    }

    await client.query("COMMIT");
    console.log("🎉 5 test disputes created successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error:", err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
