// Variant photo lists on the options PUT (`variants[].mediaIds`): any photo,
// any colour, in order. Pure schema checks, no server: `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { storeProductOptionsSchema } from "../../src/modules/stores/storeCatalog.schema.js";

const variant = (colour: string, extra: Record<string, unknown> = {}) => ({
  optionValues: { Colour: colour },
  price: 499,
  stockQuantity: 2,
  isActive: true,
  ...extra,
});
const body = (variants: unknown[]) => ({
  optionTypes: [{ name: "Colour", values: ["Pink", "Blue", "Green"] }],
  variants,
});

test("one photo can show several colours (reuse)", () => {
  const parsed = storeProductOptionsSchema.parse(
    body([
      variant("Pink", { mediaIds: ["m1", "m2"] }),
      variant("Blue", { mediaIds: ["m3"] }),
      variant("Green", { mediaIds: ["m1"] }),
    ]),
  );
  assert.deepEqual(parsed.variants[2]!.mediaIds, ["m1"]);
});

test("the list keeps its order (first = main photo)", () => {
  const parsed = storeProductOptionsSchema.parse(body([variant("Pink", { mediaIds: ["b", "a", "c"] })]));
  assert.deepEqual(parsed.variants[0]!.mediaIds, ["b", "a", "c"]);
});

test("a photo listed twice in one variant is refused", () => {
  const r = storeProductOptionsSchema.safeParse(body([variant("Pink", { mediaIds: ["m1", "m1"] })]));
  assert.equal(r.success, false);
});

test("at most 10 photos per variant", () => {
  const ids = Array.from({ length: 11 }, (_, i) => `m${i}`);
  const r = storeProductOptionsSchema.safeParse(body([variant("Pink", { mediaIds: ids })]));
  assert.equal(r.success, false);
});

test("the old single mediaId and no photos at all are still accepted", () => {
  const parsed = storeProductOptionsSchema.parse(body([variant("Pink", { mediaId: "m1" }), variant("Blue")]));
  assert.equal(parsed.variants[0]!.mediaId, "m1");
  assert.equal(parsed.variants[1]!.mediaIds, undefined);
});
