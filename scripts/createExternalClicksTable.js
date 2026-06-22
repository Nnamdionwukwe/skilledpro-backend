import prisma from "../src/config/database.js";

async function main() {
  console.log("🔍 Checking if ExternalJobClick table exists...");

  // Check if table already exists
  const tableCheck = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'ExternalJobClick'
    );
  `;

  const exists = tableCheck[0].exists;
  if (exists) {
    console.log("✅ Table ExternalJobClick already exists. Skipping creation.");
    await prisma.$disconnect();
    return;
  }

  console.log("📦 Creating ExternalJobClick table...");

  // Create the table
  await prisma.$executeRaw`
    CREATE TABLE "ExternalJobClick" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "jobPostId" UUID NOT NULL,
      "userId" UUID NOT NULL,
      type VARCHAR(50) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ExternalJobClick_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id") ON DELETE CASCADE,
      CONSTRAINT "ExternalJobClick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    );
  `;

  console.log("✅ Table created.");

  // Create indexes
  console.log("📦 Creating indexes...");
  await prisma.$executeRaw`
    CREATE UNIQUE INDEX "ExternalJobClick_jobPostId_userId_type_key" ON "ExternalJobClick"("jobPostId", "userId", "type");
  `;
  await prisma.$executeRaw`
    CREATE INDEX "ExternalJobClick_jobPostId_idx" ON "ExternalJobClick"("jobPostId");
  `;
  await prisma.$executeRaw`
    CREATE INDEX "ExternalJobClick_userId_idx" ON "ExternalJobClick"("userId");
  `;
  await prisma.$executeRaw`
    CREATE INDEX "ExternalJobClick_type_idx" ON "ExternalJobClick"("type");
  `;

  console.log("✅ All indexes created.");
  console.log("🎉 ExternalJobClick table is ready!");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("❌ Error creating table:", err);
  prisma.$disconnect();
  process.exit(1);
});
