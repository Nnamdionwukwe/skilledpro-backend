import { PrismaClient } from "./src/generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    "postgresql://postgres:fEWRzooUrCKKwRPHStLWAoJFCMtfRhyF@centerbeam.proxy.rlwy.net:17141/railway",
  ssl: false,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function seed() {
  console.log("🌱 Seeding sample posts...");

  const users = await prisma.user.findMany({
    take: 5,
    where: { isActive: true },
  });
  if (users.length === 0) {
    console.log("⚠️ No users found — run user seed first.");
    process.exit(0);
  }

  const samplePosts = [
    {
      content:
        "🚀 Excited to announce I just completed my 50th job on SkilledProz! From fixing leaking pipes in Lagos to wiring commercial buildings in Abuja — every job has been a learning experience. Thank you to all the amazing hirers who trusted me. 🙏\n\n#Electrician #SkilledProz #Nigeria",
      type: "ACHIEVEMENT",
    },
    {
      content:
        "💡 Pro tip for hirers: Always check a worker's verified badge and portfolio before booking. A verified worker has gone through our background check process and is more likely to deliver quality work.\n\nWhat do you look for when hiring a skilled worker? Drop it in the comments! 👇",
      type: "GENERAL",
    },
    {
      content:
        "🔧 Just finished a complete kitchen renovation — new plumbing, electrical, and tiling. The client was absolutely thrilled with the results!\n\nIf you need quality home improvement services in Lagos, I'm available. Book me on SkilledProz! 🏠",
      type: "PORTFOLIO",
    },
    {
      content:
        "📢 HIRING: Looking for experienced electricians in Port Harcourt for a 3-month commercial project.\n\nRequirements:\n✅ Minimum 3 years experience\n✅ Verified on SkilledProz\n✅ Available immediately\n\nApply through SkilledProz or send a message. Pay is competitive! 💰",
      type: "HIRING",
    },
    {
      content:
        "The job market is changing fast. More companies are now looking for skilled trade workers than ever before. If you have a skill — plumbing, carpentry, electrical, cleaning — there has never been a better time to monetise it online.\n\nSkilledProz connects you with clients across Africa and beyond. Sign up today! 🌍",
      type: "ANNOUNCEMENT",
    },
  ];

  let count = 0;
  for (const user of users) {
    for (const p of samplePosts.slice(0, 2)) {
      await prisma.post.create({
        data: {
          authorId: user.id,
          content: p.content,
          type: p.type,
          isPublic: true,
        },
      });
      count++;
    }
  }

  console.log(`✅ Created ${count} sample posts`);
  console.log(`📊 Total posts: ${await prisma.post.count()}`);
  await prisma.$disconnect();
  await pool.end();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
