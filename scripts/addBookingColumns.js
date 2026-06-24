import prisma from "../src/config/database.js";
import dotenv from "dotenv";

dotenv.config();

async function addColumns() {
  const client = await prisma.$connect();
  try {
    console.log("🔍 Checking for missing columns in Booking...");

    // Check which columns already exist
    const res = await prisma.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'Booking'
      AND column_name IN ('requirements', 'responsibilities')
    `;
    const existing = res.map((r) => r.column_name);
    console.log("Existing columns:", existing.join(", ") || "none");

    // Add missing columns
    if (!existing.includes("requirements")) {
      console.log("📦 Adding column requirements...");
      await prisma.$executeRaw`ALTER TABLE "Booking" ADD COLUMN "requirements" TEXT;`;
    } else {
      console.log("✅ requirements column already exists.");
    }

    if (!existing.includes("responsibilities")) {
      console.log("📦 Adding column responsibilities...");
      await prisma.$executeRaw`ALTER TABLE "Booking" ADD COLUMN "responsibilities" TEXT;`;
    } else {
      console.log("✅ responsibilities column already exists.");
    }

    console.log("✅ All columns are up to date.");
  } catch (err) {
    console.error("❌ Error adding columns:", err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

addColumns();
