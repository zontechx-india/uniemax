-- AlterTable
ALTER TABLE "store_products" ADD COLUMN     "hiddenByGroup" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "product_groups" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "optionName" TEXT NOT NULL,
    "optionKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_group_members" (
    "groupId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "optionKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "product_group_members_pkey" PRIMARY KEY ("groupId","productId")
);

-- CreateIndex
CREATE INDEX "product_groups_storeId_idx" ON "product_groups"("storeId");

-- CreateIndex
CREATE INDEX "product_group_members_productId_idx" ON "product_group_members"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_group_members_groupId_value_key" ON "product_group_members"("groupId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "product_group_members_productId_optionKey_key" ON "product_group_members"("productId", "optionKey");

-- CreateIndex
CREATE INDEX "store_products_storeId_hiddenByGroup_idx" ON "store_products"("storeId", "hiddenByGroup");

-- AddForeignKey
ALTER TABLE "product_groups" ADD CONSTRAINT "product_groups_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_group_members" ADD CONSTRAINT "product_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "product_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_group_members" ADD CONSTRAINT "product_group_members_productId_fkey" FOREIGN KEY ("productId") REFERENCES "store_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
