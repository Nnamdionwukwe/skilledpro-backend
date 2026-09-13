// seed-categories.mjs — upserts all categories from categories-master.json
import { PrismaClient } from "./src/generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import fs from "fs";
import "dotenv/config";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set. Check your .env file.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const raw = fs.readFileSync("./categories-master.json", "utf-8");
  const categories = JSON.parse(raw);

  console.log(`Loaded ${categories.length} categories from categories-master.json`);

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const cat of categories) {
    try {
      const existing = await prisma.category.findUnique({
        where: { slug: cat.slug },
      });

      if (existing) {
        await prisma.category.update({
          where: { slug: cat.slug },
          data: {
            name: cat.name,
            icon: cat.icon || null,
          },
        });
        updated++;
      } else {
        await prisma.category.create({
          data: {
            name: cat.name,
            slug: cat.slug,
            icon: cat.icon || null,
          },
        });
        created++;
      }

      if ((created + updated) % 100 === 0) {
        console.log(`  Progress: ${created + updated}/${categories.length}`);
      }
    } catch (err) {
      console.error(`  ❌ Failed: ${cat.slug} — ${err.message}`);
      failed++;
    }
  }

  const total = await prisma.category.count();

  console.log("");
  console.log("═══════════════════════════════════════");
  console.log(`  Created:  ${created}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Total in DB: ${total}`);
  console.log("═══════════════════════════════════════");
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
