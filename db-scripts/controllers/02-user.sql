-- ============================================================
-- Controller: user
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: DeviceToken
CREATE TABLE IF NOT EXISTS "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);


-- Indexes: DeviceToken
CREATE UNIQUE INDEX IF NOT EXISTS "DeviceToken_userId_token_key" ON "DeviceToken"("userId", "token");
CREATE INDEX IF NOT EXISTS "DeviceToken_userId_idx" ON "DeviceToken"("userId");
CREATE INDEX IF NOT EXISTS "DeviceToken_token_idx" ON "DeviceToken"("token");
CREATE INDEX IF NOT EXISTS "DeviceToken_active_idx" ON "DeviceToken"("active");

-- Foreign keys: DeviceToken
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: SavedWorker
CREATE TABLE IF NOT EXISTS "SavedWorker" (
    "id" TEXT NOT NULL,
    "hirerId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedWorker_pkey" PRIMARY KEY ("id")
);


-- Indexes: SavedWorker
CREATE UNIQUE INDEX IF NOT EXISTS "SavedWorker_hirerId_workerId_key" ON "SavedWorker"("hirerId", "workerId");
CREATE INDEX IF NOT EXISTS "SavedWorker_hirerId_idx" ON "SavedWorker"("hirerId");
CREATE INDEX IF NOT EXISTS "SavedWorker_workerId_idx" ON "SavedWorker"("workerId");

-- Foreign keys: SavedWorker
ALTER TABLE "SavedWorker" ADD CONSTRAINT "SavedWorker_hirerId_fkey" FOREIGN KEY ("hirerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedWorker" ADD CONSTRAINT "SavedWorker_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: SavedJob
CREATE TABLE IF NOT EXISTS "SavedJob" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "jobPostId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedJob_pkey" PRIMARY KEY ("id")
);


-- Indexes: SavedJob
CREATE UNIQUE INDEX IF NOT EXISTS "SavedJob_workerId_jobPostId_key" ON "SavedJob"("workerId", "jobPostId");
CREATE INDEX IF NOT EXISTS "SavedJob_workerId_idx" ON "SavedJob"("workerId");
CREATE INDEX IF NOT EXISTS "SavedJob_jobPostId_idx" ON "SavedJob"("jobPostId");

-- Foreign keys: SavedJob
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

