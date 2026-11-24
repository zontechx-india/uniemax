-- Offline bills (modules/bills): a bill the seller was already paid for
-- (cash / UPI to their own number / bank) — its order is made at once with
-- payment method OFFLINE. Plus who paid when it was not the order's customer.
-- Additive only: a new enum value, a new enum, nullable / defaulted columns.
-- Hand-written (db:migrate wants to reset the dev DB — see BACKEND_CONTEXT).

-- CreateEnum
CREATE TYPE "public"."BillPayWay" AS ENUM ('LINK', 'OFFLINE');

-- AlterEnum
ALTER TYPE "public"."PaymentMethod" ADD VALUE 'OFFLINE';

-- AlterTable
ALTER TABLE "public"."orders" ADD COLUMN     "offlineMode" TEXT,
ADD COLUMN     "paidByName" TEXT,
ADD COLUMN     "paidByPhone" TEXT;

-- AlterTable
ALTER TABLE "public"."bills" ADD COLUMN     "address" JSONB,
ADD COLUMN     "handedOver" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "offlineMode" TEXT,
ADD COLUMN     "offlineRef" TEXT,
ADD COLUMN     "payWay" "public"."BillPayWay" NOT NULL DEFAULT 'LINK';
