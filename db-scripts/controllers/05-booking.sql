-- ============================================================
-- Controller: booking
-- Tables grouped from Prisma schema
-- Depends on: 00-init.sql, 01-enums.sql
-- ============================================================

-- Table: Booking
CREATE TABLE IF NOT EXISTS "Booking" (
    "id" TEXT NOT NULL,
    "hirerId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "estimatedHours" DOUBLE PRECISION,
    "agreedRate" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "checkInAt" TIMESTAMP(3),
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "checkOutAt" TIMESTAMP(3),
    "checkOutLat" DOUBLE PRECISION,
    "checkOutLng" DOUBLE PRECISION,
    "completedAt" TIMESTAMP(3),
    "quantity" INTEGER DEFAULT 1,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "custom_label" TEXT,
    "emergencyContact" TEXT,
    "sosActivatedAt" TIMESTAMP(3),
    "sosLatitude" DOUBLE PRECISION,
    "sosLongitude" DOUBLE PRECISION,
    "sosResolvedAt" TIMESTAMP(3),
    "insuranceRef" TEXT,
    "insurancePlan" TEXT,
    "insurancePaidAt" TIMESTAMP(3),
    "estimatedUnit" TEXT DEFAULT 'hours',
    "estimatedValue" TEXT,
    "isNegotiated" BOOLEAN NOT NULL DEFAULT false,
    "negotiatedRate" DOUBLE PRECISION,
    "negotiationNote" TEXT,
    "jobType" TEXT,
    "locationType" TEXT,
    "requirements" TEXT,
    "responsibilities" TEXT,
    "disputeReason" TEXT,
    "disputeDescription" TEXT,
    "disputeEvidence" TEXT[] DEFAULT ARRAY[]::TEXT[],

    -- ── Source & linkage (added: written/read by booking.controller.js
    --    createBookingFromJobPost, getJobPostBookingDraft) ──
    "source"             "BookingSource" NOT NULL DEFAULT 'DIRECT',
    "jobPostId"          TEXT,
    "selectedRateOption" TEXT,   -- "budget" | "salaryAmount" | "salaryMin" | "salaryMax" | "salaryText"
    "jobRateSnapshot"    JSONB,  -- snapshot of job price fields at booking time

    -- ── Refund counters (added: read by booking.controller.js getBooking,
    --    written by refund.controller.js / dispute.controller.js) ──
    "refundCount"   INTEGER NOT NULL DEFAULT 0,
    "totalRefunded" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);


-- Foreign keys: Booking
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_hirerId_fkey"
    FOREIGN KEY ("hirerId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_workerId_fkey"
    FOREIGN KEY ("workerId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Booking → JobPost: onDelete SET NULL (matches schema.prisma @relation(..., onDelete: SetNull))
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_jobPostId_fkey"
    FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Table: Review
CREATE TABLE IF NOT EXISTS "Review" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "giverId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,

    -- ── Added: written by seed-test-accounts.js and review.controller.js,
    --    read by every `include: { reviews: true }` (booking.controller.js getBooking) ──
    "type"      TEXT,                                        -- "WORKER" | "HIRER"
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);


-- Indexes: Review
CREATE UNIQUE INDEX IF NOT EXISTS "Review_bookingId_giverId_key" ON "Review"("bookingId", "giverId");

-- Foreign keys: Review
ALTER TABLE "Review" ADD CONSTRAINT "Review_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Review" ADD CONSTRAINT "Review_giverId_fkey"
    FOREIGN KEY ("giverId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Review" ADD CONSTRAINT "Review_receiverId_fkey"
    FOREIGN KEY ("receiverId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Table: Conversation
CREATE TABLE IF NOT EXISTS "Conversation" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);


-- Indexes: Conversation
CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_bookingId_key" ON "Conversation"("bookingId");

-- Foreign keys: Conversation
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Table: ConversationUser
CREATE TABLE IF NOT EXISTS "ConversationUser" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ConversationUser_pkey" PRIMARY KEY ("id")
);


-- Indexes: ConversationUser
CREATE UNIQUE INDEX IF NOT EXISTS "ConversationUser_conversationId_userId_key"
    ON "ConversationUser"("conversationId", "userId");

-- Foreign keys: ConversationUser
ALTER TABLE "ConversationUser" ADD CONSTRAINT "ConversationUser_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationUser" ADD CONSTRAINT "ConversationUser_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Table: Message
CREATE TABLE IF NOT EXISTS "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "fileUrl" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);


-- Foreign keys: Message
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_receiverId_fkey"
    FOREIGN KEY ("receiverId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Table: VideoCall
CREATE TABLE IF NOT EXISTS "VideoCall" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoCall_pkey" PRIMARY KEY ("id")
);


-- Indexes: VideoCall
CREATE UNIQUE INDEX IF NOT EXISTS "VideoCall_bookingId_key" ON "VideoCall"("bookingId");
CREATE UNIQUE INDEX IF NOT EXISTS "VideoCall_roomId_key"    ON "VideoCall"("roomId");

-- Foreign keys: VideoCall
ALTER TABLE "VideoCall" ADD CONSTRAINT "VideoCall_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VideoCall" ADD CONSTRAINT "VideoCall_initiatorId_fkey"
    FOREIGN KEY ("initiatorId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VideoCall" ADD CONSTRAINT "VideoCall_receiverId_fkey"
    FOREIGN KEY ("receiverId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;