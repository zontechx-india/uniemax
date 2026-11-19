-- Seller leads (Orders → Leads): one store's ACTIVE cart lines touched in the
-- last 30 days. Hand-written (db:migrate wants to reset the dev DB — see
-- BACKEND_CONTEXT); matches Prisma's naming so `prisma migrate diff` is clean.

-- CreateIndex
CREATE INDEX "cart_lines_storeId_status_updatedAt_idx" ON "public"."cart_lines"("storeId", "status", "updatedAt");
