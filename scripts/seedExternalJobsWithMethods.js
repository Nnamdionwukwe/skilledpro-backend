import prisma from "../src/config/database.js";
import dotenv from "dotenv";

dotenv.config();

// ─── Sample job data ──────────────────────────────────────────────────────
const jobData = [
  {
    title: "Senior Full Stack Developer",
    companyName: "TechVibe Inc.",
    location: "San Francisco, CA",
    jobType: "FULL_TIME",
    salaryMin: 120000,
    salaryMax: 160000,
    salaryCurrency: "USD",
    salaryPeriod: "YEARLY",
    salaryText: "$120,000 – $160,000 / year",
    educationLevel: "BACHELOR",
    locationType: "REMOTE",
    description:
      "Build scalable web applications using React, Node.js, and PostgreSQL.",
    responsibilities:
      "Design and implement new features\nOptimize performance\nCollaborate with product teams",
    requirements:
      "5+ years full stack experience\nExpert in React and Node.js\nPostgreSQL and cloud experience",
    minQualification: "Bachelor's in CS or equivalent",
    experienceLevel: "Senior level",
    experienceLength: "5+ years",
    languageRequirement: "English",
    workingHours: "9:00 AM – 5:00 PM PST",
    applicantLocation: "USA (Remote)",
    applicationUrl: "https://www.linkedin.com/jobs/view/1234567890",
    applicationEmail: "",
    applicationWhatsApp: "",
    applicationPhone: "",
    sourcePlatform: "LinkedIn",
    expiryDate: "2026-12-31T23:59:59.000Z",
    categoryName: "Software Development",
    skills: ["React", "Node.js", "PostgreSQL", "AWS", "TypeScript"],
  },
  {
    title: "Marketing Manager",
    companyName: "GrowthPulse",
    location: "New York, NY",
    jobType: "FULL_TIME",
    salaryMin: 90000,
    salaryMax: 120000,
    salaryCurrency: "USD",
    salaryPeriod: "YEARLY",
    salaryText: "$90,000 – $120,000 / year",
    educationLevel: "BACHELOR",
    locationType: "HYBRID",
    description: "Drive marketing strategy for a fast-growing SaaS company.",
    responsibilities:
      "Develop multi-channel campaigns\nAnalyze market trends\nManage a team of 3",
    requirements:
      "5+ years marketing experience\nB2B SaaS track record\nStrong analytics",
    minQualification: "Bachelor's in Marketing",
    experienceLevel: "Mid level",
    experienceLength: "5+ years",
    languageRequirement: "English",
    workingHours: "Flexible",
    applicantLocation: "New York area",
    applicationUrl: "",
    applicationEmail: "careers@growthpulse.com",
    applicationWhatsApp: "",
    applicationPhone: "",
    sourcePlatform: "Company Website",
    expiryDate: "2026-11-15T23:59:59.000Z",
    categoryName: "Marketing",
    skills: ["Digital Marketing", "SEO", "Content Strategy", "Analytics"],
  },
  {
    title: "Data Analyst",
    companyName: "DataFusion",
    location: "Austin, TX",
    jobType: "FULL_TIME",
    salaryMin: 75000,
    salaryMax: 95000,
    salaryCurrency: "USD",
    salaryPeriod: "YEARLY",
    salaryText: "$75,000 – $95,000 / year",
    educationLevel: "BACHELOR",
    locationType: "REMOTE",
    description: "Analyze large datasets to drive business decisions.",
    responsibilities:
      "Clean and transform data\nCreate dashboards\nPresent insights",
    requirements:
      "3+ years data analysis\nSQL and Python proficiency\nTableau or Power BI",
    minQualification: "Bachelor's in Statistics or related",
    experienceLevel: "Mid level",
    experienceLength: "3+ years",
    languageRequirement: "English",
    workingHours: "9:00 AM – 6:00 PM CST",
    applicantLocation: "USA (Remote)",
    applicationUrl: "https://www.glassdoor.com/job-listing/456789",
    applicationEmail: "",
    applicationWhatsApp: "",
    applicationPhone: "",
    sourcePlatform: "Glassdoor",
    expiryDate: "2026-10-30T23:59:59.000Z",
    categoryName: "Data Science",
    skills: ["SQL", "Python", "Tableau", "Excel", "Statistics"],
  },
  {
    title: "Sales Representative",
    companyName: "SalesGenie",
    location: "Chicago, IL",
    jobType: "FULL_TIME",
    salaryMin: 50000,
    salaryMax: 70000,
    salaryCurrency: "USD",
    salaryPeriod: "YEARLY",
    salaryText: "$50,000 – $70,000 / year + commission",
    educationLevel: "HIGH_SCHOOL",
    locationType: "ON_SITE",
    description: "Drive revenue for B2B software products.",
    responsibilities: "Prospect and qualify leads\nConduct demos\nClose deals",
    requirements:
      "2+ years sales experience\nExcellent communication\nTrack record of hitting targets",
    minQualification: "High School Diploma",
    experienceLevel: "Entry level",
    experienceLength: "2+ years",
    languageRequirement: "English",
    workingHours: "8:30 AM – 5:30 PM CST",
    applicantLocation: "Chicago area",
    applicationUrl: "",
    applicationEmail: "",
    applicationWhatsApp: "+12345678901",
    applicationPhone: "",
    sourcePlatform: "Monster",
    expiryDate: "2026-09-20T23:59:59.000Z",
    categoryName: "Sales",
    skills: ["Sales", "Negotiation", "CRM", "Communication"],
  },
  {
    title: "Product Designer",
    companyName: "DesignStudio",
    location: "Los Angeles, CA",
    jobType: "FULL_TIME",
    salaryMin: 85000,
    salaryMax: 110000,
    salaryCurrency: "USD",
    salaryPeriod: "YEARLY",
    salaryText: "$85,000 – $110,000 / year",
    educationLevel: "BACHELOR",
    locationType: "HYBRID",
    description: "Shape user experience of mobile and web products.",
    responsibilities:
      "Create wireframes and prototypes\nConduct user research\nMaintain design system",
    requirements:
      "4+ years product design experience\nFigma and Adobe Creative Suite\nStrong portfolio",
    minQualification: "Bachelor's in Design",
    experienceLevel: "Mid level",
    experienceLength: "4+ years",
    languageRequirement: "English",
    workingHours: "9:00 AM – 6:00 PM PST",
    applicantLocation: "Los Angeles area",
    applicationUrl: "",
    applicationEmail: "",
    applicationWhatsApp: "",
    applicationPhone: "+12345678902",
    sourcePlatform: "CareerBuilder",
    expiryDate: "2026-11-10T23:59:59.000Z",
    categoryName: "Design",
    skills: ["Figma", "UI/UX", "Prototyping", "Adobe XD", "User Research"],
  },
  {
    title: "DevOps Engineer",
    companyName: "CloudOps",
    location: "Seattle, WA",
    jobType: "CONTRACT",
    salaryMin: 100000,
    salaryMax: 140000,
    salaryCurrency: "USD",
    salaryPeriod: "YEARLY",
    salaryText: "$100,000 – $140,000 / year (contract)",
    educationLevel: "BACHELOR",
    locationType: "REMOTE",
    description: "Manage cloud infrastructure and CI/CD pipelines.",
    responsibilities:
      "Design and maintain AWS infrastructure\nAutomate with Terraform\nMonitor performance",
    requirements:
      "5+ years DevOps experience\nAWS, Docker, Kubernetes\nScripting (Python/Bash)",
    minQualification: "Bachelor's in CS or related",
    experienceLevel: "Senior level",
    experienceLength: "5+ years",
    languageRequirement: "English",
    workingHours: "Flexible",
    applicantLocation: "USA (Remote)",
    applicationUrl: "https://www.simplyhired.com/job/567890",
    applicationEmail: "",
    applicationWhatsApp: "",
    applicationPhone: "",
    sourcePlatform: "SimplyHired",
    expiryDate: "2026-12-01T23:59:59.000Z",
    categoryName: "DevOps",
    skills: ["AWS", "Terraform", "Kubernetes", "Docker", "CI/CD"],
  },
  {
    title: "Content Writer",
    companyName: "ContentCraft",
    location: "Remote",
    jobType: "PART_TIME",
    salaryMin: 25,
    salaryMax: 35,
    salaryCurrency: "USD",
    salaryPeriod: "HOURLY",
    salaryText: "$25 – $35 / hour",
    educationLevel: "BACHELOR",
    locationType: "REMOTE",
    description: "Create engaging content for blogs and websites.",
    responsibilities:
      "Research and write articles\nEdit and proofread\nOptimize for SEO",
    requirements:
      "2+ years writing experience\nExcellent grammar\nBasic SEO knowledge",
    minQualification: "Bachelor's in English or Journalism",
    experienceLevel: "Entry level",
    experienceLength: "2+ years",
    languageRequirement: "English",
    workingHours: "Flexible (20 hours/week)",
    applicantLocation: "Worldwide (Remote)",
    applicationUrl: "",
    applicationEmail: "apply@contentcraft.com",
    applicationWhatsApp: "",
    applicationPhone: "",
    sourcePlatform: "JobStreet",
    expiryDate: "2026-12-15T23:59:59.000Z",
    categoryName: "Writing",
    skills: ["Writing", "Editing", "SEO", "Research", "WordPress"],
  },
  {
    title: "Human Resources Generalist",
    companyName: "HR Connect",
    location: "Boston, MA",
    jobType: "FULL_TIME",
    salaryMin: 70000,
    salaryMax: 90000,
    salaryCurrency: "USD",
    salaryPeriod: "YEARLY",
    salaryText: "$70,000 – $90,000 / year",
    educationLevel: "BACHELOR",
    locationType: "ON_SITE",
    description: "Manage HR operations including recruiting and onboarding.",
    responsibilities:
      "Full-cycle recruitment\nCoordinate onboarding\nManage employee records",
    requirements:
      "3+ years HR experience\nKnowledge of employment laws\nExcellent interpersonal skills",
    minQualification: "Bachelor's in HR or related",
    experienceLevel: "Mid level",
    experienceLength: "3+ years",
    languageRequirement: "English",
    workingHours: "8:00 AM – 5:00 PM EST",
    applicantLocation: "Boston area",
    applicationUrl: "",
    applicationEmail: "",
    applicationWhatsApp: "",
    applicationPhone: "+12345678903",
    sourcePlatform: "Reed",
    expiryDate: "2026-10-05T23:59:59.000Z",
    categoryName: "Human Resources",
    skills: [
      "Recruitment",
      "Onboarding",
      "HRIS",
      "Employee Relations",
      "Benefits",
    ],
  },
  {
    title: "Network Engineer",
    companyName: "NetSecure",
    location: "Dallas, TX",
    jobType: "FULL_TIME",
    salaryMin: 90000,
    salaryMax: 120000,
    salaryCurrency: "USD",
    salaryPeriod: "YEARLY",
    salaryText: "$90,000 – $120,000 / year",
    educationLevel: "BACHELOR",
    locationType: "ON_SITE",
    description: "Design and maintain network infrastructure.",
    responsibilities:
      "Configure routers, switches, and firewalls\nTroubleshoot network issues\nEnsure security",
    requirements:
      "5+ years networking experience\nCCNP or equivalent\nCisco and Juniper",
    minQualification: "Bachelor's in CS or related",
    experienceLevel: "Senior level",
    experienceLength: "5+ years",
    languageRequirement: "English",
    workingHours: "8:00 AM – 6:00 PM CST",
    applicantLocation: "Dallas area",
    applicationUrl: "https://www.totaljobs.com/job/456789",
    applicationEmail: "",
    applicationWhatsApp: "",
    applicationPhone: "",
    sourcePlatform: "Totaljobs",
    expiryDate: "2026-11-20T23:59:59.000Z",
    categoryName: "IT/Networking",
    skills: ["Cisco", "Juniper", "Firewalls", "BGP", "Wireshark"],
  },
  {
    title: "Customer Support Representative",
    companyName: "SupportHero",
    location: "Phoenix, AZ",
    jobType: "FULL_TIME",
    salaryMin: 40000,
    salaryMax: 50000,
    salaryCurrency: "USD",
    salaryPeriod: "YEARLY",
    salaryText: "$40,000 – $50,000 / year",
    educationLevel: "HIGH_SCHOOL",
    locationType: "REMOTE",
    description:
      "Provide exceptional customer support via chat, email, and phone.",
    responsibilities:
      "Respond to inquiries\nTroubleshoot issues\nDocument feedback",
    requirements:
      "1+ years customer service experience\nExcellent communication\nFamiliarity with CRM tools",
    minQualification: "High School Diploma",
    experienceLevel: "Entry level",
    experienceLength: "1+ years",
    languageRequirement: "English",
    workingHours: "9:00 AM – 6:00 PM MST",
    applicantLocation: "USA (Remote)",
    applicationUrl: "",
    applicationEmail: "support@supporthero.com",
    applicationWhatsApp: "+12345678904",
    applicationPhone: "",
    sourcePlatform: "ZipRecruiter",
    expiryDate: "2026-12-25T23:59:59.000Z",
    categoryName: "Customer Service",
    skills: ["Customer Support", "Troubleshooting", "CRM", "Communication"],
  },
];

// ─── Main seeding function ────────────────────────────────────────────────
async function seedExternalJobs() {
  console.log("🔍 Seeding external jobs...");

  // Find or create an admin user
  let adminUser = await prisma.user.findFirst({
    where: { role: "ADMIN" },
  });

  if (!adminUser) {
    console.warn("⚠️ No admin user found. Creating a default admin...");
    adminUser = await prisma.user.create({
      data: {
        email: "admin@example.com",
        password: "$2b$10$defaultHash", // placeholder – not used for login
        firstName: "Admin",
        lastName: "User",
        role: "ADMIN",
        isActive: true,
        isBanned: false,
      },
    });
    console.log(`✅ Created admin user: ${adminUser.email}`);
  }

  console.log(`👤 Using admin: ${adminUser.email}`);

  // Process each job
  for (const job of jobData) {
    // 1. Upsert category by slug
    const slug = job.categoryName.toLowerCase().replace(/\s+/g, "-");
    const category = await prisma.category.upsert({
      where: { slug },
      update: {
        name: job.categoryName,
        description: `${job.categoryName} category`,
      },
      create: {
        name: job.categoryName,
        slug,
        description: `${job.categoryName} category`,
      },
    });
    console.log(`📁 Using category: ${category.name} (slug: ${slug})`);

    // 2. Check if this job already exists (by title, company, external)
    const existingJob = await prisma.jobPost.findFirst({
      where: {
        title: job.title,
        companyName: job.companyName,
        isExternal: true,
      },
    });

    if (existingJob) {
      console.log(
        `⏭️ Job "${job.title}" at ${job.companyName} already exists. Skipping.`,
      );
      continue;
    }

    // 3. Prepare job data with new fields
    const jobPostData = {
      title: job.title,
      companyName: job.companyName,
      address: job.location,
      jobType: job.jobType,
      salaryText: job.salaryText,
      description: job.description,
      responsibilities: job.responsibilities,
      requirements: job.requirements,
      minQualification: job.minQualification,
      experienceLevel: job.experienceLevel,
      experienceLength: job.experienceLength,
      languageRequirement: job.languageRequirement,
      workingHours: job.workingHours,
      applicantLocation: job.applicantLocation,
      // ── Application methods ──
      applicationUrl: job.applicationUrl || null,
      applicationEmail: job.applicationEmail || null,
      applicationWhatsApp: job.applicationWhatsApp || null,
      applicationPhone: job.applicationPhone || null,
      // ── Skills ──
      skills: job.skills || [],
      sourcePlatform: job.sourcePlatform,
      expiryDate: new Date(job.expiryDate),
      isExternal: true,
      hirerId: adminUser.id,
      postedByAdminId: adminUser.id,
      status: "OPEN",
      budget: 0,
      currency: "NGN",
      scheduledAt: new Date(),
      estimatedHours: 0,
      salaryAmount: null,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency,
      salaryPeriod: job.salaryPeriod,
      educationLevel: job.educationLevel,
      locationType: job.locationType,
      categoryId: category.id,
      categories: {
        create: [{ categoryId: category.id }],
      },
    };

    // 4. Insert job
    const created = await prisma.jobPost.create({
      data: jobPostData,
    });

    console.log(`✅ Created job: "${created.title}" at ${created.companyName}`);
    console.log(
      `   Methods: URL=${created.applicationUrl ? "✓" : "✗"} Email=${created.applicationEmail ? "✓" : "✗"} WhatsApp=${created.applicationWhatsApp ? "✓" : "✗"} Phone=${created.applicationPhone ? "✓" : "✗"}`,
    );
    console.log(`   Skills: ${created.skills.join(", ")}`);
  }

  console.log("🎉 Seeding complete!");
}

// ─── Run ──────────────────────────────────────────────────────────────────
seedExternalJobs()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
