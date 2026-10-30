-- Answers to a store's own checkout questions (Store.checkout.customFields).
ALTER TABLE "public"."orders" ADD COLUMN "customFields" JSONB;
