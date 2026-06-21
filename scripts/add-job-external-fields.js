// // scripts/add-external-job-fields.js
// import pg from "pg";
// import dotenv from "dotenv";
// dotenv.config();

// const pool = new pg.Pool({
//   connectionString: process.env.DATABASE_URL,
//   ssl: false,
// });

// async function migrate() {
//   const client = await pool.connect();
//   try {
//     console.log("🔌 Connected to Railway database...");
//     await client.query("BEGIN");

//     // Create enum types
//     await client.query(`
//       DO $$ BEGIN
//         CREATE TYPE "SalaryPeriod" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');
//       EXCEPTION
//         WHEN duplicate_object THEN null;
//       END $$;
//     `);
//     console.log("  ✅ SalaryPeriod enum created");

//     await client.query(`
//       DO $$ BEGIN
//         CREATE TYPE "EducationLevel" AS ENUM ('HIGH_SCHOOL', 'DIPLOMA', 'BACHELOR', 'MASTER', 'DOCTORATE', 'CERTIFICATION', 'OTHER');
//       EXCEPTION
//         WHEN duplicate_object THEN null;
//       END $$;
//     `);
//     console.log("  ✅ EducationLevel enum created");

//     // Add columns if they don't exist
//     await client.query(`
//       ALTER TABLE "JobPost"
//         ADD COLUMN IF NOT EXISTS "salaryAmount"    DOUBLE PRECISION,
//         ADD COLUMN IF NOT EXISTS "salaryCurrency"  TEXT,
//         ADD COLUMN IF NOT EXISTS "salaryPeriod"    "SalaryPeriod",
//         ADD COLUMN IF NOT EXISTS "educationLevel"  "EducationLevel";
//     `);
//     console.log("  ✅ Added columns with enum types");

//     // Add indexes
//     await client.query(`
//       CREATE INDEX IF NOT EXISTS "JobPost_salaryCurrency_idx" ON "JobPost"("salaryCurrency");
//       CREATE INDEX IF NOT EXISTS "JobPost_salaryPeriod_idx" ON "JobPost"("salaryPeriod");
//     `);
//     console.log("  ✅ Indexes created");

//     await client.query("COMMIT");
//     console.log("🎉 Migration complete!");
//   } catch (err) {
//     await client.query("ROLLBACK");
//     console.error("❌ Migration failed:", err.message);
//     process.exit(1);
//   } finally {
//     client.release();
//     await pool.end();
//   }
// }

// migrate();
