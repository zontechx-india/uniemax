// Storefront homepage sections — the retired "Welcome Hero" can neither be
// read back from old rows nor written again. Pure logic: `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HOMEPAGE_SECTION_KEYS,
  HOMEPAGE_SECTION_LAYOUTS,
  resolveHomepage,
  resolveSectionSettings,
  storeHomepageSchema,
} from "../../src/modules/stores/stores.schema.js";

test("hero is not a homepage section any more", () => {
  assert.ok(!(HOMEPAGE_SECTION_KEYS as readonly string[]).includes("hero"));
  assert.ok(!("hero" in HOMEPAGE_SECTION_LAYOUTS));
});

test("a saved hero entry is dropped; the rest keep their order and settings", () => {
  const sections = resolveHomepage({
    sections: [
      { key: "catalog", enabled: true, settings: { layout: "rail" } },
      { key: "hero", enabled: true, settings: { title: "Hi", ctaLabel: "Go" } },
      { key: "banners", enabled: false },
    ],
  });

  assert.ok(!sections.some((s) => (s.key as string) === "hero"));
  const keys = sections.map((s) => s.key);
  // The owner put All Products above Banners; that survives.
  assert.ok(keys.indexOf("catalog") < keys.indexOf("banners"));
  const catalog = sections.find((s) => s.key === "catalog")!;
  assert.deepEqual(catalog.settings, { layout: "rail" });
  assert.equal(sections.find((s) => s.key === "banners")?.enabled, false);
  assert.equal(sections.length, HOMEPAGE_SECTION_KEYS.length);
});

test("the legacy boolean map ignores a hero flag", () => {
  const sections = resolveHomepage({ hero: false, featured: false });
  assert.ok(!sections.some((s) => (s.key as string) === "hero"));
  assert.equal(sections.find((s) => s.key === "featured")?.enabled, false);
});

test("a button label is no longer kept on any section", () => {
  assert.equal(resolveSectionSettings("catalog", { ctaLabel: "Shop now" }), undefined);
});

test("writes naming hero are rejected", () => {
  const valid = HOMEPAGE_SECTION_KEYS.map((key) => ({ key, enabled: true }));
  assert.equal(storeHomepageSchema.safeParse({ sections: valid }).success, true);

  const withHero = [...valid.slice(1), { key: "hero", enabled: true }];
  assert.equal(storeHomepageSchema.safeParse({ sections: withHero }).success, false);
});
