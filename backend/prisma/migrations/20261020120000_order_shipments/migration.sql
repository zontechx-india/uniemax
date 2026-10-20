-- Parcels: courier, tracking and what happened to each parcel of an order
-- (docs/dropshipping/shipments/context.md, Phase 0). Additive only — a new
-- table plus a nullable column on order_items; existing orders have no parcels.

-- CreateEnum
CREATE TYPE "public"."ShipmentSource" AS ENUM ('SELLER', 'PACKAGE');

-- AlterTable
ALTER TABLE "public"."order_items" ADD COLUMN "shipmentId" TEXT;

-- CreateTable
CREATE TABLE "public"."order_shipments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "carrierCode" TEXT,
    "carrier" TEXT NOT NULL,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "senderName" TEXT,
    "source" "public"."ShipmentSource" NOT NULL DEFAULT 'SELLER',
    "externalRef" TEXT,
    "shippedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "restocked" BOOLEAN NOT NULL DEFAULT false,
    "podKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_shipments_orderId_idx" ON "public"."order_shipments"("orderId");

-- CreateIndex
CREATE INDEX "order_items_shipmentId_idx" ON "public"."order_items"("shipmentId");

-- AddForeignKey
ALTER TABLE "public"."order_items" ADD CONSTRAINT "order_items_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "public"."order_shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_shipments" ADD CONSTRAINT "order_shipments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
