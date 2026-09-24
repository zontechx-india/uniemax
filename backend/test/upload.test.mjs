// Uploads are checked by their bytes, not the client-declared mimetype.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PNG_1PX, fileForm } from "./helpers.mjs";
import { sellerFixture } from "./fixture.mjs";

async function upload(fx, bytes, filename, type) {
  const r = await fx.seller.req("POST", `/api/v1/stores/${fx.store.id}/products/${fx.productId}/media`, {
    form: fileForm({}, bytes, filename, type),
  });
  return r;
}

async function removeNewest(fx) {
  const p = (await fx.seller.req("GET", `/api/v1/stores/${fx.store.id}/products`)).body.data.find(
    (x) => x.id === fx.productId,
  );
  const last = p.media.at(-1);
  await fx.seller.req("DELETE", `/api/v1/stores/${fx.store.id}/products/${fx.productId}/media/${last.id}`);
  return last;
}

test("HTML declared as image/png is refused", async () => {
  const fx = await sellerFixture();
  const r = await upload(fx, Buffer.from("<html><script>alert(1)</script></html>"), "x.png", "image/png");
  assert.equal(r.status, 400);
});

test("SVG declared as image/png is refused", async () => {
  const fx = await sellerFixture();
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>';
  const r = await upload(fx, Buffer.from(svg), "x.png", "image/png");
  assert.equal(r.status, 400);
});

test("a real PNG is accepted", async () => {
  const fx = await sellerFixture();
  const r = await upload(fx, PNG_1PX, "ok.png", "image/png");
  assert.equal(r.status, 201, JSON.stringify(r.body));
  await removeNewest(fx);
});

test("a JPEG mislabelled as PNG is stored as JPEG", async () => {
  const fx = await sellerFixture();
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
  const r = await upload(fx, jpeg, "photo.png", "image/png");
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const media = await removeNewest(fx);
  assert.match(media.url, /\.jpe?g($|\?)/);
});
