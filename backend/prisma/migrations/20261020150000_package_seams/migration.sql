-- Core seams for packages (docs/dropshipping, Phase 1). Additive only.

-- A notification kind for supplier dropshipping (package/dropship).
ALTER TYPE "public"."NotificationKind" ADD VALUE 'DROPSHIP';

-- An order line another party ships (set by a package while the order is
-- placed); null = the store ships it.
ALTER TABLE "public"."order_items" ADD COLUMN "fulfilledBy" TEXT;
