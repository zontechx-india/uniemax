-- AlterTable
ALTER TABLE "wa_messages" ADD COLUMN     "errorCode" INTEGER,
ADD COLUMN     "errorDetails" TEXT,
ADD COLUMN     "errorTitle" TEXT;


-- Backfill: messages already failed by webhook take the error from their
-- recorded "failed" status.
UPDATE "wa_messages" m
SET "errorCode" = s."errorCode",
    "errorTitle" = s."errorTitle",
    "errorDetails" = COALESCE(s."errorDetails", s."errorMessage")
FROM "wa_message_statuses" s
WHERE s."wamid" = m."wamid" AND s."status" = 'failed' AND m."errorCode" IS NULL;
