-- Add qualifications column to JobPost
ALTER TABLE "JobPost"
  ADD COLUMN IF NOT EXISTS "qualifications" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Normalize languageRequirement default from label to ISO code
UPDATE "JobPost" SET "languageRequirement" = 'en'
  WHERE "languageRequirement" IN ('English', 'en', 'EN') OR "languageRequirement" IS NULL;

ALTER TABLE "JobPost"
  ALTER COLUMN "languageRequirement" SET DEFAULT 'en';
