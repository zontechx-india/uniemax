-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "billingAddress" JSONB,
ADD COLUMN     "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "shippingBasis" JSONB,
ADD COLUMN     "shippingMethod" TEXT,
ADD COLUMN     "tax" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "store_products" ADD COLUMN     "codAvailable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "shippingOverride" JSONB;
