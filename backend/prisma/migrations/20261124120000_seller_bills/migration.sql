-- Seller bills (modules/bills): a bill a seller makes for a phone / in-shop
-- customer, paid from its link. Additive only: a new table, two enums, and two
-- columns on orders (source, billId) with defaults — existing rows read CHECKOUT.
-- Hand-written (db:migrate wants to reset the dev DB — see BACKEND_CONTEXT).

-- CreateEnum
CREATE TYPE "public"."OrderSource" AS ENUM ('CHECKOUT', 'BILL');

-- CreateEnum
CREATE TYPE "public"."BillStatus" AS ENUM ('OPEN', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "public"."orders" ADD COLUMN     "billId" TEXT,
ADD COLUMN     "source" "public"."OrderSource" NOT NULL DEFAULT 'CHECKOUT';

-- CreateTable
CREATE TABLE "public"."bills" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "createdById" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT NOT NULL,
    "fulfilment" "public"."OrderFulfilment" NOT NULL DEFAULT 'DELIVERY',
    "items" JSONB NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "shippingCharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discountType" TEXT,
    "discountValue" DECIMAL(10,2),
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "status" "public"."BillStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sharedAt" TIMESTAMP(3),
    "shares" JSONB,
    "openedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bills_number_key" ON "public"."bills"("number");

-- CreateIndex
CREATE UNIQUE INDEX "bills_token_key" ON "public"."bills"("token");

-- CreateIndex
CREATE UNIQUE INDEX "bills_orderId_key" ON "public"."bills"("orderId");

-- CreateIndex
CREATE INDEX "bills_storeId_createdAt_idx" ON "public"."bills"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "bills_status_expiresAt_idx" ON "public"."bills"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "orders_billId_idx" ON "public"."orders"("billId");

-- AddForeignKey
ALTER TABLE "public"."bills" ADD CONSTRAINT "bills_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

