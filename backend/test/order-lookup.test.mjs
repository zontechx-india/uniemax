// Order confirmation lookup must not hand a buyer's contact + delivery
// details to anyone holding the order id.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client, need, webLogin } from "./helpers.mjs";
import { sellerFixture } from "./fixture.mjs";

const CUSTOMER = {
  name: "Asha Test Buyer",
  phone: "9876543210",
  email: "asha.buyer@example.test",
  address: "12 QA Street, do not ship",
  pincode: "682001",
  state: "Kerala",
  country: "India",
};

async function placeOrder(buyer, fx) {
  const r = await buyer.req("POST", `/api/v1/public/stores/${fx.slug}/orders`, {
    json: {
      fulfilment: "DELIVERY",
      paymentMethod: "COD",
      customer: CUSTOMER,
      items: [{ productId: fx.productId, quantity: 1 }],
    },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.data;
}

test("order lookup: buyer sees details; anonymous and other accounts get a redacted view", async (t) => {
  const fx = await sellerFixture();
  if (!fx.published) return t.skip(`test store not publishable: ${fx.publishError}`);
  const buyer = await webLogin(need("QA_EMAIL_B"), need("QA_PASSWORD_B"));
  const order = await placeOrder(buyer, fx);
  const path = `/api/v1/public/stores/${fx.slug}/orders/${order.id}`;

  const own = await buyer.req("GET", path);
  assert.equal(own.status, 200);
  assert.equal(own.body.data.redacted, false);
  // Stored in canonical form (see phone.test.mjs).
  assert.equal(own.body.data.customerPhone, `+91${CUSTOMER.phone}`);
  assert.equal(own.body.data.addressLine, CUSTOMER.address);

  const anon = await new Client().req("GET", path, { anonymous: true });
  assert.equal(anon.status, 200);
  const a = anon.body.data;
  assert.equal(a.redacted, true);
  assert.equal(a.orderNumber, order.orderNumber);
  assert.equal(a.total, order.total);
  assert.equal(a.customerName, "Asha");
  for (const k of ["customerPhone", "customerEmail", "addressLine", "pincode", "billingAddress"]) {
    assert.equal(a[k], null, `${k} must be hidden`);
  }

  const other = await fx.seller.req("GET", path); // account A is not the buyer
  assert.equal(other.body.data.redacted, true);
  assert.equal(other.body.data.customerPhone, null);
});
