// Dropshipping Phase 2: a seller (A) invites a supplier (B), who joins with a
// new supply-only store, offers products with prices for sellers, and both
// sides change terms, pause and end. Needs DROPSHIP_ENABLED=true on the server
// under test; skipped otherwise. SU-* / T-* refer to docs/dropshipping/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client, need, uniq, webLogin } from "./helpers.mjs";
import { sellerFixture } from "./fixture.mjs";

const D = "/api/v1/dropship";
const ADDRESS = { line1: "QA street, do not ship", city: "Kochi", state: "Kerala", pincode: "682001" };
const tokenOf = (url) => url.split("/").pop();

let ctx;
async function setup(t) {
  if (ctx !== undefined) return ctx;
  const status = await new Client().req("GET", `${D}/status`);
  if (status.status !== 200) {
    ctx = null;
    return null;
  }
  const fx = await sellerFixture();
  const B = await webLogin(need("QA_EMAIL_B"), need("QA_PASSWORD_B"));
  ctx = { fx, A: fx.seller, B, S: `${D}/stores/${fx.store.id}` };
  return ctx;
}

async function invite(c, extra = {}) {
  return c.A.req("POST", `${c.S}/supplier-invites`, {
    json: { name: "QA Supplier", email: `${uniq("qa-sup")}@example.test`, codAllowed: true, returnFeePayer: "SELLER", ...extra },
  });
}

async function joined(t) {
  const c = await setup(t);
  if (!c) return t.skip("DROPSHIP_ENABLED is off on this server");
  if (c.joined) return c;
  const r = await invite(c);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const acc = await c.B.req("POST", `${D}/invites/${tokenOf(r.body.data.inviteUrl)}/accept`, {
    json: {
      newStore: { name: uniq("QA Supply"), phone: "9876543210", address: ADDRESS },
      shippingFee: 60,
      shipWithinDays: 2,
      returnDays: 7,
    },
  });
  assert.equal(acc.status, 200, JSON.stringify(acc.body));
  c.joined = { token: tokenOf(r.body.data.inviteUrl), ...acc.body.data };
  c.Sup = `${D}/stores/${acc.body.data.storeId}`;
  return c;
}

test("both term answers are required; no default (D-5, D-17)", async (t) => {
  const c = await setup(t);
  if (!c) return t.skip("DROPSHIP_ENABLED is off on this server");
  const r = await c.A.req("POST", `${c.S}/supplier-invites`, { json: { name: "X", email: "x@example.test" } });
  assert.equal(r.status, 422);
  const r2 = await c.A.req("POST", `${c.S}/supplier-invites`, { json: { name: "X", codAllowed: true, returnFeePayer: "SELLER" } });
  assert.equal(r2.status, 422, "phone or email required");
});

test("SU-10: another customer can't read this store's suppliers", async (t) => {
  const c = await setup(t);
  if (!c) return t.skip("DROPSHIP_ENABLED is off on this server");
  assert.equal((await c.B.req("GET", `${c.S}/suppliers`)).status, 404);
});

test("join with a new supply-only store; the token works once (SU-13)", async (t) => {
  const c = await joined(t);
  if (!c) return;
  assert.equal(c.joined.supplyOnly, true);
  const again = await c.B.req("POST", `${D}/invites/${c.joined.token}/accept`, { json: { storeId: c.joined.storeId } });
  assert.equal(again.status, 200);
  assert.equal(again.body.data.alreadyJoined, true);
  const other = await c.A.req("POST", `${D}/invites/${c.joined.token}/accept`, { json: { storeId: c.fx.store.id } });
  assert.equal(other.status, 409);
  const preview = await new Client().req("GET", `${D}/invites/${c.joined.token}`);
  assert.equal(preview.body.data.status, "ACCEPTED");
});

test("SU-9: a store that doesn't supply gets 403 on supplier routes", async (t) => {
  const c = await joined(t);
  if (!c) return;
  assert.equal((await c.A.req("GET", `${c.S}/supply`)).status, 403);
  assert.equal((await c.A.req("GET", `${c.Sup}/supply`)).status, 404);
});

test("T-7 / T-11: term changes are logged and both sides see the log", async (t) => {
  const c = await joined(t);
  if (!c) return;
  const { suppliers } = (await c.A.req("GET", `${c.S}/suppliers`)).body.data;
  const linkId = suppliers.find((s) => s.store?.id === c.joined.storeId).linkId;
  c.linkId = linkId;
  assert.equal((await c.A.req("PATCH", `${c.S}/suppliers/${linkId}`, { json: { codAllowed: false } })).status, 200);
  assert.equal((await c.B.req("PATCH", `${c.Sup}/supplier`, { json: { shippingFee: 0 } })).status, 200);
  const seller = (await c.A.req("GET", `${c.S}/suppliers/${linkId}/terms`)).body.data;
  const supplier = (await c.B.req("GET", `${c.Sup}/sellers/${linkId}/terms`)).body.data;
  assert.deepEqual(seller.log.map((l) => l.id), supplier.log.map((l) => l.id));
  assert.equal(seller.current.codAllowed, false);
  assert.equal(seller.current.shippingFee, 0);
  assert.equal(seller.log[0].field, "shippingFee");
  assert.ok(seller.log.some((l) => l.field === "codAllowed" && l.toValue === "false"));
});

test("SU-14: inviting a supplier you already have is refused", async (t) => {
  const c = await joined(t);
  if (!c) return;
  const r = await invite(c, { email: undefined, phone: "9876543210" });
  assert.equal(r.status, 409);
});

test("D-27 / SU-1: resend makes a new link, revoke kills it", async (t) => {
  const c = await setup(t);
  if (!c) return t.skip("DROPSHIP_ENABLED is off on this server");
  const r = await invite(c);
  const id = r.body.data.invite.id;
  const resent = await c.A.req("POST", `${c.S}/supplier-invites/${id}/resend`);
  assert.equal(resent.status, 200);
  const anon = new Client();
  assert.equal((await anon.req("GET", `${D}/invites/${tokenOf(r.body.data.inviteUrl)}`)).status, 404);
  assert.equal((await anon.req("GET", `${D}/invites/${tokenOf(resent.body.data.inviteUrl)}`)).status, 200);
  assert.equal((await c.A.req("POST", `${c.S}/supplier-invites/${id}/revoke`)).status, 200);
  const preview = await anon.req("GET", `${D}/invites/${tokenOf(resent.body.data.inviteUrl)}`);
  assert.equal(preview.body.data.status, "REVOKED");
});

test("D-19: the supplier pauses; ENDED is for good", async (t) => {
  const c = await joined(t);
  if (!c) return;
  if (!c.linkId) {
    const { suppliers } = (await c.A.req("GET", `${c.S}/suppliers`)).body.data;
    c.linkId = suppliers.find((s) => s.store?.id === c.joined.storeId).linkId;
  }
  assert.equal((await c.B.req("PATCH", `${c.Sup}/sellers/${c.linkId}`, { json: { status: "PAUSED" } })).status, 200);
  const row = (await c.A.req("GET", `${c.S}/suppliers`)).body.data.suppliers.find((s) => s.linkId === c.linkId);
  assert.equal(row.status, "PAUSED");
  assert.equal(row.statusBy, "SUPPLIER");
  assert.equal((await c.A.req("PATCH", `${c.S}/suppliers/${c.linkId}`, { json: { status: "ENDED" } })).status, 200);
  assert.equal((await c.B.req("PATCH", `${c.Sup}/sellers/${c.linkId}`, { json: { status: "ACTIVE" } })).status, 409);
});
