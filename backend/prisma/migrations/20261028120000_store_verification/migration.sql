-- Manual store verification by a platform admin: who checked the store's
-- GSTIN, when, and which GSTIN it was. Null = not verified. Verified stores
-- lead the marketplace "Top Stores" rail and wear a "Verified" badge.
ALTER TABLE "public"."stores"
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "verifiedBy" TEXT,
  ADD COLUMN "verifiedGstin" TEXT;
