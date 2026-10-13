-- AlterTable
ALTER TABLE "wa_campaigns" ADD COLUMN     "finishedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "wa_contacts" ADD COLUMN     "lastMessageAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "wa_contacts_lastMessageAt_idx" ON "wa_contacts"("lastMessageAt");


-- Backfill: existing contacts sort by their latest message.
UPDATE "wa_contacts" c
SET "lastMessageAt" = m.latest
FROM (SELECT "waId", MAX("createdAt") AS latest FROM "wa_messages" GROUP BY "waId") m
WHERE m."waId" = c."waId";
