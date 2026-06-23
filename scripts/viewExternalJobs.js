import prisma from "../src/config/database.js";
import dotenv from "dotenv";

dotenv.config();

async function viewJobs() {
  const jobs = await prisma.jobPost.findMany({
    where: { isExternal: true },
    include: {
      categories: { include: { category: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`📊 Found ${jobs.length} external jobs:`);
  jobs.forEach((job, idx) => {
    console.log(`\n${idx + 1}. ${job.title} at ${job.companyName}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Location: ${job.address || job.location}`);
    console.log(`   Application Methods:`);
    console.log(`     URL: ${job.applicationUrl || "—"}`);
    console.log(`     Email: ${job.applicationEmail || "—"}`);
    console.log(`     WhatsApp: ${job.applicationWhatsApp || "—"}`);
    console.log(`     Phone: ${job.applicationPhone || "—"}`);
    console.log(
      `   Skills: ${job.skills.length ? job.skills.join(", ") : "—"}`,
    );
    console.log(
      `   Categories: ${job.categories.map((c) => c.category.name).join(", ")}`,
    );
  });
}

viewJobs()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
