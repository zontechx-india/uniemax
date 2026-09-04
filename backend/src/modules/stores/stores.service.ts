import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import { slugify } from "../../utils/slug.js";
import {
  mediaUrl,
  newObjectKey,
  storage,
} from "../../package/storage/index.js";
import type { UploadedFile } from "../../package/storage/index.js";
import {
  DEFAULT_STORE_THEME,
  normalizePrimaryLocation,
  resolveCheckoutFields,
  resolveFooter,
  resolvePayments,
  resolveShipping,
} from "./stores.schema.js";
import type {
  StoreCreateInput,
  StoreUpdateInput,
  StoreThemeUpdateInput,
  StoreFooterUpdateInput,
  StorePaymentsUpdateInput,
  StoreCheckoutUpdateInput,
  StoreShipping,
  HomepageSection,
} from "./stores.schema.js";
import { randomUUID } from "node:crypto";

/**
 * Every owner-scoped function is scoped to the owning customer — a store id
 * from another account behaves exactly like a missing one (404), never a 403
 * that would leak the id's existence. Store routes accept the store's id
 * **or** slug interchangeably (slugs are the customer-facing identity).
 */

const storeSelect = {
  id: true,
  name: true,
  slug: true,
  logoKey: true,
  theme: true,
  homepage: true,
  footer: true,
  payments: true,
  shipping: true,
  checkout: true,
  isPublished: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StoreSelect;

type StoreRow = Prisma.StoreGetPayload<{ select: typeof storeSelect }>;

/**
 * The DB stores only the logo's object KEY; the public URL is derived from
 * storage configuration here, at read time. Clients never see the key.
 * `footer` is normalised to the complete shape so clients never deal with
 * partial / legacy JSON.
 */
function shapeStore(row: StoreRow) {
  const { logoKey, footer, payments, shipping, checkout, ...rest } = row;
  return {
    ...rest,
    logoUrl: mediaUrl("logo", logoKey),
    footer: resolveFooter(footer),
    payments: resolvePayments(payments),
    shipping: resolveShipping(shipping),
    checkout: resolveCheckoutFields(checkout),
  };
}


/** Ensures the generated slug is unique, appending -2, -3, ... on collision. */
async function uniqueSlug(base: string): Promise<string> {
  const root = base || "store";
  let candidate = root;
  let n = 1;
  for (;;) {
    const existing = await prisma.store.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

export async function listMyStores(ownerId: string) {
  const rows = await prisma.store.findMany({
    where: { ownerId },
    select: storeSelect,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(shapeStore);
}

/**
 * Create a store. The logo is REQUIRED, and the object key is namespaced by
 * the store id, so the row is written first and the logo attached to it in a
 * second write. If storing the object fails the fresh (still empty) row is
 * rolled back, so a store never exists without its logo.
 */
export async function createStore(
  ownerId: string,
  input: StoreCreateInput,
  logo: UploadedFile,
) {
  const slug = await uniqueSlug(slugify(input.name));
  const created = await prisma.store.create({
    data: {
      ownerId,
      name: input.name,
      slug,
      theme: DEFAULT_STORE_THEME,
    },
    select: { id: true },
  });

  try {
    const key = newObjectKey(`store-logo/${created.id}`, logo.contentType);
    await storage.put("logo", key, logo.buffer, logo.contentType);
    const row = await prisma.store.update({
      where: { id: created.id },
      data: { logoKey: key },
      select: storeSelect,
    });
    return shapeStore(row);
  } catch (err) {
    await prisma.store.delete({ where: { id: created.id } }).catch(() => {});
    throw err;
  }
}

/** `storeRef` is the store's id or slug — both resolve, ownership enforced. */
export async function getMyStore(ownerId: string, storeRef: string) {
  const store = await prisma.store.findFirst({
    where: { ownerId, OR: [{ id: storeRef }, { slug: storeRef }] },
    select: storeSelect,
  });
  if (!store) throw HttpError.notFound("Store not found");
  return shapeStore(store);
}

export async function updateStore(
  ownerId: string,
  storeRef: string,
  input: StoreUpdateInput,
) {
  const store = await getMyStore(ownerId, storeRef); // ownership check

  const data: Prisma.StoreUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;

  // Slug stays stable across renames so shared store links keep working.
  const row = await prisma.store.update({
    where: { id: store.id },
    data,
    select: storeSelect,
  });
  return shapeStore(row);
}

// ---------------------------------------------------------------------------
// Logo (bucket "logo" — a dedicated bucket, separate from product media)
// ---------------------------------------------------------------------------

/**
 * Replace the store's logo. The cropped/processed file arrives as multipart;
 * a fresh object key is minted every time (immutable objects → cacheable
 * forever) and the previous object is deleted best-effort after the row
 * points at the new one. There is no removal counterpart — the logo is
 * mandatory from creation onward.
 */
export async function updateStoreLogo(
  ownerId: string,
  storeRef: string,
  file: UploadedFile,
) {
  const store = await getMyStore(ownerId, storeRef); // ownership check
  const previous = await prisma.store.findUniqueOrThrow({
    where: { id: store.id },
    select: { logoKey: true },
  });

  const key = newObjectKey(`store-logo/${store.id}`, file.contentType);
  await storage.put("logo", key, file.buffer, file.contentType);

  const row = await prisma.store.update({
    where: { id: store.id },
    data: { logoKey: key },
    select: storeSelect,
  });

  // Best-effort cleanup — an orphaned object must never fail the request.
  if (previous.logoKey && previous.logoKey !== key) {
    await storage.remove("logo", previous.logoKey).catch(() => {});
  }
  return shapeStore(row);
}

export async function updateStoreTheme(
  ownerId: string,
  storeRef: string,
  patch: StoreThemeUpdateInput,
) {
  const existing = await getMyStore(ownerId, storeRef);
  const current =
    existing.theme && typeof existing.theme === "object"
      ? (existing.theme as Record<string, unknown>)
      : {};
  // Rebuild from the known theme keys only, so stale fields from older
  // theme shapes (e.g. the removed customCode) fall away on write.
  const merged = { ...DEFAULT_STORE_THEME, ...current, ...patch };
  const theme = Object.fromEntries(
    Object.keys(DEFAULT_STORE_THEME).map((key) => [
      key,
      merged[key as keyof typeof merged],
    ]),
  );
  const row = await prisma.store.update({
    where: { id: existing.id },
    data: { theme },
    select: storeSelect,
  });
  return shapeStore(row);
}

/**
 * Set the storefront homepage section order + visibility. The controller has
 * already validated that `sections` is a complete, unique permutation of the
 * known keys, so this stores it verbatim as the new source of truth — a
 * reorder and a toggle are the same write.
 */
export async function updateStoreHomepage(
  ownerId: string,
  storeRef: string,
  sections: HomepageSection[],
) {
  const store = await getMyStore(ownerId, storeRef); // ownership check
  const row = await prisma.store.update({
    where: { id: store.id },
    // Cast: our typed section objects are valid JSON, but the interface has no
    // index signature so Prisma's InputJsonValue doesn't infer it.
    data: { homepage: { sections } as unknown as Prisma.InputJsonValue },
    select: storeSelect,
  });
  return shapeStore(row);
}

/**
 * Update the storefront footer. The PATCH body carries any subset of the
 * footer SECTIONS — each present section replaces that section wholesale
 * (the management page edits one card at a time), absent ones are kept.
 * Locations get stable ids minted server-side, and exactly one location is
 * primary whenever any exist.
 */
export async function updateStoreFooter(
  ownerId: string,
  storeRef: string,
  patch: StoreFooterUpdateInput,
) {
  const store = await getMyStore(ownerId, storeRef); // ownership check
  const merged = { ...store.footer, ...patch };

  if (patch.locations) {
    merged.locations = patch.locations.map((location) => ({
      ...location,
      id: location.id ?? randomUUID(),
    }));
    normalizePrimaryLocation(merged.locations);
  }

  const row = await prisma.store.update({
    where: { id: store.id },
    // Cast: the typed footer object is plain JSON, but its interface has no
    // index signature so Prisma's InputJsonValue doesn't infer it (same as
    // the homepage sections write).
    data: { footer: merged as unknown as Prisma.InputJsonValue },
    select: storeSelect,
  });
  return shapeStore(row);
}

/** Update the payment acceptance switches (partial — absent keys are kept). */
export async function updateStorePayments(
  ownerId: string,
  storeRef: string,
  patch: StorePaymentsUpdateInput,
) {
  const store = await getMyStore(ownerId, storeRef); // ownership check
  const merged = { ...store.payments, ...patch };
  const row = await prisma.store.update({
    where: { id: store.id },
    data: { payments: merged },
    select: storeSelect,
  });
  return shapeStore(row);
}

/** Update which checkout fields this store collects (partial merge). */
export async function updateStoreCheckout(
  ownerId: string,
  storeRef: string,
  patch: StoreCheckoutUpdateInput,
) {
  const store = await getMyStore(ownerId, storeRef); // ownership check
  const merged = { ...store.checkout, ...patch };
  const row = await prisma.store.update({
    where: { id: store.id },
    data: { checkout: merged },
    select: storeSelect,
  });
  return shapeStore(row);
}

/** Set the fulfilment mode (Delivery / Pickup / Both). */
export async function updateStoreShipping(
  ownerId: string,
  storeRef: string,
  input: StoreShipping,
) {
  const store = await getMyStore(ownerId, storeRef); // ownership check
  const row = await prisma.store.update({
    where: { id: store.id },
    data: { shipping: input },
    select: storeSelect,
  });
  return shapeStore(row);
}

export async function setStorePublished(
  ownerId: string,
  storeRef: string,
  isPublished: boolean,
) {
  const store = await getMyStore(ownerId, storeRef); // ownership check
  const previous = await prisma.store.findUniqueOrThrow({
    where: { id: store.id },
    select: { publishedAt: true },
  });
  const row = await prisma.store.update({
    where: { id: store.id },
    data: {
      isPublished,
      // First publish only — the marketplace ranks "New Stores" by this, so
      // toggling an old store off and on must not bump it back to the top.
      ...(isPublished && previous.publishedAt === null
        ? { publishedAt: new Date() }
        : {}),
    },
    select: storeSelect,
  });
  return shapeStore(row);
}
