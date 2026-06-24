import prisma from "../src/config/database.js";
import dotenv from "dotenv";

dotenv.config();

const HIRER_ID = "8f2a4340-c1e4-4086-b059-2ea98c8265ee";

// ─── Helper to get or create a category ──────────────────────────────────────
async function getOrCreateCategory(name, icon = "📁") {
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  const existing = await prisma.category.findUnique({ where: { slug } });
  if (existing) return existing;
  return await prisma.category.create({
    data: { name, slug, icon, description: `${name} category` },
  });
}

// ─── Main seeding function ──────────────────────────────────────────────────
async function seedJobs() {
  console.log(`🔍 Seeding jobs for hirer: ${HIRER_ID}`);

  // Verify hirer exists
  const hirer = await prisma.user.findUnique({
    where: { id: HIRER_ID },
  });
  if (!hirer) {
    console.error(`❌ Hirer with ID ${HIRER_ID} not found.`);
    process.exit(1);
  }
  console.log(`✅ Hirer found: ${hirer.firstName} ${hirer.lastName}`);

  // ── Define categories (will be created if missing) ────────────────────────
  const categories = {
    dev: await getOrCreateCategory("Software Development", "💻"),
    design: await getOrCreateCategory("Design", "🎨"),
    marketing: await getOrCreateCategory("Marketing", "📊"),
    writing: await getOrCreateCategory("Writing", "✍️"),
    hr: await getOrCreateCategory("Human Resources", "👥"),
  };

  // ── Job data ────────────────────────────────────────────────────────────────
  const jobs = [
    {
      title: "Senior Full Stack Developer",
      categoryId: categories.dev.id,
      description:
        "We are looking for an experienced full stack developer to join our product team. You'll work on our core platform using React, Node.js, and PostgreSQL.",
      locationType: "REMOTE",
      address: null,
      jobType: "FULL_TIME",
      scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
      estimatedHours: 40,
      estimatedUnit: "hours",
      estimatedValue: "40",
      budgetType: "FIXED",
      budget: 250000,
      currency: "NGN",
      durationType: "DAYS",
      durationValue: "30",
      skills: ["React", "Node.js", "PostgreSQL", "TypeScript", "AWS"],
      notes: "We are a fast-growing startup with a remote-first culture.",
    },
    {
      title: "UI/UX Designer",
      categoryId: categories.design.id,
      description:
        "We need a talented UI/UX designer to redesign our mobile app and web dashboard. You'll work closely with product and engineering teams.",
      locationType: "HYBRID",
      address: "Lagos, Nigeria",
      jobType: "CONTRACT",
      scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      estimatedHours: 20,
      estimatedUnit: "hours",
      estimatedValue: "20",
      budgetType: "HOURLY",
      budget: 15000,
      currency: "NGN",
      durationType: "WEEKS",
      durationValue: "4",
      skills: ["Figma", "Adobe XD", "UI/UX", "User Research", "Prototyping"],
      notes: "This is a 3-month contract with possible extension.",
    },
    {
      title: "Digital Marketing Specialist",
      categoryId: categories.marketing.id,
      description:
        "We're hiring a digital marketing specialist to lead our SEO and social media campaigns. You'll manage our blog, LinkedIn, and email marketing.",
      locationType: "REMOTE",
      address: null,
      jobType: "PART_TIME",
      scheduledAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      estimatedHours: 15,
      estimatedUnit: "hours",
      estimatedValue: "15",
      budgetType: "HOURLY",
      budget: 10000,
      currency: "NGN",
      durationType: "MONTHS",
      durationValue: "3",
      skills: [
        "SEO",
        "Social Media",
        "Email Marketing",
        "Content Strategy",
        "Analytics",
      ],
      notes: "Flexible hours – we need someone passionate about growth.",
    },
    {
      title: "Content Writer",
      categoryId: categories.writing.id,
      description:
        "We are looking for a talented content writer to create blog posts, case studies, and website copy. Must have excellent English and research skills.",
      locationType: "REMOTE",
      address: null,
      jobType: "CONTRACT",
      scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      estimatedHours: 10,
      estimatedUnit: "hours",
      estimatedValue: "10",
      budgetType: "HOURLY",
      budget: 8000,
      currency: "NGN",
      durationType: "WEEKS",
      durationValue: "2",
      skills: [
        "Content Writing",
        "Copywriting",
        "SEO",
        "Research",
        "WordPress",
      ],
      notes: "We need 5 articles per week for the next 4 weeks.",
    },
    {
      title: "HR Coordinator",
      categoryId: categories.hr.id,
      description:
        "We need an HR coordinator to manage recruitment, onboarding, and employee records. This is a full-time remote role.",
      locationType: "REMOTE",
      address: null,
      jobType: "FULL_TIME",
      scheduledAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      estimatedHours: 40,
      estimatedUnit: "hours",
      estimatedValue: "40",
      budgetType: "MONTHLY",
      budget: 180000,
      currency: "NGN",
      durationType: "MONTHS",
      durationValue: "6",
      skills: [
        "Recruitment",
        "Onboarding",
        "HRIS",
        "Employee Relations",
        "Communication",
      ],
      notes: "Must have prior experience in HR or people operations.",
    },
  ];

  // ── Insert jobs ──────────────────────────────────────────────────────────────
  for (const jobData of jobs) {
    const created = await prisma.jobPost.create({
      data: {
        hirerId: HIRER_ID,
        categoryId: jobData.categoryId,
        title: jobData.title,
        description: jobData.description,
        locationType: jobData.locationType,
        address: jobData.address,
        latitude: null,
        longitude: null,
        jobType: jobData.jobType,
        scheduledAt: jobData.scheduledAt,
        estimatedHours: jobData.estimatedHours,
        estimatedUnit: jobData.estimatedUnit,
        estimatedValue: jobData.estimatedValue,
        budgetType: jobData.budgetType,
        budget: jobData.budget,
        currency: jobData.currency,
        durationType: jobData.durationType,
        durationValue: jobData.durationValue,
        skills: jobData.skills,
        notes: jobData.notes,
        status: "OPEN", // all jobs open
        isExternal: false,
        // Additional fields that may be optional but are part of the schema
        companyName: `${hirer.firstName} ${hirer.lastName}`,
        salaryText: null,
        applicationUrl: null,
        sourcePlatform: null,
        minQualification: null,
        experienceLevel: null,
        experienceLength: null,
        languageRequirement: null,
        workingHours: null,
        applicantLocation: null,
        responsibilities: null,
        requirements: null,
        expiryDate: null,
        postedByAdminId: null,
      },
      include: {
        category: true,
        hirer: { select: { firstName: true, lastName: true } },
      },
    });

    console.log(`✅ Created job: "${created.title}" (ID: ${created.id})`);
    console.log(`   Category: ${created.category.name}`);
    console.log(`   Budget: ${created.currency} ${created.budget}`);
    console.log(`   Skills: ${created.skills.join(", ")}`);
    console.log(`   Status: ${created.status}`);
    console.log("---");
  }

  console.log("🎉 Seeding complete!");
  await prisma.$disconnect();
}

seedJobs().catch((err) => {
  console.error("❌ Seeding failed:", err);
  prisma.$disconnect();
  process.exit(1);
});
