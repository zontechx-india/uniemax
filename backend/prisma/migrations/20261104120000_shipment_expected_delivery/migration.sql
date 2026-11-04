-- AlterTable: per-parcel expected delivery day, set by an admin.
ALTER TABLE "public"."order_shipments" ADD COLUMN "expectedDeliveryAt" DATE;
