-- CreateEnum
CREATE TYPE "WaInboxState" AS ENUM ('OPEN', 'DONE');

-- CreateEnum
CREATE TYPE "WaCampaignStatus" AS ENUM ('SCHEDULED', 'SENDING', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WaRecipientStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "wa_contacts" ADD COLUMN     "inboxState" "WaInboxState" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "marketingOptInAt" TIMESTAMP(3),
ADD COLUMN     "marketingOptInSource" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "unreadCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "wa_messages" ADD COLUMN     "automationKey" TEXT;

-- AlterTable
ALTER TABLE "wa_campaigns" ADD COLUMN     "audience" JSONB,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "frequencyCapHours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mapping" JSONB,
ADD COLUMN     "requireOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "status" "WaCampaignStatus" NOT NULL DEFAULT 'SENDING';

-- CreateTable
CREATE TABLE "wa_campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "name" TEXT,
    "bodyParams" JSONB NOT NULL,
    "buttonParams" JSONB NOT NULL,
    "status" "WaRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "messageId" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_links" (
    "code" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "campaignId" TEXT,
    "waId" TEXT,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "firstClickedAt" TIMESTAMP(3),
    "lastClickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_links_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "wa_segments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_automations" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledAt" TIMESTAMP(3),
    "templateName" TEXT,
    "languageCode" TEXT,
    "mapping" JSONB,
    "config" JSONB,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_automations_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "wa_automation_runs" (
    "id" TEXT NOT NULL,
    "automationKey" TEXT NOT NULL,
    "refKey" TEXT NOT NULL,
    "waId" TEXT,
    "storeId" TEXT,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_quick_replies" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_quick_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wa_campaign_recipients_messageId_key" ON "wa_campaign_recipients"("messageId");

-- CreateIndex
CREATE INDEX "wa_campaign_recipients_campaignId_status_idx" ON "wa_campaign_recipients"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "wa_campaign_recipients_campaignId_waId_key" ON "wa_campaign_recipients"("campaignId", "waId");

-- CreateIndex
CREATE INDEX "wa_links_campaignId_idx" ON "wa_links"("campaignId");

-- CreateIndex
CREATE INDEX "wa_automation_runs_automationKey_createdAt_idx" ON "wa_automation_runs"("automationKey", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "wa_automation_runs_automationKey_refKey_key" ON "wa_automation_runs"("automationKey", "refKey");

-- CreateIndex
CREATE INDEX "wa_contacts_tags_idx" ON "wa_contacts" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "wa_messages_direction_createdAt_idx" ON "wa_messages"("direction", "createdAt");

-- CreateIndex
CREATE INDEX "wa_campaigns_status_scheduledAt_idx" ON "wa_campaigns"("status", "scheduledAt");

-- AddForeignKey
ALTER TABLE "wa_campaign_recipients" ADD CONSTRAINT "wa_campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "wa_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_campaign_recipients" ADD CONSTRAINT "wa_campaign_recipients_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "wa_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_links" ADD CONSTRAINT "wa_links_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "wa_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: campaigns from before the recipient queue. Finished ones are
-- COMPLETED; unfinished ones were in-process sends a restart already killed.
UPDATE "wa_campaigns" SET "status" = 'COMPLETED', "startedAt" = "createdAt" WHERE "finishedAt" IS NOT NULL;
UPDATE "wa_campaigns" SET "status" = 'CANCELLED', "startedAt" = "createdAt" WHERE "finishedAt" IS NULL;
