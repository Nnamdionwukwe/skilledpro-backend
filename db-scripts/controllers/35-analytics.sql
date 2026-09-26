-- ============================================================
-- Controller: analytics
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql, 02-auth.sql
-- ============================================================

-- Table: UserEvent
CREATE TABLE IF NOT EXISTS "UserEvent" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT,
    "anonymousId"  TEXT,
    "sessionId"    TEXT NOT NULL,
    "eventName"    TEXT NOT NULL,
    "eventProps"   JSONB,
    "pagePath"     TEXT,
    "pageRef"      TEXT,
    "referrer"     TEXT,
    "userAgent"    TEXT,
    "ipAddress"    TEXT,
    "deviceType"   TEXT,
    "os"           TEXT,
    "browser"      TEXT,
    "country"      TEXT,
    "city"         TEXT,
    "locale"       TEXT,
    "screenWidth"  INTEGER,
    "screenHeight" INTEGER,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UserEvent_userId_createdAt_idx" ON "UserEvent"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "UserEvent_anonymousId_idx"      ON "UserEvent"("anonymousId");
CREATE INDEX IF NOT EXISTS "UserEvent_sessionId_idx"        ON "UserEvent"("sessionId");
CREATE INDEX IF NOT EXISTS "UserEvent_eventName_createdAt_idx" ON "UserEvent"("eventName", "createdAt");
CREATE INDEX IF NOT EXISTS "UserEvent_pageRef_createdAt_idx"   ON "UserEvent"("pageRef", "createdAt");
CREATE INDEX IF NOT EXISTS "UserEvent_createdAt_idx"           ON "UserEvent"("createdAt");

ALTER TABLE "UserEvent" DROP CONSTRAINT IF EXISTS "UserEvent_userId_fkey";
ALTER TABLE "UserEvent" ADD CONSTRAINT "UserEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Table: UserSession
CREATE TABLE IF NOT EXISTS "UserSession" (
    "id"          TEXT NOT NULL,
    "sessionId"   TEXT NOT NULL,
    "userId"      TEXT,
    "anonymousId" TEXT,
    "startedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt"     TIMESTAMP(3),
    "lastPingAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs"  INTEGER,
    "pageViews"   INTEGER NOT NULL DEFAULT 0,
    "eventsCount" INTEGER NOT NULL DEFAULT 0,
    "entryPage"   TEXT,
    "exitPage"    TEXT,
    "referrer"    TEXT,
    "deviceType"  TEXT,
    "os"          TEXT,
    "browser"     TEXT,
    "country"     TEXT,
    "city"        TEXT,
    "bounce"      BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserSession_sessionId_key" ON "UserSession"("sessionId");
CREATE INDEX IF NOT EXISTS "UserSession_userId_startedAt_idx" ON "UserSession"("userId", "startedAt");
CREATE INDEX IF NOT EXISTS "UserSession_anonymousId_idx"      ON "UserSession"("anonymousId");
CREATE INDEX IF NOT EXISTS "UserSession_startedAt_idx"        ON "UserSession"("startedAt");
CREATE INDEX IF NOT EXISTS "UserSession_lastPingAt_idx"       ON "UserSession"("lastPingAt");

ALTER TABLE "UserSession" DROP CONSTRAINT IF EXISTS "UserSession_userId_fkey";
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Table: PageView
CREATE TABLE IF NOT EXISTS "PageView" (
    "id"               TEXT NOT NULL,
    "userId"           TEXT,
    "sessionId"        TEXT NOT NULL,
    "pagePath"         TEXT NOT NULL,
    "pageRef"          TEXT NOT NULL,
    "title"            TEXT,
    "enteredAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt"           TIMESTAMP(3),
    "durationMs"       INTEGER,
    "scrollDepthPct"   INTEGER,
    "interactionCount" INTEGER NOT NULL DEFAULT 0,
    "referrer"         TEXT,
    "isExitPage"       BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PageView_userId_enteredAt_idx"   ON "PageView"("userId", "enteredAt");
CREATE INDEX IF NOT EXISTS "PageView_sessionId_idx"          ON "PageView"("sessionId");
CREATE INDEX IF NOT EXISTS "PageView_pageRef_enteredAt_idx"  ON "PageView"("pageRef", "enteredAt");
CREATE INDEX IF NOT EXISTS "PageView_enteredAt_idx"          ON "PageView"("enteredAt");

ALTER TABLE "PageView" DROP CONSTRAINT IF EXISTS "PageView_userId_fkey";
ALTER TABLE "PageView" ADD CONSTRAINT "PageView_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Table: InteractionEvent
CREATE TABLE IF NOT EXISTS "InteractionEvent" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT,
    "sessionId"   TEXT NOT NULL,
    "pageViewId"  TEXT,
    "elementId"   TEXT NOT NULL,
    "elementType" TEXT NOT NULL,
    "action"      TEXT NOT NULL,
    "value"       TEXT,
    "metadata"    JSONB,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteractionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InteractionEvent_userId_createdAt_idx" ON "InteractionEvent"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "InteractionEvent_elementId_createdAt_idx" ON "InteractionEvent"("elementId", "createdAt");
CREATE INDEX IF NOT EXISTS "InteractionEvent_sessionId_idx"        ON "InteractionEvent"("sessionId");
CREATE INDEX IF NOT EXISTS "InteractionEvent_createdAt_idx"        ON "InteractionEvent"("createdAt");

ALTER TABLE "InteractionEvent" DROP CONSTRAINT IF EXISTS "InteractionEvent_userId_fkey";
ALTER TABLE "InteractionEvent" ADD CONSTRAINT "InteractionEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Table: FeatureUsageDaily
CREATE TABLE IF NOT EXISTS "FeatureUsageDaily" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "date"        DATE NOT NULL,
    "featureKey"  TEXT NOT NULL,
    "usageCount"  INTEGER NOT NULL DEFAULT 0,
    "totalTimeMs" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureUsageDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FeatureUsageDaily_userId_date_featureKey_key"
    ON "FeatureUsageDaily"("userId", "date", "featureKey");
CREATE INDEX IF NOT EXISTS "FeatureUsageDaily_userId_date_idx"   ON "FeatureUsageDaily"("userId", "date");
CREATE INDEX IF NOT EXISTS "FeatureUsageDaily_featureKey_date_idx" ON "FeatureUsageDaily"("featureKey", "date");

ALTER TABLE "FeatureUsageDaily" DROP CONSTRAINT IF EXISTS "FeatureUsageDaily_userId_fkey";
ALTER TABLE "FeatureUsageDaily" ADD CONSTRAINT "FeatureUsageDaily_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: UserProfileInsight
CREATE TABLE IF NOT EXISTS "UserProfileInsight" (
    "id"     TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    "totalSessions"       INTEGER NOT NULL DEFAULT 0,
    "totalPageViews"      INTEGER NOT NULL DEFAULT 0,
    "totalEventsCount"    INTEGER NOT NULL DEFAULT 0,
    "totalTimeOnPlatform" INTEGER NOT NULL DEFAULT 0,
    "lastActiveAt"        TIMESTAMP(3),

    "featuresUsed"       JSONB,
    "topFeatures"        JSONB,
    "featureAdoptionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,

    "jobsAppliedCount" INTEGER NOT NULL DEFAULT 0,
    "jobsPostedCount"  INTEGER NOT NULL DEFAULT 0,
    "bookingsAsHirer"  INTEGER NOT NULL DEFAULT 0,
    "bookingsAsWorker" INTEGER NOT NULL DEFAULT 0,
    "messagesSent"     INTEGER NOT NULL DEFAULT 0,
    "reviewsGiven"     INTEGER NOT NULL DEFAULT 0,
    "reviewsReceived"  INTEGER NOT NULL DEFAULT 0,

    "preferredCategories" JSONB,
    "preferredCities"     JSONB,
    "preferredPriceRange" JSONB,
    "preferredTimeOfDay"  JSONB,

    "avgSessionDurationMs" INTEGER NOT NULL DEFAULT 0,
    "bounceRate"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "engagementScore"      INTEGER NOT NULL DEFAULT 0,

    "segments"  TEXT[] DEFAULT ARRAY[]::TEXT[],
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfileInsight_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserProfileInsight_userId_key" ON "UserProfileInsight"("userId");
CREATE INDEX IF NOT EXISTS "UserProfileInsight_engagementScore_idx" ON "UserProfileInsight"("engagementScore");
CREATE INDEX IF NOT EXISTS "UserProfileInsight_lastActiveAt_idx"    ON "UserProfileInsight"("lastActiveAt");
CREATE INDEX IF NOT EXISTS "UserProfileInsight_updatedAt_idx"       ON "UserProfileInsight"("updatedAt");

ALTER TABLE "UserProfileInsight" DROP CONSTRAINT IF EXISTS "UserProfileInsight_userId_fkey";
ALTER TABLE "UserProfileInsight" ADD CONSTRAINT "UserProfileInsight_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Table: UserSegment
CREATE TABLE IF NOT EXISTS "UserSegment" (
    "id"          TEXT NOT NULL,
    "key"         TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "rule"        JSONB NOT NULL,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSegment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserSegment_key_key" ON "UserSegment"("key");

-- Table: UserSegmentMembership
CREATE TABLE IF NOT EXISTS "UserSegmentMembership" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "segmentId"  TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"  TIMESTAMP(3),

    CONSTRAINT "UserSegmentMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserSegmentMembership_userId_segmentId_key"
    ON "UserSegmentMembership"("userId", "segmentId");
CREATE INDEX IF NOT EXISTS "UserSegmentMembership_userId_idx"    ON "UserSegmentMembership"("userId");
CREATE INDEX IF NOT EXISTS "UserSegmentMembership_segmentId_idx" ON "UserSegmentMembership"("segmentId");

ALTER TABLE "UserSegmentMembership" DROP CONSTRAINT IF EXISTS "UserSegmentMembership_userId_fkey";
ALTER TABLE "UserSegmentMembership" ADD CONSTRAINT "UserSegmentMembership_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSegmentMembership" DROP CONSTRAINT IF EXISTS "UserSegmentMembership_segmentId_fkey";
ALTER TABLE "UserSegmentMembership" ADD CONSTRAINT "UserSegmentMembership_segmentId_fkey"
    FOREIGN KEY ("segmentId") REFERENCES "UserSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;