// Dropshipping Phase 5: the account between a seller and a supplier. A customer pays cash on
// delivery; once the supplier delivers, the line counts and both sides see the same balance in
// opposite words. Payments either side records move it; only the recorder can delete theirs.
// Needs DROPSHIP_ENABLED=true on the server under test; skipped otherwise.
// M-* refer to docs/dropshipping/money.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUYER, D, dropshipFixture } from "./dropship-fixture.mjs";

const pub = (c, p) => `/api/v1/public/stores/${c.slug}${p}`;
const sellerAccount = (c) => c.A.req("GET", `${c.S}/suppliers/${c.linkId}/account`);
const supplierAccount = (c) => c.B.req("GET", `${c.Sup}/sellers/${c.linkId}/account`);
const today = () => new Date().toISOString().slice(0, 10);
let delivered; // the COD order the first tests deliver, shared by the later ones

async function deliverOne(c) {
  if (delivered) return delivered;
  const placed = await c.B.req("POST", pub(c, "/orders"), {
    json: { fulfilment: "DELIVERY", paymentMethod: "COD", customer: BUYER, items: [{ productId: c.copyId, variantId: null, quantity: 1 }] },
  });
  assert.equal(placed.status, 201, JSON.stringify(placed.body));
  const find = async () => {
    for (const tab of ["new", "shipped", "done"]) {
      const r = await c.B.req("GET", `${c.Sup}/supplier-orders?tab=${tab}`);
      const hit = r.body.data.items.find((i) => i.orderNumber === placed.body.data.orderNumber);
      if (hit) return hit;
    }
    return null;
  };
  const card = await find();
  assert.ok(card, "the supplier sees the order");
  delivered = { total: Number(placed.body.data.total), orderNumber: placed.body.data.orderNumber, card };
  return delivered;
}

test("a new order is on the account but doesn't count until it is delivered", async (t) => {
  const c = await dropshipFixture(t);
  if (!c) return;
  const before = (await sellerAccount(c)).body.data.balance;
  const d = await deliverOne(c);
  const r = await sellerAccount(c);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const line = r.body.data.lines.find((l) => l.orderNumber === d.orderNumber);
  assert.ok(line, "the order is a line on the account");
  assert.equal(line.counts, false);
  assert.equal(r.body.data.balance, before);
});

test("COD delivered: the supplier owes the seller the cash it collected less its share; both sides agree", async (t) => {
  const c = await dropshipFixture(t);
  if (!c) return;
  const d = await deliverOne(c);
  const before = (await sellerAccount(c)).body.data.balance;
  const ship = await c.B.req("POST", `${c.Sup}/supplier-orders/${d.card.id}/ship`, { json: { carrierCode: "delhivery", trackingNumber: "QA5555001" } });
  assert.equal(ship.status, 200, JSON.stringify(ship.body));
  assert.equal((await c.B.req("POST", `${c.Sup}/supplier-orders/${d.card.id}/delivered`)).status, 200);

  const seller = (await sellerAccount(c)).body.data;
  const supplier = (await supplierAccount(c)).body.data;
  const owed = d.total - 510; // collected − (supplier price 450 + shipping 60)
  assert.equal(seller.balance - before, owed, "the line adds what the supplier owes the seller");
  assert.equal(supplier.balance, -seller.balance, "the other side sees the same number, opposite sign");
  const line = seller.lines.find((l) => l.orderNumber === d.orderNumber);
  assert.equal(line.counts, true);
  assert.equal(line.forYou, owed);
  assert.match(seller.words, /owes you|You owe|All settled/);
});

test("a payment moves both balances; the other side is told", async (t) => {
  const c = await dropshipFixture(t);
  if (!c) return;
  const before = (await sellerAccount(c)).body.data.balance;
  // The supplier: "I paid Seller 100".
  const rec = await c.B.req("POST", `${c.Sup}/sellers/${c.linkId}/payments`, { json: { paid: "me", amount: 100, paidOn: today(), reference: "UPI-QA", note: "QA" } });
  assert.equal(rec.status, 200, JSON.stringify(rec.body));
  const seller = (await sellerAccount(c)).body.data;
  assert.equal(seller.balance, before - 100);
  assert.equal(seller.payments[0].amount, 100);
  assert.match(seller.payments[0].text, /paid you/);
  assert.equal(seller.payments[0].canDelete, false, "the seller can't delete the supplier's entry");
});

test("only the recorder can delete a payment; the balance returns", async (t) => {
  const c = await dropshipFixture(t);
  if (!c) return;
  const seller = (await sellerAccount(c)).body.data;
  const mine = seller.payments.find((p) => p.amount === 100);
  assert.ok(mine, "the previous test's payment");
  const wrong = await c.A.req("DELETE", `${c.S}/suppliers/${c.linkId}/payments/${mine.id}`);
  assert.equal(wrong.status, 403, JSON.stringify(wrong.body));
  const before = seller.balance;
  const right = await c.B.req("DELETE", `${c.Sup}/sellers/${c.linkId}/payments/${mine.id}`);
  assert.equal(right.status, 200, JSON.stringify(right.body));
  assert.equal((await sellerAccount(c)).body.data.balance, before + 100);
  assert.equal((await c.B.req("DELETE", `${c.Sup}/sellers/${c.linkId}/payments/${mine.id}`)).status, 404, "already removed");
});

test("a payment must be positive, dated no later than today, and say who paid", async (t) => {
  const c = await dropshipFixture(t);
  if (!c) return;
  const post = (json) => c.A.req("POST", `${c.S}/suppliers/${c.linkId}/payments`, { json });
  assert.equal((await post({ paid: "me", amount: 0, paidOn: today() })).status, 400);
  assert.equal((await post({ paid: "me", amount: 50, paidOn: "2099-01-01" })).status, 400);
  assert.equal((await post({ paid: "nobody", amount: 50, paidOn: today() })).status, 422);
});

test("access: nobody else reads or records into this account", async (t) => {
  const c = await dropshipFixture(t);
  if (!c) return;
  // The supplier is not a seller of this link, and the seller is not its supplier.
  assert.ok([403, 404].includes((await c.B.req("GET", `${D}/stores/${c.fx.store.id}/suppliers/${c.linkId}/account`)).status));
  assert.ok([403, 404].includes((await c.A.req("GET", `${D}/stores/${c.supStoreId}/sellers/${c.linkId}/account`)).status));
  assert.equal((await c.A.req("GET", `${c.S}/suppliers/not-a-link/account`)).status, 404);
});
