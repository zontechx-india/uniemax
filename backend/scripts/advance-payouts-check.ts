/**
 * Advance payouts — end-to-end check against a REAL database (dev only).
 * docs/seller-finance/README.md §9.
 *
 * Creates its own customer, store and orders, drives the real payout and
 * finance services through every advance path, checks the balances against
 * the ledger after each step, then deletes everything it made.
 *
 *   npx tsx scripts/advance-payouts-check.ts
 *
 * Refuses to run against production (APP_ENV / NODE_ENV = production).
 */
import "../src/config/loadEnv.js";
import assert from "node:assert/strict";
import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../src/config/prisma.js";
import { Prisma } from "../src/generated/prisma/client.js";
import {
  getOrderPayouts,
  recordManualPayout,
  triggerGatewayPayout,
  updateManualStatus,
} from "../src/modules/payouts/payouts.service.js";
import {
  getSellerTransactions,
  postDeliveredOrder,
  resolveOrderAdvances,
  setAdvancePayouts,
} from "../src/modules/finance/finance.service.js";

if ((process.env.APP_ENV ?? process.env.NODE_ENV) === "production") {
  throw new Error("Refusing to run the advance payout check against production");
}

const quiet = {
  info: () => {},
  warn: () => {},
  debug: () => {},
  trace: () => {},
  fatal: (...a: unknown[]) => console.error(...a),
  error: (...a: unknown[]) => console.error("[log.error]", ...a),
  child() {
    return quiet;
  },
} as unknown as FastifyBaseLogger;

const tag = `adv${Date.now().toString(36)}`;
const actor = { id: "advance-check", email: "advance-check@uniemax.invalid" };
let n = 0;
const key = () => `${tag}-key-${(n += 1)}`;
const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

const manual = (amount: string, over: Partial<Parameters<typeof recordManualPayout>[1]> = {}) => ({
  amount,
  duesDeducted: "0",
  idempotencyKey: key(),
  status: "SUCCEEDED" as const,
  senderName: "Advance Check",
  paidOn: today,
  ...over,
});

async function expectConflict(promise: Promise<unknown>, pattern: RegExp, what: string) {
  await assert.rejects(promise, (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    assert.match(message, pattern, `${what}: ${message}`);
    return true;
  });
  console.log(`  ✔ refused: ${what}`);
}

/** The balance row must equal the sum of the store's ledger entries, per bucket. */
async function balances(storeId: string) {
  const row = await prisma.sellerBalance.findUnique({ where: { storeId } });
  const sums = await prisma.sellerLedgerEntry.groupBy({ by: ["bucket"], where: { storeId }, _sum: { amount: true } });
  const sum = (b: string) => (sums.find((s) => s.bucket === b)?._sum.amount ?? new Prisma.Decimal(0)).toFixed(2);
  const got = {
    payable: row?.payable.toFixed(2) ?? "0.00",
    inPayout: row?.inPayout.toFixed(2) ?? "0.00",
    owed: row?.owed.toFixed(2) ?? "0.00",
    advance: row?.advance.toFixed(2) ?? "0.00",
  };
  assert.deepEqual(got, { payable: sum("PAYABLE"), inPayout: sum("IN_PAYOUT"), owed: sum("OWED"), advance: sum("ADVANCE") }, "balance row ≠ ledger");
  return got;
}

async function main() {
  const customer = await prisma.customer.create({ data: { email: `${tag}@uniemax.invalid`, name: "Advance Check" } });
  const store = await prisma.store.create({ data: { name: `Advance Check ${tag}`, slug: `${tag}-store`, ownerId: customer.id } });
  const orders: string[] = [];

  async function order(status: "SHIPPED" | "DELIVERED" | "PACKED" = "SHIPPED") {
    const row = await prisma.order.create({
      data: {
        orderNumber: `${tag}-${orders.length + 1}`,
        storeId: store.id,
        storeName: store.name,
        storeSlug: store.slug,
        status,
        paymentMethod: "ONLINE",
        paymentStatus: "PAID",
        subtotal: new Prisma.Decimal("1000.00"),
        total: new Prisma.Decimal("1000.00"),
        ...(status === "DELIVERED" ? { deliveredAt: new Date() } : {}),
        items: { create: [{ productName: "Test item", unitPrice: new Prisma.Decimal("1000.00"), quantity: 1, lineTotal: new Prisma.Decimal("1000.00") }] },
      },
    });
    orders.push(row.id);
    return row.id;
  }
  async function deliver(orderId: string) {
    await prisma.order.update({ where: { id: orderId }, data: { status: "DELIVERED", deliveredAt: new Date() } });
    await postDeliveredOrder(orderId); // what the DELIVERED event does
  }

  try {
    console.log(`store ${store.id} (${tag})`);

    // --- A. switch off -------------------------------------------------------
    console.log("A. switch off");
    const a = await order();
    const sa = await getOrderPayouts(a);
    assert.equal(sa.summary.canPay, false);
    assert.equal(sa.summary.advance.now, true);
    assert.equal(sa.summary.advance.needsSwitch, true);
    const earning = sa.summary.sellerEarning;
    console.log(`  seller earning on ₹1000 = ₹${earning}`);
    await expectConflict(recordManualPayout(a, manual("100"), actor, quiet), /allow advance payouts/, "advance while the switch is off");

    // --- B. full advance, then delivered --------------------------------------
    console.log("B. full advance → delivered");
    assert.equal((await setAdvancePayouts(store.id, true)).changed, true);
    const sb = await getOrderPayouts(a);
    assert.equal(sb.summary.canPay, true);
    assert.equal(sb.summary.suggested.amount, earning);
    assert.equal(sb.summary.suggested.duesDeducted, "0.00");
    assert.equal(sb.summary.gateway.available, false);
    await expectConflict(recordManualPayout(a, manual("1", { duesDeducted: "1" }), actor, quiet), /Dues can't be taken/, "dues on an advance");
    await expectConflict(triggerGatewayPayout(a, { amount: "1", idempotencyKey: key() }, actor, quiet), /by hand only|not switched on/, "gateway advance");
    await expectConflict(recordManualPayout(a, manual("99999"), actor, quiet), /left to pay/, "more than the earning");
    const full = await recordManualPayout(a, manual(earning), actor, quiet);
    assert.equal(full.isAdvance, true);
    let bal = await balances(store.id);
    assert.deepEqual(bal, { payable: "0.00", inPayout: "0.00", owed: "0.00", advance: earning });
    // Repeat key → same payout, nothing new.
    const again = await recordManualPayout(a, { ...manual(earning), idempotencyKey: full.idempotencyKey }, actor, quiet);
    assert.equal(again.id, full.id);
    assert.deepEqual(await balances(store.id), bal);
    const tx = await getSellerTransactions(store.id, { page: 1, pageSize: 20 });
    const rowA = tx.rows.find((r) => r.id === a)!;
    assert.equal(rowA.settlement.status, "ADVANCE_PAID");
    assert.equal(rowA.settlement.advance, earning);
    await expectConflict(recordManualPayout(a, manual("1"), actor, quiet), /fully paid out/, "second advance with nothing left");
    await deliver(a);
    bal = await balances(store.id);
    assert.deepEqual(bal, { payable: "0.00", inPayout: "0.00", owed: "0.00", advance: "0.00" });
    const payoutA = await prisma.orderPayout.findUniqueOrThrow({ where: { id: full.id } });
    assert.equal(payoutA.advanceOutcome, "SETTLED");
    const sb2 = await getOrderPayouts(a);
    assert.equal(sb2.summary.remaining, "0.00");
    assert.equal(sb2.summary.advance.now, false);
    console.log("  ✔ delivered: advance cleared, nothing left to pay, nothing owed");

    // --- C. part advance (pending → sent), delivered, then the rest ----------
    console.log("C. part advance → delivered → rest paid normally");
    const c = await order("PACKED");
    const part = await recordManualPayout(c, manual("300", { status: "PENDING" }), actor, quiet);
    bal = await balances(store.id);
    assert.equal(bal.advance, "300.00");
    assert.equal(bal.inPayout, "300.00");
    await updateManualStatus(c, part.id, { status: "SUCCEEDED" }, actor, quiet);
    bal = await balances(store.id);
    assert.equal(bal.inPayout, "0.00");
    await deliver(c);
    bal = await balances(store.id);
    const rest = (Number(earning) - 300).toFixed(2);
    assert.deepEqual(bal, { payable: rest, inPayout: "0.00", owed: "0.00", advance: "0.00" });
    const sc = await getOrderPayouts(c);
    assert.equal(sc.summary.remaining, rest);
    assert.equal(sc.summary.advance.paid, "300.00");
    const restPayout = await recordManualPayout(c, manual(rest), actor, quiet);
    assert.equal(restPayout.isAdvance, false);
    bal = await balances(store.id);
    assert.deepEqual(bal, { payable: "0.00", inPayout: "0.00", owed: "0.00", advance: "0.00" });
    console.log(`  ✔ ₹300 advance + ₹${rest} after delivery = earning`);

    // --- D. advance, then the order is cancelled + refunded -------------------
    console.log("D. advance → order cancelled");
    const d = await order();
    await recordManualPayout(d, manual("500"), actor, quiet);
    await prisma.order.update({ where: { id: d }, data: { status: "CANCELLED", cancelledAt: new Date(), paymentStatus: "REFUNDED" } });
    await resolveOrderAdvances(d); // what the order.cancelled event does
    await resolveOrderAdvances(d); // twice: nothing new
    bal = await balances(store.id);
    assert.deepEqual(bal, { payable: "0.00", inPayout: "0.00", owed: "500.00", advance: "0.00" });
    console.log("  ✔ the ₹500 advance is now owed by the seller");

    // --- E. the next delivered order takes the ₹500 back -----------------------
    console.log("E. next delivered order recovers it");
    const e = await order("DELIVERED");
    await postDeliveredOrder(e);
    const se = await getOrderPayouts(e);
    assert.equal(se.summary.advance.now, false);
    assert.equal(se.summary.storeDues, "500.00");
    assert.equal(se.summary.suggested.duesDeducted, "500.00");
    await recordManualPayout(e, manual(se.summary.suggested.amount, { duesDeducted: se.summary.suggested.duesDeducted }), actor, quiet);
    bal = await balances(store.id);
    assert.deepEqual(bal, { payable: "0.00", inPayout: "0.00", owed: "0.00", advance: "0.00" });
    console.log("  ✔ dues settled from the next payout");

    // --- F. advance recorded by mistake, cancelled, then delivered -------------
    console.log("F. advance cancelled before delivery");
    const f = await order();
    const mistake = await recordManualPayout(f, manual("200"), actor, quiet);
    await updateManualStatus(f, mistake.id, { status: "CANCELLED", reason: "Recorded by mistake" }, actor, quiet);
    bal = await balances(store.id);
    assert.deepEqual(bal, { payable: "0.00", inPayout: "0.00", owed: "0.00", advance: "0.00" });
    await deliver(f);
    bal = await balances(store.id);
    assert.deepEqual(bal, { payable: earning, inPayout: "0.00", owed: "0.00", advance: "0.00" });
    assert.equal((await prisma.orderPayout.findUniqueOrThrow({ where: { id: mistake.id } })).advanceOutcome, null);
    console.log("  ✔ the full earning is payable again");

    // --- G. advance reversed after delivery ------------------------------------
    console.log("G. advance came back after delivery");
    const g = await order();
    const back = await recordManualPayout(g, manual("400"), actor, quiet);
    await deliver(g);
    await updateManualStatus(g, back.id, { status: "REVERSED", reason: "Bank returned it" }, actor, quiet);
    bal = await balances(store.id);
    assert.equal(bal.payable, (Number(earning) * 2).toFixed(2)); // f + g, both fully payable
    assert.equal(bal.advance, "0.00");
    console.log("  ✔ reversed advance → its amount is payable again");

    // --- H. switch off stops new advances only ---------------------------------
    console.log("H. switch off again");
    const h = await order();
    await recordManualPayout(h, manual("100"), actor, quiet);
    await setAdvancePayouts(store.id, false);
    await expectConflict(recordManualPayout(h, manual("100"), actor, quiet), /allow advance payouts/, "new advance after switching off");
    await deliver(h);
    bal = await balances(store.id);
    assert.equal(bal.advance, "0.00");
    console.log("  ✔ the earlier advance still cleared on delivery");

    console.log("\nALL CHECKS PASSED");
  } finally {
    // Remove everything this run made (ledger rows have no FK, so by store).
    const payoutIds = (await prisma.orderPayout.findMany({ where: { orderId: { in: orders } }, select: { id: true } })).map((p) => p.id);
    await prisma.sellerLedgerEntry.deleteMany({ where: { storeId: store.id } });
    await prisma.sellerBalance.deleteMany({ where: { storeId: store.id } });
    await prisma.orderPayoutEvent.deleteMany({ where: { payoutId: { in: payoutIds } } });
    await prisma.orderPayout.deleteMany({ where: { id: { in: payoutIds } } });
    await prisma.orderFinancials.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.order.deleteMany({ where: { id: { in: orders } } });
    await prisma.store.delete({ where: { id: store.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
    console.log("cleaned up");
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
