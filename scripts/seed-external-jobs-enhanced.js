// scripts/seed-external-jobs-enhanced.js
import dotenv from "dotenv";
dotenv.config();

import prisma from "../src/config/database.js"; // ← shared instance
import bcrypt from "bcrypt";

// ─── Sample job data with new fields ──────────────────────────────────────
const sampleJobs = [
  {
    title: "Senior Software Engineer",
    companyName: "GlobalTech Inc.",
    address: "Remote",
    locationType: "REMOTE",
    jobType: "FULL_TIME",
    salaryAmount: 120000,
    salaryCurrency: "USD",
    salaryPeriod: "YEARLY",
    salaryText: "$120,000 / year",
    description: "Build cutting-edge SaaS products...",
    responsibilities: "Develop features, mentor juniors...",
    requirements: "5+ years experience...",
    minQualification: "BACHELOR",
    experienceLevel: "Senior level",
    experienceLength: "5 years",
    languageRequirement: "English",
    workingHours: "Full Time",
    applicantLocation: "United States",
    applicationUrl: "https://example.com/job/1",
    sourcePlatform: "LinkedIn",
  },
  {
    title: "Full Stack Developer",
    companyName: "InnoWave Solutions",
    address: "Lagos, Nigeria",
    locationType: "HYBRID",
    jobType: "FULL_TIME",
    salaryAmount: 750000,
    salaryCurrency: "NGN",
    salaryPeriod: "MONTHLY",
    salaryText: "₦750,000 / month",
    description: "Build payment gateway integrations...",
    responsibilities: "Develop APIs, frontend dashboards...",
    requirements: "3+ years Node.js, React...",
    minQualification: "BACHELOR",
    experienceLevel: "Mid level",
    experienceLength: "3 years",
    languageRequirement: "English",
    workingHours: "Full Time",
    applicantLocation: "Nigeria",
    applicationUrl: "https://example.com/job/2",
    sourcePlatform: "Indeed",
  },
  {
    title: "Product Manager (Fintech)",
    companyName: "PayDash Africa",
    address: "Abuja, Nigeria",
    locationType: "ON_SITE",
    jobType: "FULL_TIME",
    salaryAmount: 650000,
    salaryCurrency: "NGN",
    salaryPeriod: "MONTHLY",
    salaryText: "₦650,000 / month",
    description: "Drive product vision for cross‑border payments...",
    responsibilities: "Define roadmap, collaborate with engineering...",
    requirements: "4+ years product management, fintech experience...",
    minQualification: "MASTER",
    experienceLevel: "Senior level",
    experienceLength: "4 years",
    languageRequirement: "English",
    workingHours: "Full Time",
    applicantLocation: "Nigeria",
    applicationUrl: "https://example.com/job/3",
    sourcePlatform: "Jobberman",
  },
  {
    title: "UI/UX Designer",
    companyName: "CreativePulse Studios",
    address: "Remote",
    locationType: "REMOTE",
    jobType: "PART_TIME",
    salaryAmount: 35000,
    salaryCurrency: "USD",
    salaryPeriod: "MONTHLY",
    salaryText: "$35,000 / month",
    description: "Design intuitive interfaces for e‑learning...",
    responsibilities: "Wireframes, prototypes, user testing...",
    requirements: "3+ years UI/UX, Figma expert...",
    minQualification: "DIPLOMA",
    experienceLevel: "Mid level",
    experienceLength: "3 years",
    languageRequirement: "English",
    workingHours: "Part Time – 20 hrs/week",
    applicantLocation: "Remote",
    applicationUrl: "https://example.com/job/4",
    sourcePlatform: "Upwork",
  },
  {
    title: "DevOps Engineer (AWS/Kubernetes)",
    companyName: "CloudScale Networks",
    address: "Lagos, Nigeria",
    locationType: "HYBRID",
    jobType: "FULL_TIME",
    salaryAmount: 900000,
    salaryCurrency: "NGN",
    salaryPeriod: "MONTHLY",
    salaryText: "₦900,000 / month",
    description: "Manage and scale cloud infrastructure...",
    responsibilities: "Kubernetes, CI/CD, monitoring...",
    requirements: "5+ years DevOps, AWS certified...",
    minQualification: "BACHELOR",
    experienceLevel: "Senior level",
    experienceLength: "5 years",
    languageRequirement: "English",
    workingHours: "Full Time",
    applicantLocation: "Nigeria",
    applicationUrl: "https://example.com/job/5",
    sourcePlatform: "Glassdoor",
  },
];

// ─── Main seeding function ──────────────────────────────────────────────────
async function seed() {
  console.log("🚀 Seeding external jobs with enhanced fields...");

  // 1. Get or create admin user
  const ADMIN_EMAIL = "ctocglobal368@gmail.com";
  const ADMIN_PASSWORD = "12345678";

  let admin = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
  });

  if (!admin) {
    console.log(`⚠️  Admin not found. Creating...`);
    const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
    admin = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        password: hashed,
        role: "ADMIN",
        firstName: "Admin",
        lastName: "User",
        isActive: true,
        isEmailVerified: true,
      },
    });
    console.log(`✅ Admin created: ${admin.email}`);
  } else {
    console.log(`✅ Using existing admin: ${admin.email}`);
  }

  // 2. Get categories (or create dummy ones)
  let categories = await prisma.category.findMany();
  if (categories.length === 0) {
    console.log("⚠️  No categories found. Creating placeholders...");
    const seedCategories = [
      { name: "Engineering", slug: "engineering" },
      { name: "Design", slug: "design" },
      { name: "Product", slug: "product" },
      { name: "Marketing", slug: "marketing" },
      { name: "Finance", slug: "finance" },
    ];
    await prisma.category.createMany({ data: seedCategories });
    categories = await prisma.category.findMany();
    console.log(`✅ Created ${categories.length} categories.`);
  } else {
    console.log(`✅ Found ${categories.length} existing categories.`);
  }

  // 3. Insert each job
  let createdCount = 0;
  for (const job of sampleJobs) {
    // Check duplicate by applicationUrl
    const existing = await prisma.jobPost.findFirst({
      where: { applicationUrl: job.applicationUrl },
    });
    if (existing) {
      console.log(`⏭️  Job "${job.title}" already exists. Skipping.`);
      continue;
    }

    const category = categories[Math.floor(Math.random() * categories.length)];
    if (!category) {
      console.log("❌ No category available. Skipping job.");
      continue;
    }

    const jobData = {
      ...job,
      postedByAdminId: admin.id,
      hirerId: admin.id,
      categoryId: category.id,
      categories: {
        create: [{ categoryId: category.id }],
      },
      isExternal: true,
      status: "OPEN",
      budget: 0,
      currency: job.salaryCurrency || "USD",
      scheduledAt: new Date(),
      estimatedHours: 0,
    };

    try {
      const created = await prisma.jobPost.create({
        data: jobData,
        include: {
          categories: { include: { category: true } },
        },
      });
      console.log(
        `✅ Created job: "${created.title}" at ${created.companyName}`,
      );
      createdCount++;
    } catch (err) {
      console.error(`❌ Failed to create job "${job.title}":`, err.message);
    }
  }

  console.log(`🎉 Seeding complete. Created ${createdCount} jobs.`);
}

// ─── Run ──────────────────────────────────────────────────────────────────────
seed()
  .catch((err) => {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
