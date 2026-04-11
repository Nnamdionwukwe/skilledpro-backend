import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("Checking worker profile columns...");

  // These are fire-and-forget ALTER TABLE — safe to run even if columns exist
  const queries = [
    `ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "dailyRate" DECIMAL(10,2)`,
    `ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "weeklyRate" DECIMAL(10,2)`,
    `ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "monthlyRate" DECIMAL(10,2)`,
    `ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "customRate" DECIMAL(10,2)`,
    `ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "customRateLabel" TEXT`,
    `ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "pricingNote" TEXT`,
    `ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "profileCurrency" TEXT DEFAULT 'USD'`,
  ];

  for (const q of queries) {
    try {
      await prisma.$executeRawUnsafe(q);
      console.log("✅", q.slice(0, 60));
    } catch (e) {
      console.log("⚠️  skipped:", e.message.slice(0, 60));
    }
  }
  console.log("Done.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
