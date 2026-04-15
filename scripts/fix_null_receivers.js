// scripts/fix_null_receivers.js
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
    await client.query("BEGIN");

    // For each message with null receiverId, find the OTHER user in the conversation
    const { rows: broken } = await client.query(`
      SELECT m.id, m."conversationId", m."senderId"
      FROM "Message" m
      WHERE m."receiverId" IS NULL
    `);
    console.log(`Found ${broken.length} messages with null receiverId`);

    for (const msg of broken) {
      // Find the other user in the conversation (not the sender)
      const { rows: convoUsers } = await client.query(
        `SELECT "userId" FROM "ConversationUser"
         WHERE "conversationId" = $1 AND "userId" != $2`,
        [msg.conversationId, msg.senderId],
      );
      if (convoUsers.length > 0) {
        await client.query(
          `UPDATE "Message" SET "receiverId" = $1 WHERE id = $2`,
          [convoUsers[0].userId, msg.id],
        );
      }
    }

    await client.query("COMMIT");
    console.log("Done fixing null receiverIds");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed:", err.message);
  } finally {
    client.release();
    await pool.end();
  }
}
run().catch(console.error);
