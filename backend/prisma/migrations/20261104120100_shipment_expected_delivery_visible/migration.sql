-- AlterTable: the admin's "Show to customer" tick for the expected delivery day.
ALTER TABLE "public"."order_shipments" ADD COLUMN "expectedDeliveryVisible" BOOLEAN NOT NULL DEFAULT false;
