// scripts/seed-external-jobs.js
import dotenv from "dotenv";
dotenv.config();

// ── Import the shared Prisma client from your app ────────────────────────
import prisma from "../src/config/database.js";

import bcrypt from "bcrypt";

// ─── Configuration ──────────────────────────────────────────────────────────

const ADMIN_EMAIL = "ctocglobal368@gmail.com";
const ADMIN_PASSWORD = "12345678";

const JOB_TEMPLATES = [
  {
    title: "Senior Frontend Engineer",
    companyName: "TechCorp Inc.",
    location: "Remote (Nigeria)",
    jobType: "FULL_TIME",
    salaryText: "₦500,000 – ₦700,000 / month",
    description:
      "We are looking for a Senior Frontend Engineer to lead our React Native team...",
    responsibilities:
      "- Architect and build scalable mobile apps\n- Mentor junior developers\n- Write clean, maintainable code",
    requirements:
      "- 5+ years of React experience\n- Strong TypeScript skills\n- Experience with Expo\n- Excellent communication",
    minQualification: "B.Sc. in Computer Science or equivalent",
    experienceLevel: "Senior level",
    experienceLength: "5+ years",
    languageRequirement: "English",
    workingHours: "Full Time – Flexible Hours",
    applicantLocation: "Nigeria",
    applicationUrl: "https://www.linkedin.com/jobs/view/123456789",
    sourcePlatform: "LinkedIn",
    expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  },
  {
    title: "Full Stack Developer (Node.js + React)",
    companyName: "InnoWave Solutions",
    location: "Lagos, Nigeria (Hybrid)",
    jobType: "CONTRACT",
    salaryText: "₦800,000 – ₦1,200,000 / project",
    description: "Build a payment gateway integration for a fintech startup...",
    responsibilities:
      "- Develop REST APIs with Node.js\n- Build admin dashboard with React\n- Integrate Paystack and Flutterwave",
    requirements:
      "- 3+ years Node.js\n- React + Redux\n- PostgreSQL\n- Experience with payment APIs",
    minQualification: "B.Sc. in Engineering or related",
    experienceLevel: "Mid level",
    experienceLength: "3+ years",
    languageRequirement: "English",
    workingHours: "Contract – 3 months",
    applicantLocation: "Lagos",
    applicationUrl: "https://ng.indeed.com/jobs?q=full+stack&l=Lagos",
    sourcePlatform: "Indeed",
    expiryDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
  },
  {
    title: "Product Manager (Fintech)",
    companyName: "PayDash Africa",
    location: "Abuja, Nigeria",
    jobType: "FULL_TIME",
    salaryText: "₦650,000 / month",
    description:
      "Drive product vision for our cross‑border payment platform...",
    responsibilities:
      "- Define product roadmap\n- Collaborate with engineering and design\n- Conduct user research\n- Analyze metrics",
    requirements:
      "- 4+ years product management\n- Fintech experience\n- Strong analytical skills\n- Excellent stakeholder management",
    minQualification: "MBA or equivalent experience",
    experienceLevel: "Senior level",
    experienceLength: "4+ years",
    languageRequirement: "English",
    workingHours: "Full Time",
    applicantLocation: "Abuja",
    applicationUrl: "https://www.jobberman.com/job/987654",
    sourcePlatform: "Jobberman",
    expiryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
  },
  {
    title: "UI/UX Designer",
    companyName: "CreativePulse Studios",
    location: "Remote (Worldwide)",
    jobType: "PART_TIME",
    salaryText: "₦250,000 – ₦350,000 / month",
    description:
      "Design intuitive interfaces for a global e‑learning platform...",
    responsibilities:
      "- Create wireframes and prototypes\n- Conduct usability testing\n- Develop design systems\n- Collaborate with frontend engineers",
    requirements:
      "- 3+ years UI/UX\n- Figma expert\n- Experience with design tokens\n- Portfolio required",
    minQualification: "Diploma in Design or related",
    experienceLevel: "Mid level",
    experienceLength: "3+ years",
    languageRequirement: "English",
    workingHours: "Part Time – 20 hrs/week",
    applicantLocation: "Remote",
    applicationUrl: "https://www.upwork.com/jobs/1234567890",
    sourcePlatform: "Upwork",
    expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  },
  {
    title: "DevOps Engineer (AWS/Kubernetes)",
    companyName: "CloudScale Networks",
    location: "Lagos, Nigeria",
    jobType: "FULL_TIME",
    salaryText: "₦900,000 – ₦1,100,000 / month",
    description:
      "Manage and scale cloud infrastructure for a high‑growth SaaS...",
    responsibilities:
      "- Design and maintain Kubernetes clusters\n- Implement CI/CD pipelines\n- Monitor and optimise performance\n- Ensure security and compliance",
    requirements:
      "- 5+ years DevOps\n- AWS certified\n- Terraform and Ansible\n- Strong Linux skills",
    minQualification: "B.Sc. in Computer Science or IT",
    experienceLevel: "Senior level",
    experienceLength: "5+ years",
    languageRequirement: "English",
    workingHours: "Full Time",
    applicantLocation: "Lagos",
    applicationUrl: "https://www.glassdoor.com/job/1234567890",
    sourcePlatform: "Glassdoor",
    expiryDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRandomCategory(categories) {
  return categories[Math.floor(Math.random() * categories.length)];
}

// ─── Main Seeding Function ──────────────────────────────────────────────────

async function seedExternalJobs() {
  console.log("🚀 Starting external job seeding...");

  // ── Check database ──────────────────────────────────────────────────────
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("✅ Database connection successful.");
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  }

  // ── 1. Get or create admin ─────────────────────────────────────────────
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

  // ── 2. Categories ───────────────────────────────────────────────────────
  let categories = await prisma.category.findMany();
  if (categories.length === 0) {
    console.log("⚠️  No categories found. Creating placeholders...");
    const seedCategories = [
      { name: "Engineering", slug: "engineering" },
      { name: "Design", slug: "design" },
      { name: "Product", slug: "product" },
      { name: "Marketing", slug: "marketing" },
      { name: "Operations", slug: "operations" },
    ];
    await prisma.category.createMany({ data: seedCategories });
    categories = await prisma.category.findMany();
    console.log(`✅ Created ${categories.length} categories.`);
  } else {
    console.log(`✅ Found ${categories.length} existing categories.`);
  }

  // ── 3. Insert jobs ──────────────────────────────────────────────────────
  let createdCount = 0;
  for (const template of JOB_TEMPLATES) {
    // Check duplicate
    const existing = await prisma.jobPost.findFirst({
      where: { applicationUrl: template.applicationUrl },
    });
    if (existing) {
      console.log(`⏭️  Job "${template.title}" already exists. Skipping.`);
      continue;
    }

    const category = getRandomCategory(categories);
    if (!category) {
      console.log("❌ No categories available. Skipping job.");
      continue;
    }

    const jobData = {
      title: template.title,
      hirerId: admin.id, // Required relation
      categoryId: category.id,
      description: template.description,
      budget: 0,
      currency: "NGN",
      scheduledAt: new Date(),
      // External fields
      companyName: template.companyName,
      address: template.location,
      jobType: template.jobType,
      salaryText: template.salaryText,
      responsibilities: template.responsibilities,
      requirements: template.requirements,
      minQualification: template.minQualification,
      experienceLevel: template.experienceLevel,
      experienceLength: template.experienceLength,
      languageRequirement: template.languageRequirement,
      workingHours: template.workingHours,
      applicantLocation: template.applicantLocation,
      applicationUrl: template.applicationUrl,
      sourcePlatform: template.sourcePlatform,
      expiryDate: template.expiryDate,
      isExternal: true,
      postedByAdminId: admin.id,
      status: "OPEN",
      estimatedHours: 0,
      // Many‑to‑many categories
      categories: {
        create: [{ categoryId: category.id }],
      },
    };

    try {
      const job = await prisma.jobPost.create({
        data: jobData,
        include: {
          categories: { include: { category: true } },
          postedByAdmin: true,
        },
      });
      console.log(`✅ Created job: "${job.title}" at ${job.companyName}`);
      createdCount++;
    } catch (error) {
      console.error(
        `❌ Failed to create job "${template.title}":`,
        error.message,
      );
    }
  }

  console.log(`🎉 Seeding complete. Created ${createdCount} jobs.`);
}

// ─── Run ──────────────────────────────────────────────────────────────────────

seedExternalJobs()
  .catch((err) => {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
