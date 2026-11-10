-- When the "paid" follow-up (order.paid event + messages) ran for a gateway
-- order. Additive. Every order paid before this column existed is stamped
-- now, so the payments job never sends its messages a second time.

-- AlterTable
ALTER TABLE "public"."orders" ADD COLUMN "paidNotifiedAt" TIMESTAMP(3);

UPDATE "public"."orders"
SET "paidNotifiedAt" = CURRENT_TIMESTAMP
WHERE "paymentStatus" IN ('PAID', 'REFUNDED');
