-- CreateEnum
CREATE TYPE "SupportRecipient" AS ENUM ('PLATFORM', 'STORE');

-- DropIndex
DROP INDEX "support_tickets_status_lastMessageAt_idx";

-- DropIndex
DROP INDEX "support_tickets_storeId_idx";

-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "recipient" "SupportRecipient" NOT NULL DEFAULT 'PLATFORM';

-- CreateIndex
CREATE INDEX "support_tickets_recipient_status_lastMessageAt_idx" ON "support_tickets"("recipient", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "support_tickets_storeId_recipient_lastMessageAt_idx" ON "support_tickets"("storeId", "recipient", "lastMessageAt");
