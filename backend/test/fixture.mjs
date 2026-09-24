// Builds (once per run) a published test store with one in-stock product,
// owned by account A. Every step goes through the public API.
import { PNG_1PX, fileForm, uniq, need, webLogin } from "./helpers.mjs";

let cached;

export async function sellerFixture() {
  if (cached) return cached;
  const seller = await webLogin(need("QA_EMAIL_A"), need("QA_PASSWORD_A"));

  // 1. Store (name + logo)
  const created = await seller.req("POST", "/api/v1/stores", {
    form: fileForm({ name: uniq("QA Store") }, PNG_1PX, "logo.png"),
  });
  if (created.status !== 201) throw new Error(`create store: ${created.status} ${JSON.stringify(created.body)}`);
  const store = created.body.data;

  // 2. A verified phone on the account (SMS OTP bypass), then the profile.
  const me = (await seller.req("GET", "/api/v1/auth/me")).body.data;
  let phone = me.phoneVerifiedAt ? me.phone : null;
  if (!phone && process.env.QA_PHONE_A) {
    const code = process.env.QA_OTP_CODE ?? "123456";
    await seller.req("POST", "/api/v1/auth/me/link/request", { json: { phone: process.env.QA_PHONE_A } });
    const v = await seller.req("POST", "/api/v1/auth/me/link/verify", {
      json: { phone: process.env.QA_PHONE_A, code },
    });
    if (v.status >= 300) throw new Error(`link phone: ${v.status} ${JSON.stringify(v.body)}`);
    phone = (await seller.req("GET", "/api/v1/auth/me")).body.data.phone;
  }
  const profile = await seller.req("PATCH", `/api/v1/stores/${store.id}/profile`, {
    json: { businessName: "QA Test Business", ...(phone ? { phone } : {}) },
  });
  if (profile.status !== 200) throw new Error(`profile: ${profile.status} ${JSON.stringify(profile.body)}`);

  // 3. Shelf from the taxonomy + a product with price, stock and a photo.
  const tax = (await seller.req("GET", "/api/v1/categories/search?q=backpack")).body.data[0];
  const shelf = await seller.req("POST", `/api/v1/stores/${store.id}/categories`, {
    json: { categoryId: tax.id },
  });
  if (shelf.status !== 201) throw new Error(`category: ${shelf.status} ${JSON.stringify(shelf.body)}`);
  const prod = await seller.req("POST", `/api/v1/stores/${store.id}/products`, {
    json: { name: uniq("QA Bag"), categoryId: shelf.body.data.id, price: 100, stockQuantity: 5 },
  });
  if (prod.status !== 201) throw new Error(`product: ${prod.status} ${JSON.stringify(prod.body)}`);
  const product = prod.body.data;
  const media = await seller.req("POST", `/api/v1/stores/${store.id}/products/${product.id}/media`, {
    form: fileForm({}, PNG_1PX),
  });
  if (media.status !== 201) throw new Error(`media: ${media.status} ${JSON.stringify(media.body)}`);
  const act = await seller.req("PATCH", `/api/v1/stores/${store.id}/products/${product.id}`, {
    json: { isActive: true },
  });
  if (act.status !== 200) throw new Error(`activate: ${act.status} ${JSON.stringify(act.body)}`);

  // 4. Publish (needs business name + verified phone).
  const pub = await seller.req("PATCH", `/api/v1/stores/${store.id}/publish`, { json: { isPublished: true } });
  const published = pub.status === 200;

  cached = {
    seller,
    store,
    published,
    publishError: published ? null : pub.body?.message,
    productId: product.id,
    // A simple product is ordered by productId alone (variantId omitted =
    // its implicit Default variant — sending the Default id is a 409).
    defaultVariantId: act.body.data.defaultVariant.id,
    slug: store.slug,
  };
  return cached;
}
