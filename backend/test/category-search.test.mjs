// The seller's category picker understands everyday words: a saree seller
// searching "saree" (or साड़ी / சேலை / സാരി) lands on Fashion > Women instead
// of "No category matches".
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "./helpers.mjs";

async function search(q) {
  const r = await new Client().req("GET", `/api/v1/categories/search?q=${encodeURIComponent(q)}`, { anonymous: true });
  assert.equal(r.status, 200);
  return r.body.data.map((c) => c.slug);
}

test("everyday words find their category", async () => {
  for (const q of ["saree", "Sarees", "sare", "साड़ी", "சேலை", "സാരി", "kurti"]) {
    assert.ok((await search(q)).includes("fashion-women"), q);
  }
  assert.ok((await search("kurta")).includes("fashion-men"));
});

test("real category names still win over everyday words", async () => {
  const slugs = await search("backpack");
  assert.ok(slugs.some((s) => s.includes("backpacks")));
});

test("gibberish still finds nothing", async () => {
  assert.deepEqual(await search("zzqxw"), []);
});
