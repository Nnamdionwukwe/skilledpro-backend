import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false, // or true if required by Railway
  max: 5,
});

async function main() {
  const client = await pool.connect();
  try {
    console.log("🔍 Checking if ExternalJobClick table exists...");

    // Check if table exists
    const res = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'ExternalJobClick'
      );
    `);

    if (res.rows[0].exists) {
      console.log("✅ Table ExternalJobClick already exists. Skipping.");
      return;
    }

    console.log("📦 Creating ExternalJobClick table...");

    // Create the table with foreign keys
    await client.query(`
      CREATE TABLE "ExternalJobClick" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "jobPostId" UUID NOT NULL,
        "userId" UUID NOT NULL,
        type VARCHAR(50) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ExternalJobClick_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id") ON DELETE CASCADE,
        CONSTRAINT "ExternalJobClick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
      );
    `);

    console.log("✅ Table created.");

    // Create indexes
    console.log("📦 Creating indexes...");
    await client.query(`
      CREATE UNIQUE INDEX "ExternalJobClick_jobPostId_userId_type_key" ON "ExternalJobClick"("jobPostId", "userId", "type");
    `);
    await client.query(`
      CREATE INDEX "ExternalJobClick_jobPostId_idx" ON "ExternalJobClick"("jobPostId");
    `);
    await client.query(`
      CREATE INDEX "ExternalJobClick_userId_idx" ON "ExternalJobClick"("userId");
    `);
    await client.query(`
      CREATE INDEX "ExternalJobClick_type_idx" ON "ExternalJobClick"("type");
    `);

    console.log("✅ All indexes created.");
    console.log("🎉 ExternalJobClick table is ready!");
  } catch (err) {
    console.error("❌ Error:", err.message);
    if (err.code === "42P01") {
      console.error(
        "   → This means the referenced table (JobPost or User) does not exist.",
      );
      console.error(
        "   → Please run `npx prisma db push` first to create the base tables.",
      );
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
