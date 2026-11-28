// The public Policies pages' head is written twice: by the page shell
// (server) and by `useSeo` in the SPA (browser). This test keeps the two
// texts identical, and checks how `?version=N` is read. Pure logic:
// `npm run test:unit`. docs/policyhub/README.md §9, docs/SEO.md §5.
import { test } from "node:test";
import assert from "node:assert/strict";
import { POLICIES_HEAD, policyDescription } from "../../src/modules/seo/pageShell.service.js";
import { pageShellQuerySchema } from "../../src/modules/seo/pageShell.schema.js";
import {
  POLICIES_SEO,
  policyDescription as browserDescription,
} from "../../../frontend/src/storefront/pages/policies/policySeo.js";

test("/policies head is the same on both sides", () => {
  assert.deepEqual(POLICIES_HEAD.title, POLICIES_SEO.title);
  assert.equal(POLICIES_HEAD.description, POLICIES_SEO.description);
});

test("a policy's description is the same on both sides", () => {
  for (const [name, audience] of [
    ["Seller payout policy", "seller"],
    ["Return policy", "customer"],
    ["Supplier terms", "supplier"],
    ["Partner rules", "partner"], // an audience with no plural name
  ] as const) {
    assert.equal(policyDescription(name, audience), browserDescription(name, audience));
  }
  assert.match(policyDescription("Seller payout policy", "seller"), /^Seller payout policy for sellers on UnieMax/);
});

test("?version= is read like the SPA reads it", () => {
  const version = (value?: string) =>
    pageShellQuerySchema.parse({ version: value }).version;
  assert.equal(version(undefined), null);
  assert.equal(version("2"), 2);
  assert.equal(version("0"), null);
  assert.equal(version("-1"), null);
  assert.equal(version("1.5"), null);
  assert.equal(version("abc"), null);
});
