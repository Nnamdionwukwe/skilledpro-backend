// scripts/check_message_receivers.js
import "dotenv/config";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({
  connectionString:
    "postgresql://postgres:fEWRzooUrCKKwRPHStLWAoJFCMtfRhyF@centerbeam.proxy.rlwy.net:17141/railway",
  ssl: false,
});

async function run() {
  const client = await pool.connect();
  try {
    const { rows: nulls } = await client.query(
      `SELECT COUNT(*) as count FROM "Message" WHERE "receiverId" IS NULL`,
    );
    console.log("Messages with null receiverId:", nulls[0].count);

    const { rows: byRole } = await client.query(`
      SELECT sender.role as "senderRole", receiver.role as "receiverRole",
             m."isRead", COUNT(*) as count
      FROM "Message" m
      JOIN "User" sender  ON sender.id  = m."senderId"
      JOIN "User" receiver ON receiver.id = m."receiverId"
      GROUP BY sender.role, receiver.role, m."isRead"
      ORDER BY sender.role, receiver.role
    `);
    console.log("Message counts by role + read status:", byRole);
  } finally {
    client.release();
    await pool.end();
  }
}
run().catch(console.error);
