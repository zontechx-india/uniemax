-- CreateEnum
CREATE TYPE "dropship"."SupplierOrderStatus" AS ENUM ('AWAITING_PAYMENT', 'EXPIRED', 'NEW', 'ACCEPTED', 'SHIPPED', 'DELIVERED', 'REJECTED', 'CANCELLED', 'RETURNED');

-- CreateEnum
CREATE TYPE "dropship"."PaymentMode" AS ENUM ('PREPAID', 'COD');

-- CreateEnum
CREATE TYPE "dropship"."StatementState" AS ENUM ('PENDING', 'OWED', 'HELD', 'VOID');

-- CreateEnum
CREATE TYPE "dropship"."SettleVia" AS ENUM ('DIRECT', 'SPLIT');

-- CreateTable
CREATE TABLE "dropship"."supplier_orders" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "sellerStoreId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "status" "dropship"."SupplierOrderStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "paymentMode" "dropship"."PaymentMode" NOT NULL,
    "collectAmount" DECIMAL(10,2),
    "shipWithinDays" INTEGER NOT NULL,
    "returnDays" INTEGER NOT NULL,
    "returnFeePayer" "dropship"."ReturnFeePayer" NOT NULL,
    "platformFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "settleVia" "dropship"."SettleVia" NOT NULL,
    "shipBy" TIMESTAMP(3),
    "shipmentId" TEXT,
    "closeReason" TEXT,
    "issueOpenAt" TIMESTAMP(3),
    "issueTicketId" TEXT,
    "adminResolvedAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "costTotal" DECIMAL(10,2) NOT NULL,
    "shippingFee" DECIMAL(10,2) NOT NULL,
    "supplierShare" DECIMAL(10,2) NOT NULL,
    "statementState" "dropship"."StatementState" NOT NULL DEFAULT 'PENDING',
    "owedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dropship"."supplier_order_lines" (
    "id" TEXT NOT NULL,
    "supplierOrderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "supplierVariantId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "variantName" TEXT,
    "supplierSku" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "supplier_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dropship"."supplier_order_events" (
    "id" TEXT NOT NULL,
    "supplierOrderId" TEXT NOT NULL,
    "from" "dropship"."SupplierOrderStatus",
    "to" "dropship"."SupplierOrderStatus" NOT NULL,
    "actor" "dropship"."DropshipActor" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_order_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_orders_supplierId_status_idx" ON "dropship"."supplier_orders"("supplierId", "status");

-- CreateIndex
CREATE INDEX "supplier_orders_sellerStoreId_createdAt_idx" ON "dropship"."supplier_orders"("sellerStoreId", "createdAt");

-- CreateIndex
CREATE INDEX "supplier_orders_linkId_statementState_idx" ON "dropship"."supplier_orders"("linkId", "statementState");

-- CreateIndex
CREATE INDEX "supplier_orders_status_createdAt_idx" ON "dropship"."supplier_orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "supplier_orders_status_shipBy_idx" ON "dropship"."supplier_orders"("status", "shipBy");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_orders_orderId_supplierId_key" ON "dropship"."supplier_orders"("orderId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_order_lines_orderItemId_key" ON "dropship"."supplier_order_lines"("orderItemId");

-- CreateIndex
CREATE INDEX "supplier_order_lines_supplierOrderId_idx" ON "dropship"."supplier_order_lines"("supplierOrderId");

-- CreateIndex
CREATE INDEX "supplier_order_lines_supplierVariantId_idx" ON "dropship"."supplier_order_lines"("supplierVariantId");

-- CreateIndex
CREATE INDEX "supplier_order_events_supplierOrderId_createdAt_idx" ON "dropship"."supplier_order_events"("supplierOrderId", "createdAt");

-- AddForeignKey
ALTER TABLE "dropship"."supplier_orders" ADD CONSTRAINT "supplier_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "dropship"."suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dropship"."supplier_orders" ADD CONSTRAINT "supplier_orders_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "dropship"."supplier_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dropship"."supplier_order_lines" ADD CONSTRAINT "supplier_order_lines_supplierOrderId_fkey" FOREIGN KEY ("supplierOrderId") REFERENCES "dropship"."supplier_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dropship"."supplier_order_events" ADD CONSTRAINT "supplier_order_events_supplierOrderId_fkey" FOREIGN KEY ("supplierOrderId") REFERENCES "dropship"."supplier_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

