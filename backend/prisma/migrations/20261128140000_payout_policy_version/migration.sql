-- Each payout remembers the PolicyHub version of the seller payout policy
-- (PYO-001) in force for it (docs/policyhub/README.md §10). Plain text, no
-- FK: policy_versions lives in another schema and will move to another
-- database. Existing payouts stay null (= made before PolicyHub).
ALTER TABLE "public"."order_payouts" ADD COLUMN "policyVersionId" TEXT;
