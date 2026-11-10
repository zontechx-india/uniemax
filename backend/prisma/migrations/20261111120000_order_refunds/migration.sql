-- Refunds to customers through PaymentHub: one row per refund, settled by the
-- hub's refund webhooks. Additive only.

-- CreateEnum
CREATE TYPE "public"."RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "public"."order_refunds" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "public"."RefundStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "intentId" TEXT,
    "hubRefundId" TEXT,
    "gatewayRefundId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "requestedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_refunds_hubRefundId_key" ON "public"."order_refunds"("hubRefundId");

-- CreateIndex
CREATE INDEX "order_refunds_orderId_idx" ON "public"."order_refunds"("orderId");

-- CreateIndex
CREATE INDEX "order_refunds_status_updatedAt_idx" ON "public"."order_refunds"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "order_refunds_intentId_idx" ON "public"."order_refunds"("intentId");

-- AddForeignKey
ALTER TABLE "public"."order_refunds" ADD CONSTRAINT "order_refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
