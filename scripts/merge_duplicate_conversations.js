// scripts/merge_duplicate_conversations.js
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
  console.log("✅ Connected");

  try {
    // Get all direct (non-booking) conversations with their users
    const { rows: convos } = await client.query(`
      SELECT c.id, c."createdAt"
      FROM "Conversation" c
      WHERE c."bookingId" IS NULL
      ORDER BY c."createdAt" ASC
    `);

    console.log(`Found ${convos.length} direct conversations`);

    // Get users for each conversation
    const { rows: convoUsers } = await client.query(
      `
      SELECT "conversationId", "userId"
      FROM "ConversationUser"
      WHERE "conversationId" = ANY($1)
    `,
      [convos.map((c) => c.id)],
    );

    // Group conversations by sorted user-pair key
    const usersByConvo = {};
    for (const cu of convoUsers) {
      if (!usersByConvo[cu.conversationId])
        usersByConvo[cu.conversationId] = [];
      usersByConvo[cu.conversationId].push(cu.userId);
    }

    const groups = {};
    for (const convo of convos) {
      const users = (usersByConvo[convo.id] || []).sort();
      if (users.length !== 2) continue; // skip non-2-person convos
      const key = users.join("|");
      if (!groups[key]) groups[key] = [];
      groups[key].push(convo.id);
    }

    let merged = 0;
    await client.query("BEGIN");

    for (const [key, ids] of Object.entries(groups)) {
      if (ids.length < 2) continue;

      const [keepId, ...dupIds] = ids; // keep oldest
      console.log(
        `  Pair ${key}: keeping ${keepId}, merging ${dupIds.length} duplicate(s)`,
      );

      for (const dupId of dupIds) {
        // Move all messages to the keeper conversation
        await client.query(
          `UPDATE "Message" SET "conversationId" = $1 WHERE "conversationId" = $2`,
          [keepId, dupId],
        );
        // Remove users from duplicate
        await client.query(
          `DELETE FROM "ConversationUser" WHERE "conversationId" = $1`,
          [dupId],
        );
        // Delete duplicate conversation
        await client.query(`DELETE FROM "Conversation" WHERE id = $1`, [dupId]);
        merged++;
      }

      // Bump updatedAt on keeper
      await client.query(
        `UPDATE "Conversation" SET "updatedAt" = NOW() WHERE id = $1`,
        [keepId],
      );
    }

    await client.query("COMMIT");
    console.log(`\n🎉 Done. Merged ${merged} duplicate conversations.`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
