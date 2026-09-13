-- ============================================================
-- Controller: waitlist
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: waitlist_entries
CREATE TABLE IF NOT EXISTS "waitlist_entries" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "ip_address" TEXT,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "timezone" TEXT,
    "postal_code" TEXT,
    "device_type" TEXT,
    "device_brand" TEXT,
    "device_model" TEXT,
    "os_name" TEXT,
    "os_version" TEXT,
    "browser_name" TEXT,
    "browser_version" TEXT,
    "user_agent" TEXT,
    "referral_code" TEXT,
    "referred_by" TEXT,
    "token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "unlocked_benefits" TEXT[],
    "benefit_unlocked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);


-- Indexes: waitlist_entries
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_entries_email_key" ON "waitlist_entries"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_entries_referral_code_key" ON "waitlist_entries"("referral_code");
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_entries_token_key" ON "waitlist_entries"("token");
CREATE INDEX IF NOT EXISTS "waitlist_entries_email_idx" ON "waitlist_entries"("email");
CREATE INDEX IF NOT EXISTS "waitlist_entries_status_idx" ON "waitlist_entries"("status");
CREATE INDEX IF NOT EXISTS "waitlist_entries_country_idx" ON "waitlist_entries"("country");
CREATE INDEX IF NOT EXISTS "waitlist_entries_device_type_idx" ON "waitlist_entries"("device_type");
CREATE INDEX IF NOT EXISTS "waitlist_entries_created_at_idx" ON "waitlist_entries"("created_at");

-- Table: waitlist_campaigns
CREATE TABLE IF NOT EXISTS "waitlist_campaigns" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "preview_text" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sent_at" TIMESTAMP(3),
    "scheduled_for" TIMESTAMP(3),
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "opened_count" INTEGER NOT NULL DEFAULT 0,
    "clicked_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waitlist_campaigns_pkey" PRIMARY KEY ("id")
);


-- Indexes: waitlist_campaigns
CREATE INDEX IF NOT EXISTS "waitlist_campaigns_status_idx" ON "waitlist_campaigns"("status");
CREATE INDEX IF NOT EXISTS "waitlist_campaigns_sent_at_idx" ON "waitlist_campaigns"("sent_at");

-- Table: waitlist_email_logs
CREATE TABLE IF NOT EXISTS "waitlist_email_logs" (
    "id" TEXT NOT NULL,
    "waitlist_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "email" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "opened" BOOLEAN NOT NULL DEFAULT false,
    "opened_at" TIMESTAMP(3),
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "clicked_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error" TEXT,

    CONSTRAINT "waitlist_email_logs_pkey" PRIMARY KEY ("id")
);


-- Indexes: waitlist_email_logs
CREATE INDEX IF NOT EXISTS "waitlist_email_logs_waitlist_id_idx" ON "waitlist_email_logs"("waitlist_id");
CREATE INDEX IF NOT EXISTS "waitlist_email_logs_campaign_id_idx" ON "waitlist_email_logs"("campaign_id");
CREATE INDEX IF NOT EXISTS "waitlist_email_logs_type_idx" ON "waitlist_email_logs"("type");
CREATE INDEX IF NOT EXISTS "waitlist_email_logs_sent_at_idx" ON "waitlist_email_logs"("sent_at");

