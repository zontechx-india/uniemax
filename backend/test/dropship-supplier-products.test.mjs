// Dropshipping Phase 3: seller A adds supplier B's product to its store; the
// supplier's price and offer changes reach the copy; the copy's locked fields
// and Duplicate are refused. Needs DROPSHIP_ENABLED=true on the server under
// test; skipped otherwise. C-* refer to docs/dropshipping/supplier-products.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client, PNG_1PX, fileForm, need, uniq, webLogin } from "./helpers.mjs";
import { sellerFixture } from "./fixture.mjs";

const D = "/api/v1/dropship";
const ADDRESS = { line1: "QA street, do not ship", city: "Kochi", state: "Kerala", pincode: "682001" };

let ctx;
/** A, a supplier store for B linked to A, and one offered product with a photo. */
async function setup(t) {
  if (ctx !== undefined) {
    if (ctx === null) t.skip("DROPSHIP_ENABLED is off on this server");
    return ctx;
  }
  if ((await new Client().req("GET", `${D}/status`)).status !== 200) {
    ctx = null;
    t.skip("DROPSHIP_ENABLED is off on this server");
    return null;
  }
  const fx = await sellerFixture();
  const A = fx.seller;
  const B = await webLogin(need("QA_EMAIL_B"), need("QA_PASSWORD_B"));
  const S = `${D}/stores/${fx.store.id}`;

  const inv = await A.req("POST", `${S}/supplier-invites`, {
    json: { name: "QA Supplier", email: `${uniq("qa-sup")}@example.test`, codAllowed: true, returnFeePayer: "SELLER" },
  });
  assert.equal(inv.status, 201, JSON.stringify(inv.body));
  const join = await B.req("POST", `${D}/invites/${inv.body.data.inviteUrl.split("/").pop()}/accept`, {
    json: { newStore: { name: uniq("QA Supply"), phone: "9876543210", address: ADDRESS }, shippingFee: 60, shipWithinDays: 2, returnDays: 0 },
  });
  assert.equal(join.status, 200, JSON.stringify(join.body));
  const supStoreId = join.body.data.storeId;
  const P = `/api/v1/stores/${supStoreId}`;

  const tax = (await B.req("GET", "/api/v1/categories/search?q=saree")).body.data[0]
    ?? (await B.req("GET", "/api/v1/categories/search?q=backpack")).body.data[0];
  const shelf = await B.req("POST", `${P}/categories`, { json: { categoryId: tax.id } });
  assert.equal(shelf.status, 201, JSON.stringify(shelf.body));
  const prod = await B.req("POST", `${P}/products`, { json: { name: uniq("QA Saree"), categoryId: shelf.body.data.id, price: 999, stockQuantity: 5 } });
  assert.equal(prod.status, 201, JSON.stringify(prod.body));
  const productId = prod.body.data.id;
  assert.equal((await B.req("POST", `${P}/products/${productId}/media`, { form: fileForm({}, PNG_1PX) })).status, 201);
  const act = await B.req("PATCH", `${P}/products/${productId}`, { json: { isActive: true } });
  assert.equal(act.status, 200, JSON.stringify(act.body));
  const variantId = act.body.data.defaultVariant.id;
  const Sup = `${D}/stores/${supStoreId}`;
  const offer = (cost) =>
    B.req("PUT", `${Sup}/supply/${productId}`, { json: { isOpen: true, variants: [{ variantId, cost, isOpen: true }] } });
  assert.equal((await offer(450)).status, 200);

  ctx = { A, B, S, Sup, fx, supStoreId, productId, variantId, offer };
  return ctx;
}

async function added(t) {
  const c = await setup(t);
  if (!c) return null;
  if (c.copyId) return c;
  const cat = await c.A.req("GET", `${c.S}/catalog`);
  assert.equal(cat.status, 200);
  const item = cat.body.data.items.find((i) => i.name.startsWith("QA Saree") && i.inStoreProductId === null);
  assert.ok(item, "the offered product is in the catalogue");
  const r = await c.A.req("POST", `${c.S}/resales`, {
    json: { items: [{ supplyProductId: item.supplyProductId }], shelf: { newShelf: true }, followCost: true },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  c.supplyProductId = item.supplyProductId;
  c.copyId = r.body.data[0].productId;
  c.resaleId = (await c.A.req("GET", `${c.S}/resales?productId=${c.copyId}`)).body.data[0].id;
  return c;
}

const copyOf = async (c) =>
  (await c.A.req("GET", `/api/v1/stores/${c.fx.store.id}/products`)).body.data.find((p) => p.id === c.copyId);

test("the catalogue shows You earn; adding makes a live copy with no SKU", async (t) => {
  const c = await added(t);
  if (!c) return;
  const copy = await copyOf(c);
  assert.equal(copy.isActive, true);
  assert.equal(copy.codAvailable, true);
  assert.ok(copy.variants.every((v) => !v.sku), "C-16");
});

test("C-10 adding the same product twice is refused", async (t) => {
  const c = await added(t);
  if (!c) return;
  const r = await c.A.req("POST", `${c.S}/resales`, {
    json: { items: [{ supplyProductId: c.supplyProductId }], shelf: { newShelf: true }, followCost: true },
  });
  assert.equal(r.status, 409);
});

test("C-1 / C-21 the supplier's price change moves the copy's price once", async (t) => {
  const c = await added(t);
  if (!c) return;
  const before = Number((await copyOf(c)).variants[0].price);
  await c.offer(520);
  const after = Number((await copyOf(c)).variants[0].price);
  assert.equal(after, before + 70);
  await c.offer(520);
  assert.equal(Number((await copyOf(c)).variants[0].price), after);
});

test("C-4 / C-17 a copy's locked fields and Duplicate are refused", async (t) => {
  const c = await added(t);
  if (!c) return;
  const P = `/api/v1/stores/${c.fx.store.id}/products/${c.copyId}`;
  const copy = await copyOf(c);
  assert.equal((await c.A.req("PATCH", `${P}/variants/${copy.variants[0].id}`, { json: { stockQuantity: 99 } })).status, 400);
  assert.equal((await c.A.req("PATCH", P, { json: { codAvailable: false } })).status, 400);
  assert.equal((await c.A.req("POST", `${P}/copy`, { json: {} })).status, 409);
});

test("SU-7 pausing the supplier pauses the copy; resuming brings it back", async (t) => {
  const c = await added(t);
  if (!c) return;
  const { suppliers } = (await c.A.req("GET", `${c.S}/suppliers`)).body.data;
  const linkId = suppliers.find((s) => s.store?.id === c.supStoreId).linkId;
  await c.A.req("PATCH", `${c.S}/suppliers/${linkId}`, { json: { status: "PAUSED" } });
  assert.equal((await copyOf(c)).isActive, false);
  const r = (await c.A.req("GET", `${c.S}/resales?productId=${c.copyId}`)).body.data[0];
  assert.equal(r.pauseReason, "LINK_INACTIVE");
  await c.A.req("PATCH", `${c.S}/suppliers/${linkId}`, { json: { status: "ACTIVE" } });
  assert.equal((await copyOf(c)).isActive, true);
});

test("C-14 remove switches the copy off and detaches it", async (t) => {
  const c = await added(t);
  if (!c) return;
  assert.equal((await c.A.req("DELETE", `${c.S}/resales/${c.resaleId}`)).status, 200);
  assert.equal((await copyOf(c)).isActive, false);
  assert.deepEqual((await c.A.req("GET", `${c.S}/resales?productId=${c.copyId}`)).body.data, []);
});
