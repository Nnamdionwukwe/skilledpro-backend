-- ─────────────────────────────────────────────────────────────────────────────
-- Add YEARLY to BudgetType, YEARS to DurationType, plus two work-condition
-- booleans on JobPost.
--
-- Notes:
--   • IF NOT EXISTS on every statement so this migration is idempotent —
--     running it twice does nothing the second time.
--   • The ALTER TYPE ... ADD VALUE statements are separated out because
--     Postgres < 12 refuses to run them inside a transaction. Since we're
--     applying this via psql (no transaction), it's fine here.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Work-condition booleans on JobPost
ALTER TABLE "JobPost"
  ADD COLUMN IF NOT EXISTS "providesAccommodation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "providesMeals" BOOLEAN NOT NULL DEFAULT false;

-- 2. callType discriminator on VoiceCall (if not already applied)
ALTER TABLE "VoiceCall"
  ADD COLUMN IF NOT EXISTS "callType" TEXT NOT NULL DEFAULT 'voice';

-- 3. Add YEARLY to the BudgetType enum (used by JobPost.budgetType)
ALTER TYPE "BudgetType" ADD VALUE IF NOT EXISTS 'YEARLY';

-- 4. Add YEARS to the DurationType enum (used by JobPost.durationType)
ALTER TYPE "DurationType" ADD VALUE IF NOT EXISTS 'YEARS';
