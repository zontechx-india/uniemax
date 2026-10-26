-- D-52: invites are personal, so a link never waits for the seller's approval. A link still
-- waiting (D-51) is ended — it supplied nothing — before PENDING leaves the enum.
UPDATE "dropship"."supplier_links" SET "status" = 'ENDED', "statusBy" = 'SELLER' WHERE "status" = 'PENDING';

-- AlterEnum
BEGIN;
CREATE TYPE "dropship"."LinkStatus_new" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');
ALTER TABLE "dropship"."supplier_links" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "dropship"."supplier_links" ALTER COLUMN "status" TYPE "dropship"."LinkStatus_new" USING ("status"::text::"dropship"."LinkStatus_new");
ALTER TYPE "dropship"."LinkStatus" RENAME TO "LinkStatus_old";
ALTER TYPE "dropship"."LinkStatus_new" RENAME TO "LinkStatus";
DROP TYPE "dropship"."LinkStatus_old";
ALTER TABLE "dropship"."supplier_links" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;
