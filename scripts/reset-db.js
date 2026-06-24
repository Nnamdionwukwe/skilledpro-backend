// Run with: node scripts/add-yearly-rate.js

import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("🔌 Connected to Railway database...\n");

    await client.query("BEGIN");

    // ── Add yearlyRate column if not exists ────────────────────────────
    console.log("Checking/adding yearlyRate column...");

    const { rows: colCheck } = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'WorkerProfile' AND column_name = 'yearlyRate';
    `);

    if (colCheck.length === 0) {
      await client.query(`
        ALTER TABLE "WorkerProfile"
        ADD COLUMN "yearlyRate" DOUBLE PRECISION;
      `);
      console.log("  ✅ yearlyRate column added");
    } else {
      console.log("  ⏩ yearlyRate column already exists");
    }

    // ── Seed admin user if missing ──────────────────────────────────────
    console.log("\nSeeding admin user...");

    const adminEmail = "admin@skilledproz.com";
    const adminPasswordHash = "$2a$12$..."; // Replace with your real hash

    const { rows: adminCheck } = await client.query(
      `SELECT id FROM "User" WHERE email = $1;`,
      [adminEmail],
    );

    if (adminCheck.length === 0) {
      await client.query(
        `
        INSERT INTO "User" (
          id, email, password, role, "firstName", "lastName",
          "isEmailVerified", "isActive", currency, language
        ) VALUES (
          gen_random_uuid()::text, $1, $2, 'ADMIN', 'Admin', 'User',
          true, true, 'USD', 'en'
        );
      `,
        [adminEmail, adminPasswordHash],
      );
      console.log(`  ✅ Admin created: ${adminEmail}`);
    } else {
      console.log(`  ⏩ Admin already exists`);
    }

    // ── Seed default categories if missing ─────────────────────────────
    console.log("\nSeeding categories...");

    const categories = [
      { name: "Web Development", slug: "web-development", icon: "💻" },
      { name: "Mobile Development", slug: "mobile-development", icon: "📱" },
      { name: "Design", slug: "design", icon: "🎨" },
      { name: "Writing", slug: "writing", icon: "✍️" },
      { name: "Data Science", slug: "data-science", icon: "📊" },
    ];

    for (const cat of categories) {
      const { rows } = await client.query(
        `SELECT id FROM "Category" WHERE slug = $1;`,
        [cat.slug],
      );
      if (rows.length === 0) {
        await client.query(
          `
          INSERT INTO "Category" (id, name, slug, icon)
          VALUES (gen_random_uuid()::text, $1, $2, $3);
        `,
          [cat.name, cat.slug, cat.icon],
        );
        console.log(`  ✅ Category "${cat.name}" created`);
      } else {
        console.log(`  ⏩ Category "${cat.name}" already exists`);
      }
    }

    await client.query("COMMIT");

    console.log(
      "\n🎉 Migration complete! yearlyRate column added and seeding done.",
    );

    // ── Verify ────────────────────────────────────────────────────────────
    const { rows: verify } = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'WorkerProfile' AND column_name = 'yearlyRate';
    `);
    console.log(
      `\n📋 Verified: yearlyRate column ${verify.length > 0 ? "✅ exists" : "❌ missing"}`,
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    console.log("🔌 Connection closed.");
  }
}

migrate();
