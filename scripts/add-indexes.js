// scripts/add-indexes.js
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function addIndexes() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Indexes for performance
    await client.query(
      `CREATE INDEX IF NOT EXISTS "JobPost_createdAt_idx" ON "JobPost"("createdAt" DESC);`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "JobPost_status_idx" ON "JobPost"("status");`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "JobPost_isExternal_idx" ON "JobPost"("isExternal");`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "Booking_status_idx" ON "Booking"("status");`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "Booking_createdAt_idx" ON "Booking"("createdAt" DESC);`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "User_isActive_idx" ON "User"("isActive");`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "User_isBanned_idx" ON "User"("isBanned");`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt" DESC);`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "Payment_status_idx" ON "Payment"("status");`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "Payment_createdAt_idx" ON "Payment"("createdAt" DESC);`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "Withdrawal_status_idx" ON "Withdrawal"("status");`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "Withdrawal_createdAt_idx" ON "Withdrawal"("createdAt" DESC);`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "Review_createdAt_idx" ON "Review"("createdAt" DESC);`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "Notification_userId_idx" ON "Notification"("userId");`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt" DESC);`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "JobApplication_jobPostId_idx" ON "JobApplication"("jobPostId");`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "JobApplication_workerId_idx" ON "JobApplication"("workerId");`,
    );

    await client.query("COMMIT");
    console.log("✅ Indexes created successfully.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Index creation failed:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

addIndexes();
