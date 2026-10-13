-- CreateEnum
CREATE TYPE "WaDirection" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "wa_webhook_events" (
    "id" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,

    CONSTRAINT "wa_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_contacts" (
    "waId" TEXT NOT NULL,
    "name" TEXT,
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "lastInboundAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_contacts_pkey" PRIMARY KEY ("waId")
);

-- CreateTable
CREATE TABLE "wa_messages" (
    "id" TEXT NOT NULL,
    "wamid" TEXT,
    "waId" TEXT NOT NULL,
    "direction" "WaDirection" NOT NULL,
    "type" TEXT NOT NULL,
    "body" TEXT,
    "mediaId" TEXT,
    "templateName" TEXT,
    "lastStatus" TEXT,
    "campaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_message_statuses" (
    "id" TEXT NOT NULL,
    "wamid" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "statusTimestamp" TIMESTAMP(3) NOT NULL,
    "errorCode" INTEGER,
    "errorTitle" TEXT,
    "errorMessage" TEXT,
    "errorDetails" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_message_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wa_messages_wamid_key" ON "wa_messages"("wamid");

-- CreateIndex
CREATE INDEX "wa_messages_waId_idx" ON "wa_messages"("waId");

-- CreateIndex
CREATE INDEX "wa_messages_campaignId_idx" ON "wa_messages"("campaignId");

-- CreateIndex
CREATE INDEX "wa_message_statuses_wamid_idx" ON "wa_message_statuses"("wamid");

-- CreateIndex
CREATE UNIQUE INDEX "wa_message_statuses_wamid_status_key" ON "wa_message_statuses"("wamid", "status");

-- AddForeignKey
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_waId_fkey" FOREIGN KEY ("waId") REFERENCES "wa_contacts"("waId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "wa_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

