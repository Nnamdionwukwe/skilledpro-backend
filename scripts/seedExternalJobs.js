import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

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
      "We are looking for a Senior Full Stack Developer to join our remote team. You will build scalable web applications using React, Node.js, and PostgreSQL.",
    responsibilities:
      "Design and implement new features\nOptimize application performance\nCollaborate with product and design teams\nMentor junior developers",
    requirements:
      "5+ years of experience in full stack development\nExpert in React and Node.js\nExperience with PostgreSQL and cloud (AWS/GCP)\nStrong communication skills",
    minQualification: "Bachelor's in Computer Science or equivalent",
    experienceLevel: "Senior level",
    experienceLength: "5+ years",
    languageRequirement: "English",
    workingHours: "9:00 AM – 5:00 PM PST",
    applicantLocation: "USA (Remote)",
    applicationUrl: "https://www.linkedin.com/jobs/view/1234567890",
    sourcePlatform: "LinkedIn",
    expiryDate: "2026-12-31T23:59:59.000Z",
    categoryName: "Software Development",
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
    description:
      "Drive marketing strategy for a fast-growing SaaS company. Lead campaigns across digital channels.",
    responsibilities:
      "Develop and execute multi-channel marketing campaigns\nAnalyze market trends and customer insights\nManage a team of 3 marketers",
    requirements:
      "5+ years of marketing experience\nProven track record in B2B SaaS\nStrong analytical and communication skills",
    minQualification: "Bachelor's in Marketing or related field",
    experienceLevel: "Mid level",
    experienceLength: "5+ years",
    languageRequirement: "English",
    workingHours: "Flexible",
    applicantLocation: "New York area",
    applicationUrl: "https://www.indeed.com/viewjob?jk=abc123",
    sourcePlatform: "Indeed",
    expiryDate: "2026-11-15T23:59:59.000Z",
    categoryName: "Marketing",
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
    description:
      "Analyze large datasets to drive business decisions. Build dashboards and reports for stakeholders.",
    responsibilities:
      "Clean and transform data from multiple sources\nCreate visualizations and dashboards\nPresent insights to management",
    requirements:
      "3+ years of experience in data analysis\nProficient in SQL and Python\nExperience with Tableau or Power BI",
    minQualification: "Bachelor's in Statistics or related field",
    experienceLevel: "Mid level",
    experienceLength: "3+ years",
    languageRequirement: "English",
    workingHours: "9:00 AM – 6:00 PM CST",
    applicantLocation: "USA (Remote)",
    applicationUrl: "https://www.glassdoor.com/job-listing/456789",
    sourcePlatform: "Glassdoor",
    expiryDate: "2026-10-30T23:59:59.000Z",
    categoryName: "Data Science",
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
    description:
      "Join our dynamic sales team and drive revenue for our B2B software products.",
    responsibilities:
      "Prospect and qualify leads\nConduct product demos\nClose deals and manage pipeline",
    requirements:
      "2+ years of sales experience\nExcellent communication skills\nProven ability to meet targets",
    minQualification: "High School Diploma or equivalent",
    experienceLevel: "Entry level",
    experienceLength: "2+ years",
    languageRequirement: "English",
    workingHours: "8:30 AM – 5:30 PM CST",
    applicantLocation: "Chicago area",
    applicationUrl: "https://www.monster.com/jobs/789012",
    sourcePlatform: "Monster",
    expiryDate: "2026-09-20T23:59:59.000Z",
    categoryName: "Sales",
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
    description:
      "Shape the user experience of our mobile and web products. Collaborate with product and engineering teams.",
    responsibilities:
      "Create wireframes, prototypes, and high-fidelity designs\nConduct user research and usability testing\nMaintain design system",
    requirements:
      "4+ years of product design experience\nProficiency in Figma and Adobe Creative Suite\nStrong portfolio",
    minQualification: "Bachelor's in Design or related field",
    experienceLevel: "Mid level",
    experienceLength: "4+ years",
    languageRequirement: "English",
    workingHours: "9:00 AM – 6:00 PM PST",
    applicantLocation: "Los Angeles area",
    applicationUrl: "https://www.careerbuilder.com/job/345678",
    sourcePlatform: "CareerBuilder",
    expiryDate: "2026-11-10T23:59:59.000Z",
    categoryName: "Design",
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
    description:
      "Manage cloud infrastructure and CI/CD pipelines. Ensure reliability and scalability.",
    responsibilities:
      "Design and maintain AWS infrastructure\nAutomate deployments with Terraform and Ansible\nMonitor system performance",
    requirements:
      "5+ years of DevOps experience\nExpert in AWS, Docker, Kubernetes\nStrong scripting skills (Python/Bash)",
    minQualification: "Bachelor's in Computer Science or related",
    experienceLevel: "Senior level",
    experienceLength: "5+ years",
    languageRequirement: "English",
    workingHours: "Flexible",
    applicantLocation: "USA (Remote)",
    applicationUrl: "https://www.simplyhired.com/job/567890",
    sourcePlatform: "SimplyHired",
    expiryDate: "2026-12-01T23:59:59.000Z",
    categoryName: "DevOps",
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
    description:
      "Create engaging content for blogs, social media, and websites. Work with editorial team.",
    responsibilities:
      "Research and write articles\nEdit and proofread content\nOptimize for SEO",
    requirements:
      "2+ years of writing experience\nExcellent grammar and storytelling skills\nBasic SEO knowledge",
    minQualification: "Bachelor's in English, Journalism, or related",
    experienceLevel: "Entry level",
    experienceLength: "2+ years",
    languageRequirement: "English",
    workingHours: "Flexible (20 hours/week)",
    applicantLocation: "Worldwide (Remote)",
    applicationUrl: "https://www.jobstreet.com/job/789012",
    sourcePlatform: "JobStreet",
    expiryDate: "2026-12-15T23:59:59.000Z",
    categoryName: "Writing",
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
    description:
      "Manage HR operations including recruiting, onboarding, and employee relations.",
    responsibilities:
      "Handle full-cycle recruitment\nCoordinate onboarding and training\nManage employee records and benefits",
    requirements:
      "3+ years of HR experience\nKnowledge of employment laws\nExcellent interpersonal skills",
    minQualification: "Bachelor's in Human Resources or related",
    experienceLevel: "Mid level",
    experienceLength: "3+ years",
    languageRequirement: "English",
    workingHours: "8:00 AM – 5:00 PM EST",
    applicantLocation: "Boston area",
    applicationUrl: "https://www.reed.co.uk/jobs/123456",
    sourcePlatform: "Reed",
    expiryDate: "2026-10-05T23:59:59.000Z",
    categoryName: "Human Resources",
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
    description:
      "Design and maintain network infrastructure for a large enterprise.",
    responsibilities:
      "Configure routers, switches, and firewalls\nTroubleshoot network issues\nEnsure network security",
    requirements:
      "5+ years of networking experience\nCCNP or equivalent certification\nExperience with Cisco and Juniper",
    minQualification: "Bachelor's in Computer Science or related",
    experienceLevel: "Senior level",
    experienceLength: "5+ years",
    languageRequirement: "English",
    workingHours: "8:00 AM – 6:00 PM CST",
    applicantLocation: "Dallas area",
    applicationUrl: "https://www.totaljobs.com/job/456789",
    sourcePlatform: "Totaljobs",
    expiryDate: "2026-11-20T23:59:59.000Z",
    categoryName: "IT/Networking",
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
      "Respond to customer inquiries\nTroubleshoot and resolve issues\nDocument feedback",
    requirements:
      "1+ years of customer service experience\nExcellent communication skills\nFamiliarity with CRM tools",
    minQualification: "High School Diploma",
    experienceLevel: "Entry level",
    experienceLength: "1+ years",
    languageRequirement: "English",
    workingHours: "9:00 AM – 6:00 PM MST",
    applicantLocation: "USA (Remote)",
    applicationUrl: "https://www.ziprecruiter.com/job/789012",
    sourcePlatform: "ZipRecruiter",
    expiryDate: "2026-12-25T23:59:59.000Z",
    categoryName: "Customer Service",
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
    // Create a default admin (you may need to adjust this based on your schema)
    adminUser = await prisma.user.create({
      data: {
        email: "admin@example.com",
        password: "$2b$10$defaultHash", // Placeholder – not used for login
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
    // Find or create category
    let category = await prisma.category.findUnique({
      where: { name: job.categoryName },
    });

    if (!category) {
      console.log(`📁 Creating category: ${job.categoryName}`);
      category = await prisma.category.create({
        data: {
          name: job.categoryName,
          slug: job.categoryName.toLowerCase().replace(/\s+/g, "-"),
          description: `${job.categoryName} category`,
        },
      });
    }

    // Prepare job data
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
      applicationUrl: job.applicationUrl,
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

    // Insert job
    const created = await prisma.jobPost.create({
      data: jobPostData,
    });

    console.log(`✅ Created job: "${created.title}" at ${created.companyName}`);
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
