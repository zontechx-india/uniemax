-- Seller payouts per order: manual transfers + PaymentHub payouts, with an
-- append-only status history. Additive only.

-- CreateEnum
CREATE TYPE "public"."PayoutMethod" AS ENUM ('MANUAL', 'GATEWAY');

-- CreateEnum
CREATE TYPE "public"."PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REVERSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."PayoutEventSource" AS ENUM ('ADMIN', 'HUB_RESPONSE', 'HUB_WEBHOOK');

-- CreateTable
CREATE TABLE "public"."order_payouts" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "method" "public"."PayoutMethod" NOT NULL,
    "status" "public"."PayoutStatus" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payeeAccountId" TEXT,
    "payeeName" TEXT,
    "payeeBank" TEXT,
    "payeeIfsc" TEXT,
    "payeeLast4" TEXT,
    "senderName" TEXT,
    "senderBank" TEXT,
    "senderLast4" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidAtTimeKnown" BOOLEAN NOT NULL DEFAULT false,
    "utr" TEXT,
    "notes" TEXT,
    "gateway" TEXT,
    "hubPayoutId" TEXT,
    "gatewayRef" TEXT,
    "hubRequest" JSONB,
    "hubResponse" JSONB,
    "failureReason" TEXT,
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."order_payout_events" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "fromStatus" "public"."PayoutStatus",
    "toStatus" "public"."PayoutStatus" NOT NULL,
    "source" "public"."PayoutEventSource" NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "note" TEXT,
    "hubEventId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_payout_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_payouts_hubPayoutId_key" ON "public"."order_payouts"("hubPayoutId");

-- CreateIndex
CREATE INDEX "order_payouts_orderId_createdAt_idx" ON "public"."order_payouts"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "order_payouts_status_createdAt_idx" ON "public"."order_payouts"("status", "createdAt");

-- CreateIndex
CREATE INDEX "order_payouts_utr_idx" ON "public"."order_payouts"("utr");

-- CreateIndex
CREATE UNIQUE INDEX "order_payouts_orderId_idempotencyKey_key" ON "public"."order_payouts"("orderId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "order_payout_events_payoutId_createdAt_idx" ON "public"."order_payout_events"("payoutId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."order_payouts" ADD CONSTRAINT "order_payouts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_payout_events" ADD CONSTRAINT "order_payout_events_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "public"."order_payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

