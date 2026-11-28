/**
 * Payout ↔ policy link — end-to-end check against a REAL database (dev only).
 * docs/policyhub/README.md §10, §12 Phase 2.
 *
 * Under a throwaway PolicyHub project ("qa-pp-<time>"), with its own customer,
 * store and orders, it records real manual payouts and checks which PYO-001
 * version each one saved:
 *   - nothing published → null, and the payout still succeeds;
 *   - delivered under v1 → v1, even when paid after v2 has started;
 *   - delivered under v2 → v2;
 *   - an advance (not delivered) → the version in force when it is made;
 *   - a repeated idempotency key → the same payout, unchanged;
 *   - admin order view and seller Earnings show { version, effectiveFrom }.
 * Then deletes everything it made.
 *
 *   npx tsx scripts/payout-policy-check.ts
 *
 * Refuses to run against production (APP_ENV / NODE_ENV = production).
 */
import "../src/config/loadEnv.js";
import assert from "node:assert/strict";
import type { FastifyBaseLogger } from "fastify";

if ((process.env.APP_ENV ?? process.env.NODE_ENV) === "production") {
  throw new Error("Refusing to run the payout policy check against production");
}

const PROJECT = `qa-pp-${Date.now()}`;
process.env.POLICY_PROJECT = PROJECT; // before the policy package loads

const { prisma } = await import("../src/config/prisma.js");
const { Prisma } = await import("../src/generated/prisma/client.js");
const policy = await import("../src/package/policy/service.js");
const { getOrderPayouts, payoutPolicyVersionId, recordManualPayout } = await import("../src/modules/payouts/payouts.service.js");
const { getSellerEarnings, setAdvancePayouts } = await import("../src/modules/finance/finance.service.js");

const quiet = {
  info: () => {},
  warn: (...a: unknown[]) => console.warn("[log.warn]", ...a),
  debug: () => {},
  trace: () => {},
  fatal: (...a: unknown[]) => console.error(...a),
  error: (...a: unknown[]) => console.error("[log.error]", ...a),
  child() {
    return quiet;
  },
} as unknown as FastifyBaseLogger;

const tag = `pp${Date.now().toString(36)}`;
const actor = { id: "payout-policy-check", email: "payout-policy-check@uniemax.invalid" };
const SETTINGS = { cutoff: "18:00", windowStart: "18:00", windowEnd: "22:00", timezone: "Asia/Kolkata" };
const BODY = "Before {{cutoff}} {{tz}}: paid between {{windowStart}} and {{windowEnd}} {{tz}}.";
let n = 0;
const key = () => `${tag}-key-${(n += 1)}`;
const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const manual = (amount: string, idempotencyKey = key()) => ({
  amount,
  duesDeducted: "0",
  idempotencyKey,
  status: "SUCCEEDED" as const,
  senderName: "Payout Policy Check",
  paidOn: today,
});
const ok = (label: string) => console.log(`  ✔ ${label}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const customer = await prisma.customer.create({ data: { email: `${tag}@uniemax.invalid`, name: "Payout Policy Check" } });
  const store = await prisma.store.create({ data: { name: `Payout Policy Check ${tag}`, slug: `${tag}-store`, ownerId: customer.id } });
  const orders: string[] = [];

  async function order(delivered: boolean) {
    const row = await prisma.order.create({
      data: {
        orderNumber: `${tag}-${orders.length + 1}`,
        storeId: store.id,
        storeName: store.name,
        storeSlug: store.slug,
        status: delivered ? "DELIVERED" : "SHIPPED",
        paymentMethod: "ONLINE",
        paymentStatus: "PAID",
        subtotal: new Prisma.Decimal("1000.00"),
        total: new Prisma.Decimal("1000.00"),
        ...(delivered ? { deliveredAt: new Date() } : {}),
        items: { create: [{ productName: "Test item", unitPrice: new Prisma.Decimal("1000.00"), quantity: 1, lineTotal: new Prisma.Decimal("1000.00") }] },
      },
    });
    orders.push(row.id);
    return row.id;
  }
  const savedVersion = async (payoutId: string) => {
    const row = await prisma.orderPayout.findUniqueOrThrow({ where: { id: payoutId }, select: { policyVersionId: true } });
    return row.policyVersionId;
  };

  try {
    console.log(`store ${store.id} · policy project ${PROJECT}`);

    // 1. Nothing published yet → null, payout still made.
    const o0 = await order(true);
    const p0 = await recordManualPayout(o0, manual("100"), actor, quiet);
    assert.equal(p0.status, "SUCCEEDED");
    assert.equal(await savedVersion(p0.id), null);
    assert.equal(p0.policyVersion, null);
    ok("no published policy → payout made, policyVersionId null");

    // 2. Publish v1 now; an order delivered after that gets v1.
    await policy.createPolicy({ code: "PYO-001", name: "Seller Payout Policy", audience: "seller" }, actor);
    await policy.updateDraft("PYO-001", { body: BODY, settings: SETTINGS }, actor);
    const v1 = await policy.publishDraft("PYO-001", {}, actor);
    await sleep(20);
    const o1 = await order(true);
    const p1 = await recordManualPayout(o1, manual("100"), actor, quiet);
    assert.equal(await savedVersion(p1.id), v1.id);
    assert.equal(p1.policyVersion?.version, 1);
    ok("delivered under v1 → payout saves v1");

    // 3. Schedule v2 a few seconds out; let it start.
    await policy.startDraft("PYO-001", actor);
    await policy.updateDraft("PYO-001", { settings: { ...SETTINGS, cutoff: "17:00" }, changeSummary: "Cutoff 5 PM", changeReason: "QA" }, actor);
    const v2 = await policy.publishDraft("PYO-001", { effectiveFrom: new Date(Date.now() + 3000) }, actor);
    await sleep(3500);

    // 3a. Same v1-delivered order, paid again after v2 started → still v1.
    const p1b = await recordManualPayout(o1, manual("50"), actor, quiet);
    assert.equal(await savedVersion(p1b.id), v1.id);
    ok("delivered under v1, paid after v2 started → still v1 (the promise at delivery)");

    // 3b. Delivered now → v2.
    const o2 = await order(true);
    const p2 = await recordManualPayout(o2, manual("100"), actor, quiet);
    assert.equal(await savedVersion(p2.id), v2.id);
    ok("delivered under v2 → v2");

    // 4. Advance (not delivered) → the version in force now (v2).
    await setAdvancePayouts(store.id, true);
    const o3 = await order(false);
    const p3 = await recordManualPayout(o3, manual("100"), actor, quiet);
    assert.equal(p3.isAdvance, true);
    assert.equal(await savedVersion(p3.id), v2.id);
    ok("advance before delivery → version in force when it is made (v2)");

    // 5. Repeat key → same payout, same version.
    const again = manual("100");
    const r1 = await recordManualPayout(o2, again, actor, quiet);
    const r2 = await recordManualPayout(o2, again, actor, quiet);
    assert.equal(r1.id, r2.id);
    assert.equal(await savedVersion(r2.id), v2.id);
    ok("repeated idempotency key → same payout, version unchanged");

    // 6. What admin and seller see.
    const view = await getOrderPayouts(o1);
    assert.deepEqual(view.payouts.map((p) => p.policyVersion?.version), [1, 1]);
    const earnings = await getSellerEarnings(store.id, 1, 20);
    const byId = new Map(earnings.payouts.map((p) => [p.id, p]));
    assert.equal(byId.get(p0.id)?.policyVersion, null);
    assert.equal(byId.get(p1.id)?.policyVersion?.version, 1);
    assert.equal(byId.get(p2.id)?.policyVersion?.version, 2);
    assert.ok(!("policyVersionId" in (byId.get(p2.id) ?? {})), "seller sees no raw id");
    ok("admin order view and seller Earnings show { version, effectiveFrom }");

    // 7. The lookup itself failing → null + a warning, never an error.
    let warned = 0;
    const counting = { ...quiet, warn: () => void (warned += 1) } as unknown as FastifyBaseLogger;
    const broken = await payoutPolicyVersionId(undefined as unknown as string, counting); // Prisma rejects this id
    assert.equal(broken, null);
    assert.equal(warned, 1);
    ok("policy lookup error → null and a warning (the payout would still be saved)");

    console.log("ALL PAYOUT POLICY CHECKS PASSED");
  } finally {
    const payoutIds = (await prisma.orderPayout.findMany({ where: { orderId: { in: orders } }, select: { id: true } })).map((p) => p.id);
    await prisma.sellerLedgerEntry.deleteMany({ where: { storeId: store.id } });
    await prisma.sellerBalance.deleteMany({ where: { storeId: store.id } });
    await prisma.orderPayoutEvent.deleteMany({ where: { payoutId: { in: payoutIds } } });
    await prisma.orderPayout.deleteMany({ where: { id: { in: payoutIds } } });
    await prisma.orderFinancials.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.order.deleteMany({ where: { id: { in: orders } } });
    await prisma.store.delete({ where: { id: store.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
    await prisma.policyEvent.deleteMany({ where: { project: PROJECT } });
    await prisma.policyVersion.deleteMany({ where: { project: PROJECT } });
    await prisma.policy.deleteMany({ where: { project: PROJECT } });
    console.log("cleaned up");
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
