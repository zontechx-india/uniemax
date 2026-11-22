// Unit tests for the order-number format (modules/orders/orders.service.ts).
// No server, no database: `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newOrderNumber } from "../../src/modules/orders/orders.service.js";

test("an order number is exactly 8 digits with no leading zero", () => {
  for (let i = 0; i < 2000; i += 1) {
    assert.match(newOrderNumber(), /^[1-9]\d{7}$/);
  }
});

test("order numbers are random, not a sequence", () => {
  const seen = new Set(Array.from({ length: 200 }, () => newOrderNumber()));
  // 200 draws from 90 million: a repeat is near-impossible; a sequence would
  // show up as consecutive values.
  assert.ok(seen.size >= 199);
  const sorted = [...seen].map(Number).sort((a, b) => a - b);
  const consecutive = sorted.filter((n, i) => i > 0 && n - sorted[i - 1]! === 1).length;
  assert.ok(consecutive < 5);
});
