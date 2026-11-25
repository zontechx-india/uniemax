-- Order address changes: the seller (or support) corrects a delivery address
-- after placement; each change keeps the address it replaced.
-- Additive only. Hand-written (db:migrate wants to reset the dev DB).

-- CreateEnum
CREATE TYPE "public"."OrderAddressEditor" AS ENUM ('SELLER', 'SUPPORT');

-- CreateTable
CREATE TABLE "public"."order_address_changes" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "changedBy" "public"."OrderAddressEditor" NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_address_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_address_changes_orderId_createdAt_idx" ON "public"."order_address_changes"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."order_address_changes" ADD CONSTRAINT "order_address_changes_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
