-- CreateEnum
CREATE TYPE "SupportTicketCategory" AS ENUM ('ACCOUNT', 'PAYMENT', 'BOOKING', 'TECHNICAL', 'VERIFICATION', 'WITHDRAWAL', 'REFERRAL', 'RETAINED_STAFF', 'ABUSE_REPORT', 'FEATURE_REQUEST', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_USER', 'WAITING_ADMIN', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportAuthorType" AS ENUM ('USER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "SupportChatStatus" AS ENUM ('ACTIVE', 'WAITING_AGENT', 'AGENT_ASSIGNED', 'ENDED', 'ESCALATED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'SUPPORT_TICKET_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'SUPPORT_TICKET_ASSIGNED';
ALTER TYPE "AuditAction" ADD VALUE 'SUPPORT_TICKET_STATUS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'SUPPORT_TICKET_PRIORITY_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'SUPPORT_TICKET_REPLIED';
ALTER TYPE "AuditAction" ADD VALUE 'SUPPORT_TICKET_REOPENED';
ALTER TYPE "AuditAction" ADD VALUE 'SUPPORT_TICKET_CLOSED';
ALTER TYPE "AuditAction" ADD VALUE 'SUPPORT_CHAT_ENDED';
ALTER TYPE "AuditAction" ADD VALUE 'SUPPORT_CHAT_ESCALATED';

-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE 'SUPPORT_TICKET';
ALTER TYPE "AuditTargetType" ADD VALUE 'SUPPORT_CHAT';

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "SupportTicketCategory" NOT NULL,
    "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "attachments" JSONB,
    "assignedAdminId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "relatedType" TEXT,
    "relatedId" TEXT,
    "firstResponseAt" TIMESTAMP(3),
    "lastReplyAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "reopenedCount" INTEGER NOT NULL DEFAULT 0,
    "autoCloseAt" TIMESTAMP(3),
    "chatConversationId" TEXT,
    "csatRating" INTEGER,
    "csatComment" TEXT,
    "csatSubmittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorType" "SupportAuthorType" NOT NULL,
    "body" TEXT NOT NULL,
    "attachments" JSONB,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "readByUserAt" TIMESTAMP(3),
    "readByAdminAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketAudit" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "note" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "SupportChatStatus" NOT NULL DEFAULT 'ACTIVE',
    "subject" TEXT,
    "assignedAdminId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "preChatCategory" "SupportTicketCategory",
    "preChatMessage" TEXT,
    "source" TEXT NOT NULL DEFAULT 'WEB',
    "userLastReadAt" TIMESTAMP(3),
    "adminLastReadAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "csatRating" INTEGER,
    "csatComment" TEXT,
    "csatSubmittedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderType" "SupportAuthorType" NOT NULL,
    "body" TEXT,
    "attachments" JSONB,
    "systemEvent" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportChatParticipant" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'AGENT',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "SupportChatParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_ticketNumber_key" ON "SupportTicket"("ticketNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_chatConversationId_key" ON "SupportTicket"("chatConversationId");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_createdAt_idx" ON "SupportTicket"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SupportTicket_status_createdAt_idx" ON "SupportTicket"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SupportTicket_assignedAdminId_status_idx" ON "SupportTicket"("assignedAdminId", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_category_status_idx" ON "SupportTicket"("category", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_priority_status_idx" ON "SupportTicket"("priority", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_lastReplyAt_idx" ON "SupportTicket"("lastReplyAt" DESC);

-- CreateIndex
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportMessage_authorId_idx" ON "SupportMessage"("authorId");

-- CreateIndex
CREATE INDEX "SupportTicketAudit_ticketId_createdAt_idx" ON "SupportTicketAudit"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportConversation_userId_createdAt_idx" ON "SupportConversation"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SupportConversation_status_lastMessageAt_idx" ON "SupportConversation"("status", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "SupportConversation_assignedAdminId_status_idx" ON "SupportConversation"("assignedAdminId", "status");

-- CreateIndex
CREATE INDEX "SupportChatMessage_conversationId_createdAt_idx" ON "SupportChatMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportChatMessage_senderId_idx" ON "SupportChatMessage"("senderId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportChatParticipant_conversationId_userId_key" ON "SupportChatParticipant"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "SupportChatParticipant_conversationId_idx" ON "SupportChatParticipant"("conversationId");

-- CreateIndex
CREATE INDEX "SupportChatParticipant_userId_idx" ON "SupportChatParticipant"("userId");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_chatConversationId_fkey" FOREIGN KEY ("chatConversationId") REFERENCES "SupportConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketAudit" ADD CONSTRAINT "SupportTicketAudit_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketAudit" ADD CONSTRAINT "SupportTicketAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportConversation" ADD CONSTRAINT "SupportConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportConversation" ADD CONSTRAINT "SupportConversation_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportConversation" ADD CONSTRAINT "SupportConversation_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportChatMessage" ADD CONSTRAINT "SupportChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SupportConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportChatMessage" ADD CONSTRAINT "SupportChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportChatParticipant" ADD CONSTRAINT "SupportChatParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SupportConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportChatParticipant" ADD CONSTRAINT "SupportChatParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;