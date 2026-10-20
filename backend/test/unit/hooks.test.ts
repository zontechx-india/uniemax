// Core hooks — the seam packages plug into (package/events/hooks.ts). Pure
// logic, no server, no database: `npm run test:unit`.
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  checkoutRestrictions,
  hook,
  resetHooksForTests,
  runHooks,
} from "../../src/package/events/hooks.js";
import { HttpError } from "../../src/utils/httpError.js";
import type { Prisma } from "../../src/generated/prisma/client.js";

const tx = {} as Prisma.TransactionClient;

afterEach(() => resetHooksForTests());

test("with nothing registered, every hook is a no-op", async () => {
  await runHooks("order.placing", tx, "ord_1");
  await runHooks("product.saving", "prd_1", { kind: "update", input: {} });
  assert.deepEqual(await checkoutRestrictions("st_1", []), { cod: null, pickup: null });
});

test("hooks run in registration order, each awaited before the next", async () => {
  const calls: string[] = [];
  hook("order.placing", async (_tx, orderId) => {
    await new Promise((r) => setTimeout(r, 5));
    calls.push(`first:${orderId}`);
  });
  hook("order.placing", async (_tx, orderId) => {
    calls.push(`second:${orderId}`);
  });
  await runHooks("order.placing", tx, "ord_1");
  assert.deepEqual(calls, ["first:ord_1", "second:ord_1"]);
});

test("a veto stops the rest and reaches the caller", async () => {
  let reachedSecond = false;
  hook("order.cancelling", async () => {
    throw HttpError.conflict("A supplier parcel is on its way");
  });
  hook("order.cancelling", async () => {
    reachedSecond = true;
  });
  await assert.rejects(runHooks("order.cancelling", tx, "ord_1"), /supplier parcel/);
  assert.equal(reachedSecond, false);
});

test("hooks of one name never see another name's calls", async () => {
  let saw = false;
  hook("order.unplacing", async () => {
    saw = true;
  });
  await runHooks("order.placing", tx, "ord_1");
  assert.equal(saw, false);
});

test("checkout restrictions merge — the first reason for each option wins", async () => {
  hook("checkout.options", async () => ({ cod: "No cash on delivery for Saree (Red)" }));
  hook("checkout.options", async () => ({
    cod: "a later reason",
    pickup: "Home delivery only — some items ship from a supplier",
  }));
  assert.deepEqual(await checkoutRestrictions("st_1", []), {
    cod: "No cash on delivery for Saree (Red)",
    pickup: "Home delivery only — some items ship from a supplier",
  });
});

test("checkout hooks receive the store and the cart lines", async () => {
  let seen: unknown = null;
  hook("checkout.options", async (storeId, lines) => {
    seen = { storeId, lines };
    return {};
  });
  const lines = [{ productId: "p1", variantId: null, quantity: 2 }];
  await checkoutRestrictions("st_9", lines);
  assert.deepEqual(seen, { storeId: "st_9", lines });
});

test("resetHooksForTests forgets every registration", async () => {
  hook("checkout.options", async () => ({ cod: "x" }));
  resetHooksForTests();
  assert.deepEqual(await checkoutRestrictions("st_1", []), { cod: null, pickup: null });
});
