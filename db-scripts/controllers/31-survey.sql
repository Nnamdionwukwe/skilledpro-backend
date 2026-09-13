-- ============================================================
-- Controller: survey
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: survey_responses
CREATE TABLE IF NOT EXISTS "survey_responses" (
    "id" TEXT NOT NULL,
    "role" TEXT,
    "industry" TEXT,
    "experience_level" TEXT,
    "biggest_challenge" TEXT,
    "desired_feature" TEXT,
    "biggest_concern" TEXT,
    "hear_about" TEXT,
    "email" TEXT,
    "full_name" TEXT,
    "phone_number" TEXT,
    "location" TEXT,
    "additional_feedback" TEXT,
    "rating" INTEGER DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id")
);


-- Indexes: survey_responses
CREATE INDEX IF NOT EXISTS "survey_responses_email_idx" ON "survey_responses"("email");
CREATE INDEX IF NOT EXISTS "survey_responses_created_at_idx" ON "survey_responses"("created_at");
CREATE INDEX IF NOT EXISTS "survey_responses_status_idx" ON "survey_responses"("status");

