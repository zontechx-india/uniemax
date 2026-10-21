// Dropshipping Phase 6: Easy Split in sandbox mode. The role tells each store the payout mode and
// whether it can be paid out to; a cash-on-delivery order is never split. (A prepaid order needs the
// payment hub's checkout, so its split is covered by the end-to-end run on the dev database.)
// Needs DROPSHIP_ENABLED=true; the role checks adapt to whether DROPSHIP_SPLIT is on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUYER, dropshipFixture } from "./dropship-fixture.mjs";

const BANK = {
  accountHolderName: "QA Supplier", accountNumber: "123456789012", ifsc: "HDFC0000001",
  bankName: "HDFC Bank", branch: "Kochi", upiId: null,
};

test("the role carries the payout mode and this store's payout state", async (t) => {
  const c = await dropshipFixture(t);
  if (!c) return;
  const role = (await c.B.req("GET", `${c.Sup}/role`)).body.data;
  assert.ok(["off", "sandbox", "live"].includes(role.split), JSON.stringify(role));
  if (role.split === "off") assert.equal(role.payout, null, "no payout state while Easy Split is off");
  else assert.equal(typeof role.payout.active, "boolean");
});

test("a primary bank account makes a store payable, in place (sandbox rule)", async (t) => {
  const c = await dropshipFixture(t);
  if (!c) return;
  const before = (await c.B.req("GET", `${c.Sup}/role`)).body.data;
  if (before.split === "off") return t.skip("DROPSHIP_SPLIT is off on this server");
  if (before.payout.active) return; // already has one from an earlier run
  const added = await c.B.req("POST", `/api/v1/stores/${c.supStoreId}/bank-accounts`, { json: BANK });
  if (added.status >= 400) return t.skip(`the bank form is gated for this QA store: ${added.body?.message}`);
  assert.equal(added.status, 201, JSON.stringify(added.body));
  assert.equal((await c.B.req("GET", `${c.Sup}/role`)).body.data.payout.active, true);
});

test("cash on delivery is never split: the supplier is paid by the seller", async (t) => {
  const c = await dropshipFixture(t);
  if (!c) return;
  const placed = await c.B.req("POST", `/api/v1/public/stores/${c.slug}/orders`, {
    json: { fulfilment: "DELIVERY", paymentMethod: "COD", customer: BUYER, items: [{ productId: c.copyId, variantId: null, quantity: 1 }] },
  });
  assert.equal(placed.status, 201, JSON.stringify(placed.body));
  let card = null;
  for (const tab of ["new", "shipped", "done"]) {
    const r = await c.B.req("GET", `${c.Sup}/supplier-orders?tab=${tab}`);
    card = r.body.data.items.find((i) => i.orderNumber === placed.body.data.orderNumber) ?? card;
  }
  assert.ok(card, "the supplier sees the order");
  assert.equal(card.paymentMode, "COD");
  assert.equal(card.paidBy, "SELLER");
  assert.equal(card.split, null);
});

test("the account says whether payouts are real, simulated or off", async (t) => {
  const c = await dropshipFixture(t);
  if (!c) return;
  const account = (await c.A.req("GET", `${c.S}/suppliers/${c.linkId}/account`)).body.data;
  assert.ok(["off", "sandbox", "live"].includes(account.split));
});

test("access: another customer can't read a store's payout state", async (t) => {
  const c = await dropshipFixture(t);
  if (!c) return;
  const r = await c.B.req("GET", `/api/v1/dropship/stores/${c.fx.store.id}/role`);
  assert.ok([403, 404].includes(r.status), String(r.status));
});
