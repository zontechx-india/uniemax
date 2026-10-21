-- CreateEnum
CREATE TYPE "dropship"."SettlementDirection" AS ENUM ('SELLER_TO_SUPPLIER', 'SUPPLIER_TO_SELLER');

-- AlterTable
ALTER TABLE "dropship"."supplier_orders" ADD COLUMN     "confirmRemindedAt" TIMESTAMP(3),
ADD COLUMN     "deliveredRemindedAt" TIMESTAMP(3),
ADD COLUMN     "lateNotifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "dropship"."settlements" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "direction" "dropship"."SettlementDirection" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "recordedBy" TEXT NOT NULL,
    "recordedAs" "dropship"."DropshipActor" NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settlements_linkId_paidOn_idx" ON "dropship"."settlements"("linkId", "paidOn");

-- AddForeignKey
ALTER TABLE "dropship"."settlements" ADD CONSTRAINT "settlements_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "dropship"."supplier_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

