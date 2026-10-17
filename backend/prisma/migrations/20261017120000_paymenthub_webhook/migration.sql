-- PaymentHub webhook receiver (POST /api/v1/payments/webhooks/paymenthub).
-- UnieMax-owned objects only, all in "public": the hub's own tables live in
-- schema "paymenthub" in this same database and are never touched from here.

-- The hub intent id (pi_…) of an order's latest hub payment.
ALTER TABLE "public"."orders" ADD COLUMN "paymentIntentId" TEXT;
CREATE UNIQUE INDEX "orders_paymentIntentId_key" ON "public"."orders"("paymentIntentId");

-- At-least-once delivery dedupe: one row per hub event id.
CREATE TABLE "public"."payment_hub_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "payment_hub_events_pkey" PRIMARY KEY ("id")
);
