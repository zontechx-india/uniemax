// Dropshipping Phase 4: a customer orders a supplier product from seller A's
// shop (cash on delivery); the supplier B sees it, ships it with tracking, the
// customer's order follows; can't-ship and a buyer's cancel end cleanly. Needs
// DROPSHIP_ENABLED=true on the server under test; skipped otherwise.
// K-* and F-* refer to docs/dropshipping/orders.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client, PNG_1PX, fileForm, need, uniq, webLogin } from "./helpers.mjs";
import { sellerFixture } from "./fixture.mjs";

const D = "/api/v1/dropship";
const ADDRESS = { line1: "QA street, do not ship", city: "Kochi", state: "Kerala", pincode: "682001" };
const BUYER = { name: "QA Buyer", phone: "9876500123", email: "qa-buyer@example.test", address: "5 Lake View", pincode: "682001", state: "Kerala", country: "India" };

let ctx;
/** A (seller), B (supplier and buyer), a linked supplier store with one offered product, and A's copy of it. */
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
  if (!fx.published) {
    ctx = null;
    t.skip(`test store not publishable: ${fx.publishError}`);
    return null;
  }
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
  const Sup = `${D}/stores/${supStoreId}`;

  const tax = (await B.req("GET", "/api/v1/categories/search?q=saree")).body.data[0]
    ?? (await B.req("GET", "/api/v1/categories/search?q=backpack")).body.data[0];
  const shelf = await B.req("POST", `${P}/categories`, { json: { categoryId: tax.id } });
  assert.equal(shelf.status, 201, JSON.stringify(shelf.body));
  const prod = await B.req("POST", `${P}/products`, { json: { name: uniq("QA Saree"), categoryId: shelf.body.data.id, price: 999, stockQuantity: 20 } });
  assert.equal(prod.status, 201, JSON.stringify(prod.body));
  const productId = prod.body.data.id;
  assert.equal((await B.req("POST", `${P}/products/${productId}/media`, { form: fileForm({}, PNG_1PX) })).status, 201);
  const act = await B.req("PATCH", `${P}/products/${productId}`, { json: { isActive: true } });
  assert.equal(act.status, 200, JSON.stringify(act.body));
  const variantId = act.body.data.defaultVariant.id;
  const offered = await B.req("PUT", `${Sup}/supply/${productId}`, { json: { isOpen: true, variants: [{ variantId, cost: 450, isOpen: true }] } });
  assert.equal(offered.status, 200, JSON.stringify(offered.body));

  const cat = await A.req("GET", `${S}/catalog`);
  const item = cat.body.data.items.find((i) => i.name.startsWith("QA Saree") && i.inStoreProductId === null);
  assert.ok(item, "the offered product is in the catalogue");
  const added = await A.req("POST", `${S}/resales`, {
    json: { items: [{ supplyProductId: item.supplyProductId }], shelf: { newShelf: true }, followCost: true },
  });
  assert.equal(added.status, 201, JSON.stringify(added.body));
  const copyId = added.body.data[0].productId;

  ctx = { fx, A, B, S, Sup, P, supStoreId, productId, variantId, copyId, slug: fx.slug };
  return ctx;
}

const pub = (c, p) => `/api/v1/public/stores/${c.slug}${p}`;
const copyLine = (c, quantity = 1) => ({ productId: c.copyId, variantId: null, quantity });
const placeCod = (c, items) =>
  c.B.req("POST", pub(c, "/orders"), { json: { fulfilment: "DELIVERY", paymentMethod: "COD", customer: BUYER, items } });
const supplierStock = async (c) =>
  (await c.B.req("GET", `/api/v1/stores/${c.supStoreId}/products`)).body.data.find((p) => p.id === c.productId).defaultVariant.stockQuantity;
const partOf = async (c, orderNumber) => {
  for (const tab of ["new", "shipped", "done"]) {
    const r = await c.B.req("GET", `${c.Sup}/supplier-orders?tab=${tab}`);
    const hit = r.body.data.items.find((i) => i.orderNumber === orderNumber);
    if (hit) return hit;
  }
  return null;
};
const sellerOrder = async (c, orderId) => (await c.A.req("GET", `/api/v1/stores/${c.fx.store.id}/orders/${orderId}`)).body.data;

test("K-5 the quote offers no pickup for a supplier product; COD stays available (one supplier)", async (t) => {
  const c = await setup(t);
  if (!c) return;
  const r = await c.B.req("POST", pub(c, "/orders/quote"), { json: { fulfilment: "DELIVERY", items: [copyLine(c)] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.data.restrictions.pickup, /Home delivery only/);
  assert.equal(r.body.data.restrictions.cod, null);
});

test("K-4 COD with a supplier item and the seller's own item is refused, with the reason", async (t) => {
  const c = await setup(t);
  if (!c) return;
  const items = [copyLine(c), { productId: c.fx.productId, variantId: null, quantity: 1 }];
  const q = await c.B.req("POST", pub(c, "/orders/quote"), { json: { fulfilment: "DELIVERY", items } });
  assert.match(q.body.data.restrictions.cod, /different places/);
  const r = await placeCod(c, items);
  assert.equal(r.status, 400, JSON.stringify(r.body));
  assert.match(r.body.message, /different places/);
});

test("a COD order reaches the supplier; shipping with tracking moves the customer's order; delivered completes it", async (t) => {
  const c = await setup(t);
  if (!c) return;
  const before = await supplierStock(c);
  const placed = await placeCod(c, [copyLine(c, 2)]);
  assert.equal(placed.status, 201, JSON.stringify(placed.body));
  const orderId = placed.body.data.id;
  assert.equal(await supplierStock(c), before - 2, "the supplier's stock is reserved");

  const card = await partOf(c, placed.body.data.orderNumber);
  assert.ok(card, "the supplier sees it under New");
  assert.equal(card.paymentMode, "COD");
  assert.equal(card.collectAmount, Number(placed.body.data.total));
  assert.ok(!JSON.stringify(card).includes("qa-buyer@example.test"), "no customer email (F-12)");

  const slips = await c.B.req("GET", `${c.Sup}/supplier-orders/slips?ids=${card.id}`);
  assert.equal(slips.status, 200, JSON.stringify(slips.body));
  assert.equal(slips.body.data[0].paymentMode, "COD");

  assert.equal((await c.B.req("POST", `${c.Sup}/supplier-orders/${card.id}/ship`, { json: { carrierCode: "delhivery", trackingNumber: "" } })).status, 422);
  assert.equal((await c.B.req("POST", `${c.Sup}/supplier-orders/${card.id}/ship`, { json: { carrierCode: "self", trackingNumber: "OWN12345" } })).status, 400);
  const ship = await c.B.req("POST", `${c.Sup}/supplier-orders/${card.id}/ship`, { json: { carrierCode: "delhivery", trackingNumber: "QA1234567" } });
  assert.equal(ship.status, 200, JSON.stringify(ship.body));
  assert.equal((await c.B.req("POST", `${c.Sup}/supplier-orders/${card.id}/ship`, { json: { carrierCode: "delhivery", trackingNumber: "QA7654321" } })).status, 409, "a second ship is refused");

  let order = await sellerOrder(c, orderId);
  assert.equal(order.status, "SHIPPED");
  assert.equal(order.shipments[0].trackingNumber, "QA1234567");
  assert.equal(order.shipments[0].senderName.startsWith("QA Supply"), true, "Shipped by the supplier");

  // The parcel is the supplier's: the seller can't edit it, deliver it or mark it returned through the core's own endpoints.
  const own = `/api/v1/stores/${c.fx.store.id}/orders/${orderId}/shipments/${order.shipments[0].id}`;
  assert.equal((await c.A.req("PATCH", own, { json: { carrierCode: "dtdc", trackingNumber: "ZZ99999" } })).status, 409);
  assert.equal((await c.A.req("POST", `${own}/delivered`)).status, 409);
  assert.equal((await c.A.req("POST", `${own}/returned`)).status, 409);
  assert.equal((await sellerOrder(c, orderId)).shipments[0].trackingNumber, "QA1234567", "the supplier's tracking is unchanged");

  const parts = await c.A.req("GET", `${c.S}/orders/${orderId}/parts`);
  assert.equal(parts.status, 200, JSON.stringify(parts.body));
  assert.equal(parts.body.data.parts[0].status, "SHIPPED");

  const done = await c.B.req("POST", `${c.Sup}/supplier-orders/${card.id}/delivered`);
  assert.equal(done.status, 200, JSON.stringify(done.body));
  order = await sellerOrder(c, orderId);
  assert.equal(order.status, "DELIVERED");
  assert.equal(order.paymentStatus, "PAID", "COD is marked paid on delivery");
});

test("F-3 can't ship: the stock goes back and a supplier-only order is cancelled automatically", async (t) => {
  const c = await setup(t);
  if (!c) return;
  const before = await supplierStock(c);
  const placed = await placeCod(c, [copyLine(c)]);
  assert.equal(placed.status, 201, JSON.stringify(placed.body));
  const card = await partOf(c, placed.body.data.orderNumber);
  assert.equal(await supplierStock(c), before - 1);
  const r = await c.B.req("POST", `${c.Sup}/supplier-orders/${card.id}/cant-ship`, { json: { reason: "OUT_OF_STOCK" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await new Promise((res) => setTimeout(res, 1000));
  assert.equal(await supplierStock(c), before);
  assert.equal((await sellerOrder(c, placed.body.data.id)).status, "CANCELLED");
  const again = await c.B.req("POST", `${c.Sup}/supplier-orders/${card.id}/ship`, { json: { carrierCode: "delhivery", trackingNumber: "QA1234567" } });
  assert.equal(again.status, 409);
});

test("F-15 / F-16 the buyer cancels before it ships: stock back, and the supplier can no longer ship it", async (t) => {
  const c = await setup(t);
  if (!c) return;
  const before = await supplierStock(c);
  const placed = await placeCod(c, [copyLine(c)]);
  assert.equal(placed.status, 201, JSON.stringify(placed.body));
  const card = await partOf(c, placed.body.data.orderNumber);
  const cancel = await c.B.req("POST", pub(c, `/orders/${placed.body.data.id}/cancel`), { json: { reason: "QA" } });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
  assert.equal(await supplierStock(c), before);
  const ship = await c.B.req("POST", `${c.Sup}/supplier-orders/${card.id}/ship`, { json: { carrierCode: "delhivery", trackingNumber: "QA1234567" } });
  assert.equal(ship.status, 409);
  assert.match(ship.body.message, /cancelled/);
});

test("access: the seller can't act as the supplier, and a stranger can't read the parts", async (t) => {
  const c = await setup(t);
  if (!c) return;
  assert.ok([403, 404].includes((await c.A.req("GET", `${D}/stores/${c.fx.store.id}/supplier-orders?tab=new`)).status));
  const stranger = new Client();
  assert.ok([401, 403].includes((await stranger.req("GET", `${c.S}/orders/x/parts`, { anonymous: true })).status));
});

test("a supplier account can't be published: it has no shop (D-28)", async (t) => {
  const c = await setup(t);
  if (!c) return;
  const r = await c.B.req("PATCH", `/api/v1/stores/${c.supStoreId}/publish`, { json: { isPublished: true } });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.match(r.body.message, /supplier account/);
  const store = (await c.B.req("GET", `/api/v1/stores/${c.supStoreId}`)).body.data;
  assert.equal(store.isPublished, false);
});

test("the supplier's role counts the new orders waiting to be shipped (the menu badge)", async (t) => {
  const c = await setup(t);
  if (!c) return;
  const before = (await c.B.req("GET", `${c.Sup}/role`)).body.data.ordersToShip;
  assert.equal(typeof before, "number");
  const placed = await placeCod(c, [copyLine(c)]);
  assert.equal(placed.status, 201, JSON.stringify(placed.body));
  assert.equal((await c.B.req("GET", `${c.Sup}/role`)).body.data.ordersToShip, before + 1);
  // a store that is not a supplier has nothing to ship
  assert.equal((await c.A.req("GET", `${c.S}/role`)).body.data.ordersToShip, 0);
});

test("seller and supplier are different: a supplier account can't use the seller side (D-49)", async (t) => {
  const c = await setup(t);
  if (!c) return;
  // The supplier account's own store id, on the seller routes: invite, supplier products, the suppliers list.
  assert.equal((await c.B.req("GET", `${c.Sup}/suppliers`)).status, 403);
  assert.equal((await c.B.req("GET", `${c.Sup}/catalog`)).status, 403);
  assert.equal((await c.B.req("POST", `${c.Sup}/supplier-invites`, { json: { name: "X", email: "x@example.test", codAllowed: true, returnFeePayer: "SELLER" } })).status, 403);
  // …but it can still ask what it is.
  assert.equal((await c.B.req("GET", `${c.Sup}/role`)).status, 200);
});

test("a shop that sells can't join as a supplier, and isn't offered on the join sheet (D-49)", async (t) => {
  const c = await setup(t);
  if (!c) return;
  const shop = await c.B.req("POST", "/api/v1/stores", { form: fileForm({ name: uniq("QA Shop") }, PNG_1PX, "logo.png") });
  assert.equal(shop.status, 201, JSON.stringify(shop.body));
  const inv = await c.A.req("POST", `${c.S}/supplier-invites`, {
    json: { name: "QA Second", email: `${uniq("qa-two")}@example.test`, codAllowed: true, returnFeePayer: "SELLER" },
  });
  assert.equal(inv.status, 201, JSON.stringify(inv.body));
  const token = inv.body.data.inviteUrl.split("/").pop();
  // The picker offers supplier accounts only.
  const offered = (await c.B.req("GET", `/api/v1/dropship/invites/${token}/stores`)).body.data.map((s) => s.id);
  assert.ok(offered.includes(c.supStoreId), "its supplier account is offered");
  assert.ok(!offered.includes(shop.body.data.id), "a shop that sells is not");
  // Joining with the shop is refused, and the invite stays usable.
  const refused = await c.B.req("POST", `/api/v1/dropship/invites/${token}/accept`, {
    json: { storeId: shop.body.data.id, shippingFee: 60, shipWithinDays: 2, returnDays: 0 },
  });
  assert.equal(refused.status, 400, JSON.stringify(refused.body));
  assert.match(refused.body.message, /can't also be a supplier/);
  const withAccount = await c.B.req("POST", `/api/v1/dropship/invites/${token}/accept`, { json: { storeId: c.supStoreId } });
  assert.equal(withAccount.status, 200, JSON.stringify(withAccount.body));
});
