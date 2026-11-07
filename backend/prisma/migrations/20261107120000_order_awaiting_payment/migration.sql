-- An ONLINE order waits here until its payment goes through; sellers never see it.
-- Its own migration: Postgres can't use a new enum value in the transaction that adds it.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'AWAITING_PAYMENT' BEFORE 'PENDING';
