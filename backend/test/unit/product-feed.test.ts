// Product feed (Google Merchant Center / Meta catalogue) — the item must say
// what the product page shows when it opens. Pure logic: `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  landingVariant,
  renderProductFeed,
  toFeedItem,
  type FeedProductRow,
} from "../../src/modules/seo/productFeed.js";

const ORIGIN = "https://uniemax.com";

function row(overrides: Partial<FeedProductRow> = {}): FeedProductRow {
  return {
    id: "p1",
    name: "MRF Genius Bat",
    slug: "mrf-genius-bat",
    description: "English willow bat for leather ball.",
    optionTypes: null,
    shippingOverride: null,
    category: { name: "Cricket Bats" },
    globalCategory: { name: "Sports" },
    store: { name: "Rahul Sports", slug: "rahul-sports", shipping: null },
    variants: [
      { price: "2999.00", compareAtPrice: null, stockQuantity: 4, optionValues: null, isDefault: true },
    ],
    images: ["/uploads/media/a.jpg", "https://cdn.example.com/b.jpg"],
    ...overrides,
  };
}

test("a simple product quotes its own price, stock, link and photos", () => {
  const item = toFeedItem(row(), ORIGIN)!;
  assert.equal(item.price, 2999);
  assert.equal(item.salePrice, null);
  assert.equal(item.inStock, true);
  assert.equal(item.link, "https://uniemax.com/store/rahul-sports/product/mrf-genius-bat");
  assert.equal(item.imageLink, "https://uniemax.com/uploads/media/a.jpg");
  assert.deepEqual(item.additionalImageLinks, ["https://cdn.example.com/b.jpg"]);
  assert.equal(item.productType, "Sports > Cricket Bats");
  assert.equal(item.shippingPrice, 0);
});

test("an MRP above the selling price becomes price + sale_price", () => {
  const item = toFeedItem(
    row({
      variants: [
        { price: "2499", compareAtPrice: "2999", stockQuantity: 1, optionValues: null, isDefault: true },
      ],
    }),
    ORIGIN,
  )!;
  assert.equal(item.price, 2999);
  assert.equal(item.salePrice, 2499);
});

test("an option product quotes the first in-stock variant in option order", () => {
  const optionTypes = [{ name: "Size", values: ["S", "M", "L"] }];
  const product = row({
    optionTypes,
    variants: [
      { price: "999", compareAtPrice: null, stockQuantity: 0, optionValues: null, isDefault: true },
      // Created first, but L sorts last.
      { price: "1299", compareAtPrice: null, stockQuantity: 5, optionValues: { Size: "L" }, isDefault: false },
      { price: "1099", compareAtPrice: null, stockQuantity: 0, optionValues: { Size: "S" }, isDefault: false },
      { price: "1199", compareAtPrice: null, stockQuantity: 2, optionValues: { Size: "M" }, isDefault: false },
    ],
  });
  assert.equal(Number(landingVariant(product)!.price), 1199);
  assert.equal(toFeedItem(product, ORIGIN)!.price, 1199);
});

test("all variants sold out → out_of_stock at the first variant's price", () => {
  const product = row({
    optionTypes: [{ name: "Size", values: ["S", "M"] }],
    variants: [
      { price: "1199", compareAtPrice: null, stockQuantity: 0, optionValues: { Size: "M" }, isDefault: false },
      { price: "1099", compareAtPrice: null, stockQuantity: 0, optionValues: { Size: "S" }, isDefault: false },
    ],
  });
  const item = toFeedItem(product, ORIGIN)!;
  assert.equal(item.price, 1099);
  assert.equal(item.inStock, false);
});

test("flat shipping is charged below the free threshold and waived at it", () => {
  const shipping = { rate: { type: "FLAT", amount: 60, freeAbove: 3000 } };
  assert.equal(toFeedItem(row({ store: { name: "S", slug: "s", shipping } }), ORIGIN)!.shippingPrice, 60);
  const above = row({
    store: { name: "S", slug: "s", shipping },
    variants: [{ price: "3000", compareAtPrice: null, stockQuantity: 1, optionValues: null, isDefault: true }],
  });
  assert.equal(toFeedItem(above, ORIGIN)!.shippingPrice, 0);
});

test("a product without a photo or price is left out", () => {
  assert.equal(toFeedItem(row({ images: [] }), ORIGIN), null);
  assert.equal(toFeedItem(row({ variants: [] }), ORIGIN), null);
});

test("the XML is escaped and free of control characters", () => {
  const item = toFeedItem(row({ name: "Bat & Ball <Combo>\u000b" }), ORIGIN)!;
  const xml = renderProductFeed([item], ORIGIN);
  assert.match(xml, /<g:title>Bat &amp; Ball &lt;Combo&gt;<\/g:title>/);
  assert.match(xml, /<g:price>2999.00 INR<\/g:price>/);
  assert.match(xml, /<g:shipping><g:country>IN<\/g:country><g:price>0.00 INR<\/g:price><\/g:shipping>/);
  assert.doesNotMatch(xml, /\u000b/);
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?><rss version="2.0" xmlns:g=/);
});
