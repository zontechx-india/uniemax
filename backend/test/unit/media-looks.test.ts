// Photos per look on the options PUT (`mediaLooks`): which photo shows which
// colour. Pure schema checks, no server, no database: `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { storeProductOptionsSchema } from "../../src/modules/stores/storeCatalog.schema.js";

const base = {
  optionTypes: [
    { name: "Colour", values: ["Pink", "Blue"] },
    { name: "Size", values: ["S"] },
  ],
  variants: [
    { optionValues: { Colour: "Pink", Size: "S" }, price: 499, stockQuantity: 2, isActive: true },
    { optionValues: { Colour: "Blue", Size: "S" }, price: 499, stockQuantity: 2, isActive: true },
  ],
};

test("mediaLooks is optional — leaving it out keeps photos as they are", () => {
  const parsed = storeProductOptionsSchema.parse(base);
  assert.equal(parsed.mediaLooks, undefined);
});

test("several photos may show one colour", () => {
  const parsed = storeProductOptionsSchema.parse({
    ...base,
    mediaLooks: [
      { mediaId: "m1", option: "Colour", value: "Pink" },
      { mediaId: "m2", option: "Colour", value: "Pink" },
      { mediaId: "m3", option: "Colour", value: "Blue" },
    ],
  });
  assert.equal(parsed.mediaLooks?.length, 3);
});

test("one photo cannot show two colours", () => {
  const r = storeProductOptionsSchema.safeParse({
    ...base,
    mediaLooks: [
      { mediaId: "m1", option: "Colour", value: "Pink" },
      { mediaId: "m1", option: "Colour", value: "Blue" },
    ],
  });
  assert.equal(r.success, false);
});

test("the option and value must be the product's own", () => {
  for (const look of [
    { mediaId: "m1", option: "Colour", value: "Green" },
    { mediaId: "m1", option: "Pattern", value: "Pink" },
  ]) {
    const r = storeProductOptionsSchema.safeParse({ ...base, mediaLooks: [look] });
    assert.equal(r.success, false, JSON.stringify(look));
  }
});
