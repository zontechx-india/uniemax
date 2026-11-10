-- Track when the seller-signup event was sent to Meta's Conversions API, so
-- the API endpoint behind the browser's `fbq('CompleteRegistration', …)` only
-- sends once per customer. A repeat sign-in or a page refresh is a no-op.
ALTER TABLE "public"."customers"
  ADD COLUMN IF NOT EXISTS "metaSellerSignupSentAt" TIMESTAMP(3);
