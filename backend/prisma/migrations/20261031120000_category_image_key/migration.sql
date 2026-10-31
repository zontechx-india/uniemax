-- Admin-uploaded category picture (media bucket key). Read models expose it as imageUrl.
ALTER TABLE "public"."categories" ADD COLUMN "imageKey" TEXT;
