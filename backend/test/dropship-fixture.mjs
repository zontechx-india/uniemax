// Shared setup for the dropshipping API suites: seller A (a published shop), supplier B (a
// supplier store linked to A with one offered product), A's supplier-product copy of it, and
// B also acting as the customer who buys from A. Needs DROPSHIP_ENABLED=true on the server.
import assert from "node:assert/strict";
import { Client, PNG_1PX, fileForm, need, uniq, webLogin } from "./helpers.mjs";
import { sellerFixture } from "./fixture.mjs";

export const D = "/api/v1/dropship";
export const BUYER = {
  name: "QA Buyer", phone: "9876500123", email: "qa-buyer@example.test",
  address: "5 Lake View", pincode: "682001", state: "Kerala", country: "India",
};
const ADDRESS = { line1: "QA street, do not ship", city: "Kochi", state: "Kerala", pincode: "682001" };

let ctx;

/** The linked seller + supplier with one copy in the seller's shop; skips the test when the flag is off. */
export async function dropshipFixture(t) {
  if (ctx !== undefined) {
    if (ctx === null) t.skip("not available on this server");
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
    json: { name: "QA Supplier", email: need("QA_EMAIL_B"), codAllowed: true, returnFeePayer: "SELLER" },
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
  const linkId = (await A.req("GET", `${S}/suppliers`)).body.data.suppliers.find((s) => s.store?.id === supStoreId).linkId;

  ctx = { fx, A, B, S, Sup, P, supStoreId, productId, variantId, copyId, linkId, slug: fx.slug };
  return ctx;
}
