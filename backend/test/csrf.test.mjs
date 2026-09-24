// Customer-surface CSRF (double-submit) — cookie-authenticated mutations must
// echo the csrf_token cookie; safe methods and bearer clients are exempt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { VALID_ADDRESS, mobileLogin, need, webLogin } from "./helpers.mjs";

test("cookie session: mutation without X-CSRF-Token is 403", async () => {
  const c = await webLogin(need("QA_EMAIL_A"), need("QA_PASSWORD_A"));
  const r = await c.req("POST", "/api/v1/addresses", { json: VALID_ADDRESS, csrf: false });
  assert.equal(r.status, 403);
  assert.match(r.body.message, /CSRF/);
});

test("cookie session: mutation with a wrong X-CSRF-Token is 403", async () => {
  const c = await webLogin(need("QA_EMAIL_A"), need("QA_PASSWORD_A"));
  const r = await c.req("POST", "/api/v1/addresses", {
    json: VALID_ADDRESS,
    csrf: false,
    headers: { "X-CSRF-Token": "not-the-cookie" },
  });
  assert.equal(r.status, 403);
});

test("cookie session: mutation with the echoed token succeeds", async () => {
  const c = await webLogin(need("QA_EMAIL_A"), need("QA_PASSWORD_A"));
  const r = await c.req("POST", "/api/v1/addresses", { json: VALID_ADDRESS });
  assert.equal(r.status, 201);
  const del = await c.req("DELETE", `/api/v1/addresses/${r.body.data.id}`);
  assert.equal(del.status, 200);
});

test("cookie session: GET needs no token", async () => {
  const c = await webLogin(need("QA_EMAIL_A"), need("QA_PASSWORD_A"));
  const r = await c.req("GET", "/api/v1/addresses", { csrf: false });
  assert.equal(r.status, 200);
});

test("bearer client: mutation needs no CSRF token", async () => {
  const c = await mobileLogin(need("QA_EMAIL_A"), need("QA_PASSWORD_A"));
  const r = await c.req("PUT", "/api/v1/cart", { json: { lines: [] } });
  assert.equal(r.status, 200);
});
