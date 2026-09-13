-- ============================================================
-- Controller: job
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: JobPost
CREATE TABLE IF NOT EXISTS "JobPost" (
    "id" TEXT NOT NULL,
    "hirerId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "estimatedHours" DOUBLE PRECISION,
    "budget" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "notes" TEXT,
    "status" "JobPostStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "estimatedUnit" TEXT DEFAULT 'hours',
    "estimatedValue" TEXT,
    "jobType" "JobType" NOT NULL DEFAULT 'FULL_TIME',
    "locationType" "LocationType" NOT NULL DEFAULT 'REMOTE',
    "budgetType" "BudgetType" NOT NULL DEFAULT 'FIXED',
    "durationType" "DurationType" NOT NULL DEFAULT 'HOURS',
    "durationValue" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "applicationUrl" TEXT,
    "sourcePlatform" TEXT,
    "applicationEmail" TEXT,
    "applicationWhatsApp" TEXT,
    "applicationPhone" TEXT,
    "minQualification" TEXT,
    "experienceLevel" TEXT,
    "experienceLength" TEXT,
    "languageRequirement" TEXT DEFAULT 'English',
    "workingHours" TEXT,
    "applicantLocation" TEXT,
    "responsibilities" TEXT,
    "requirements" TEXT,
    "expiryDate" TIMESTAMP(3),
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "postedByAdminId" TEXT,
    "companyName" TEXT,
    "salaryText" TEXT,
    "salaryAmount" DOUBLE PRECISION,
    "salaryMin" DOUBLE PRECISION,
    "salaryMax" DOUBLE PRECISION,
    "salaryCurrency" TEXT,
    "salaryPeriod" "SalaryPeriod",
    "educationLevel" "EducationLevel",

    CONSTRAINT "JobPost_pkey" PRIMARY KEY ("id")
);


-- Foreign keys: JobPost
ALTER TABLE "JobPost" ADD CONSTRAINT "JobPost_hirerId_fkey" FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobPost" ADD CONSTRAINT "JobPost_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobPost" ADD CONSTRAINT "JobPost_postedByAdminId_fkey" FOREIGN KEY ("postedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Table: JobCategory
CREATE TABLE IF NOT EXISTS "JobCategory" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "JobCategory_pkey" PRIMARY KEY ("id")
);


-- Indexes: JobCategory
CREATE UNIQUE INDEX IF NOT EXISTS "JobCategory_jobId_categoryId_key" ON "JobCategory"("jobId", "categoryId");

-- Foreign keys: JobCategory
ALTER TABLE "JobCategory" ADD CONSTRAINT "JobCategory_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobCategory" ADD CONSTRAINT "JobCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Table: JobApplication
CREATE TABLE IF NOT EXISTS "JobApplication" (
    "id" TEXT NOT NULL,
    "jobPostId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "message" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);


-- Indexes: JobApplication
CREATE UNIQUE INDEX IF NOT EXISTS "JobApplication_jobPostId_workerId_key" ON "JobApplication"("jobPostId", "workerId");

-- Foreign keys: JobApplication
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: ExternalJobClick
CREATE TABLE IF NOT EXISTS "ExternalJobClick" (
    "id" TEXT NOT NULL,
    "jobPostId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalJobClick_pkey" PRIMARY KEY ("id")
);


-- Indexes: ExternalJobClick
CREATE UNIQUE INDEX IF NOT EXISTS "ExternalJobClick_jobPostId_userId_type_key" ON "ExternalJobClick"("jobPostId", "userId", "type");
CREATE INDEX IF NOT EXISTS "ExternalJobClick_jobPostId_idx" ON "ExternalJobClick"("jobPostId");
CREATE INDEX IF NOT EXISTS "ExternalJobClick_userId_idx" ON "ExternalJobClick"("userId");
CREATE INDEX IF NOT EXISTS "ExternalJobClick_type_idx" ON "ExternalJobClick"("type");

-- Foreign keys: ExternalJobClick
ALTER TABLE "ExternalJobClick" ADD CONSTRAINT "ExternalJobClick_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalJobClick" ADD CONSTRAINT "ExternalJobClick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

