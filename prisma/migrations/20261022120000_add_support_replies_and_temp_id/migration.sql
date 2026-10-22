-- AlterTable
ALTER TABLE "SupportMessage" ADD COLUMN "tempId" TEXT,
ADD COLUMN "replyToId" TEXT;

-- AlterTable
ALTER TABLE "SupportChatMessage" ADD COLUMN "tempId" TEXT,
ADD COLUMN "replyToId" TEXT;

-- CreateIndex
CREATE INDEX "SupportMessage_tempId_idx" ON "SupportMessage"("tempId");

-- CreateIndex
CREATE INDEX "SupportChatMessage_tempId_idx" ON "SupportChatMessage"("tempId");

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "SupportMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportChatMessage" ADD CONSTRAINT "SupportChatMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "SupportChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;