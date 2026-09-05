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
  StoreShippingUpdateInput,
  HomepageSection,
} from "./stores.schema.js";
import {
  DEFAULT_STORE_PROFILE,
  DEFAULT_STORE_TAX,
  resolveProfile,
} from "./storeProfile.schema.js";
import type { StoreProfileUpdateInput } from "./storeProfile.schema.js";
import { evaluateReadiness, GATE_LABELS } from "./storeReadiness.js";
import type { Gate, ReadinessContext } from "./storeReadiness.js";
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
  profile: true,
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
  const { logoKey, footer, profile, payments, shipping, checkout, ...rest } =
    row;
  return {
    ...rest,
    logoUrl: mediaUrl("logo", logoKey),
    footer: resolveFooter(footer),
    profile: resolveProfile(profile),
    payments: resolvePayments(payments),
    shipping: resolveShipping(shipping),
    checkout: resolveCheckoutFields(checkout),
    /** Stripped by `attachReadiness`; only the logo requirement reads it. */
    logoKey,
  };
}

type ShapedStore = ReturnType<typeof shapeStore>;

// ---------------------------------------------------------------------------
// Readiness — the requirement registry lives in storeReadiness.ts
// ---------------------------------------------------------------------------

type ReadinessCounts = Pick<
  ReadinessContext,
  "categoryCount" | "productCount" | "hasPrimaryBankAccount"
>;

/**
 * The per-store counts readiness needs, for any number of stores at once.
 *
 * Three grouped queries regardless of how many stores are asked about, so a
 * seller's whole portfolio costs the same as loading one store.
 */
async function loadReadinessCounts(
  storeIds: string[],
): Promise<Map<string, ReadinessCounts>> {
  if (storeIds.length === 0) return new Map();

  const [categories, products, primaryAccounts] = await Promise.all([
    prisma.storeCategory.groupBy({
      by: ["storeId"],
      where: { storeId: { in: storeIds } },
      _count: { _all: true },
    }),
    prisma.storeProduct.groupBy({
      by: ["storeId"],
      where: { storeId: { in: storeIds } },
      _count: { _all: true },
    }),
    prisma.storeBankAccount.findMany({
      where: { storeId: { in: storeIds }, isPrimary: true },
      select: { storeId: true },
    }),
  ]);

  const categoryCounts = new Map(
    categories.map((row) => [row.storeId, row._count._all]),
  );
  const productCounts = new Map(
    products.map((row) => [row.storeId, row._count._all]),
  );
  const withPrimary = new Set(primaryAccounts.map((row) => row.storeId));

  return new Map(
    storeIds.map((id) => [
      id,
      {
        categoryCount: categoryCounts.get(id) ?? 0,
        productCount: productCounts.get(id) ?? 0,
        hasPrimaryBankAccount: withPrimary.has(id),
      },
    ]),
  );
}

/**
 * Attach the readiness evaluation and drop `logoKey` — it exists on the
 * shaped row only so the "has a logo" requirement can see it; the object key
 * itself never leaves the server.
 */
function attachReadiness(store: ShapedStore, counts: ReadinessCounts) {
  const { logoKey, ...rest } = store;
  return {
    ...rest,
    readiness: evaluateReadiness({
      name: store.name,
      logoKey,
      profile: store.profile,
      ...counts,
    }),
  };
}

/** One store, with its readiness evaluation. */
async function withReadiness(row: StoreRow) {
  const store = shapeStore(row);
  const counts = await loadReadinessCounts([store.id]);
  return attachReadiness(store, counts.get(store.id)!);
}

/** Many stores, with readiness — batched into three queries total. */
async function withReadinessMany(rows: StoreRow[]) {
  const stores = rows.map(shapeStore);
  const counts = await loadReadinessCounts(stores.map((s) => s.id));
  return stores.map((store) => attachReadiness(store, counts.get(store.id)!));
}

/**
 * Ownership check for the mutation paths — the same 404-on-foreign-id rule as
 * `getMyStore`, but without evaluating readiness. Every PATCH needs the row
 * to exist and to be the caller's; only the RESPONSE needs readiness, and
 * computing it twice per request would double the query count for nothing.
 */
async function assertOwnedStore(
  ownerId: string,
  storeRef: string,
): Promise<ShapedStore> {
  const store = await prisma.store.findFirst({
    where: { ownerId, OR: [{ id: storeRef }, { slug: storeRef }] },
    select: storeSelect,
  });
  if (!store) throw HttpError.notFound("Store not found");
  return shapeStore(store);
}

/** Evaluate one store's readiness from its current row plus fresh counts. */
async function evaluateFor(store: ShapedStore) {
  const counts = await loadReadinessCounts([store.id]);
  return evaluateReadiness({
    name: store.name,
    logoKey: store.logoKey,
    profile: store.profile,
    ...counts.get(store.id)!,
  });
}

/**
 * Refuse an action whose requirements are not met, naming every missing one
 * so the seller fixes them in a single pass instead of discovering them one
 * rejection at a time. Always called before the write it guards.
 */
async function assertGate(store: ShapedStore, gate: Gate): Promise<void> {
  const readiness = await evaluateFor(store);
  const state = readiness.gates[gate];
  if (!state.allowed) {
    throw HttpError.badRequest(
      `Before you can ${GATE_LABELS[gate]}, please add: ${state.blockers.join(", ")}.`,
    );
  }
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
  // Batched — the whole list costs three readiness queries, not three each.
  return withReadinessMany(rows);
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

  // Seed the profile from the account, so the wizard's next step opens with
  // the seller's name, phone and email already filled in and nobody retypes
  // what we hold. Only VERIFIED identifiers are seeded: the contact fields
  // must be ones the seller has proven they own (`assertVerifiedContact`), so
  // seeding an unverified one would pre-fill a value that its own save then
  // rejects. An unverified channel is left blank and the seller is prompted
  // to verify it.
  const owner = await prisma.customer.findUniqueOrThrow({
    where: { id: ownerId },
    select: {
      name: true,
      email: true,
      emailVerifiedAt: true,
      phone: true,
      phoneVerifiedAt: true,
    },
  });
  const profile = {
    ...DEFAULT_STORE_PROFILE,
    sellerName: owner.name,
    phone: owner.phoneVerifiedAt ? owner.phone : null,
    email: owner.emailVerifiedAt ? owner.email : null,
    tax: { ...DEFAULT_STORE_TAX },
  };

  const created = await prisma.store.create({
    data: {
      ownerId,
      name: input.name,
      slug,
      theme: DEFAULT_STORE_THEME,
      profile: profile as unknown as Prisma.InputJsonValue,
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
    return withReadiness(row);
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
  return withReadiness(store);
}

export async function updateStore(
  ownerId: string,
  storeRef: string,
  input: StoreUpdateInput,
) {
  const store = await assertOwnedStore(ownerId, storeRef); // ownership check

  const data: Prisma.StoreUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;

  // Slug stays stable across renames so shared store links keep working.
  const row = await prisma.store.update({
    where: { id: store.id },
    data,
    select: storeSelect,
  });
  return withReadiness(row);
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
  const store = await assertOwnedStore(ownerId, storeRef); // ownership check
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
  return withReadiness(row);
}

export async function updateStoreTheme(
  ownerId: string,
  storeRef: string,
  patch: StoreThemeUpdateInput,
) {
  const existing = await assertOwnedStore(ownerId, storeRef);
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
  return withReadiness(row);
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
  const store = await assertOwnedStore(ownerId, storeRef); // ownership check
  const row = await prisma.store.update({
    where: { id: store.id },
    // Cast: our typed section objects are valid JSON, but the interface has no
    // index signature so Prisma's InputJsonValue doesn't infer it.
    data: { homepage: { sections } as unknown as Prisma.InputJsonValue },
    select: storeSelect,
  });
  return withReadiness(row);
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
  const store = await assertOwnedStore(ownerId, storeRef); // ownership check
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
  return withReadiness(row);
}

// ---------------------------------------------------------------------------
// Business profile (Store.profile — identity, contact, address, tax IDs)
// ---------------------------------------------------------------------------

/**
 * Update the business profile. Partial by section, like the footer: a key
 * that is present replaces that key wholesale, absent keys are untouched.
 *
 * `address` accepts an explicit `null` to clear it — one reason this merges
 * rather than deep-merges.
 *
 * Contact email and phone are NOT free text. They are the seller's own
 * VERIFIED account identifiers, and this rejects anything else — see
 * `assertVerifiedContact`.
 */
export async function updateStoreProfile(
  ownerId: string,
  storeRef: string,
  patch: StoreProfileUpdateInput,
) {
  const store = await assertOwnedStore(ownerId, storeRef); // ownership check
  // Returns the ACCOUNT's copy of any contact field being set, so what lands
  // in the profile is the canonical value rather than the caller's spelling
  // of it ("ME@X.COM", "+91 98765 43210").
  const contact = await assertVerifiedContact(ownerId, patch);

  const merged = { ...store.profile, ...patch, ...contact };
  const row = await prisma.store.update({
    where: { id: store.id },
    // Cast for the same reason as the footer write: a typed object literal
    // without an index signature doesn't satisfy Prisma's InputJsonValue.
    data: { profile: merged as unknown as Prisma.InputJsonValue },
    select: storeSelect,
  });
  return withReadiness(row);
}

/**
 * The store's contact email and phone are where order notifications, refund
 * disputes and platform notices go, and shoppers see them on the storefront.
 * A seller typing an address they do not control — by accident or to hide
 * behind — makes every one of those undeliverable. So these are not arbitrary
 * strings: each must be an identifier the seller has already PROVEN they own,
 * which on this platform means their own verified account email or phone.
 *
 * That makes this a guard, not a format check. There is deliberately no way
 * to "just save" some other value: changing a contact means verifying the new
 * identifier through `POST /auth/me/link/*`, which sends a code to it and
 * refuses one that already belongs to another account. Proof of control and
 * cross-account uniqueness therefore both hold here for free, and the
 * platform keeps exactly one OTP implementation instead of growing a second
 * one inside stores.
 */
async function assertVerifiedContact(
  ownerId: string,
  patch: StoreProfileUpdateInput,
): Promise<{ email?: string; phone?: string }> {
  // Neither contact field is being touched — nothing to prove.
  if (patch.email === undefined && patch.phone === undefined) return {};

  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: ownerId },
    select: {
      email: true,
      emailVerifiedAt: true,
      phone: true,
      phoneVerifiedAt: true,
    },
  });

  const canonical: { email?: string; phone?: string } = {};

  if (patch.email != null) {
    const verified = customer.emailVerifiedAt ? customer.email : null;
    if (!verified) {
      throw HttpError.badRequest(
        "Verify an email address on your account before using it as your store's contact email.",
      );
    }
    if (patch.email.trim().toLowerCase() !== verified.toLowerCase()) {
      throw HttpError.badRequest(
        "Your store's contact email must be your verified account email. To use a different address, verify it on your account first.",
      );
    }
    canonical.email = verified;
  }

  if (patch.phone != null) {
    const verified = customer.phoneVerifiedAt ? customer.phone : null;
    if (!verified) {
      throw HttpError.badRequest(
        "Verify a phone number on your account before using it as your store's contact number.",
      );
    }
    if (digitsOf(patch.phone) !== digitsOf(verified)) {
      throw HttpError.badRequest(
        "Your store's contact number must be your verified account phone. To use a different number, verify it on your account first.",
      );
    }
    canonical.phone = verified;
  }

  return canonical;
}

/**
 * Compare phone numbers by their digits alone, so "+91 98765 43210" and
 * "+919876543210" count as the same number. Comparison only — what gets
 * stored is the value the account holds.
 */
function digitsOf(value: string): string {
  return value.replace(/\D/g, "");
}

/** Update the payment acceptance switches (partial — absent keys are kept). */
export async function updateStorePayments(
  ownerId: string,
  storeRef: string,
  patch: StorePaymentsUpdateInput,
) {
  const store = await assertOwnedStore(ownerId, storeRef); // ownership check

  // Turning online payment ON means UnieMax starts collecting money for this
  // seller and paying it out, so the payout identity has to be real first:
  // a primary bank account and a PAN (without which 194-O TDS is withheld at
  // 5% rather than 1%). Turning it OFF is never gated.
  if (patch.acceptOnlinePayment && !store.payments.acceptOnlinePayment) {
    await assertGate(store, "ONLINE_PAYMENT");
  }

  const merged = { ...store.payments, ...patch };
  const row = await prisma.store.update({
    where: { id: store.id },
    data: { payments: merged },
    select: storeSelect,
  });
  return withReadiness(row);
}

/** Update which checkout fields this store collects (partial merge). */
export async function updateStoreCheckout(
  ownerId: string,
  storeRef: string,
  patch: StoreCheckoutUpdateInput,
) {
  const store = await assertOwnedStore(ownerId, storeRef); // ownership check
  const merged = { ...store.checkout, ...patch };
  const row = await prisma.store.update({
    where: { id: store.id },
    data: { checkout: merged },
    select: storeSelect,
  });
  return withReadiness(row);
}

/**
 * Update the shipping settings (partial merge): the fulfilment mode
 * (Delivery / Pickup / Both), the store's DEFAULT delivery-area rule — the
 * pincode rule every product without its own override follows — and/or its
 * DEFAULT shipping rate (free / flat per order, optional free-above
 * threshold), likewise the default every product without an override uses.
 */
export async function updateStoreShipping(
  ownerId: string,
  storeRef: string,
  patch: StoreShippingUpdateInput,
) {
  const store = await assertOwnedStore(ownerId, storeRef); // ownership check

  // Offering collection with nowhere to collect from would publish a pickup
  // option no customer can act on. Checked before the write.
  if (patch.mode !== undefined && patch.mode !== "DELIVERY") {
    await assertGate(store, "PICKUP");
  }

  const merged = {
    ...store.shipping,
    ...(patch.mode !== undefined ? { mode: patch.mode } : {}),
    ...(patch.deliveryRule !== undefined
      ? { deliveryRule: patch.deliveryRule }
      : {}),
    ...(patch.rate !== undefined ? { rate: patch.rate } : {}),
  };
  const row = await prisma.store.update({
    where: { id: store.id },
    // Cast: typed object literals without an index signature don't satisfy
    // Prisma's InputJsonValue (same as the other store JSON columns).
    data: { shipping: merged as unknown as Prisma.InputJsonValue },
    select: storeSelect,
  });
  return withReadiness(row);
}

/**
 * Publish / unpublish the storefront.
 *
 * Publishing is gated on the store actually being ready — a live storefront
 * with no address, no contact and no products is worse for the marketplace
 * than no storefront at all. Two deliberate exemptions:
 *
 *   - **Unpublishing is never gated.** A seller must always be able to take
 *     their shop down, especially if what they need to fix is why they want
 *     it down.
 *   - **Stores that have published before are grandfathered.** The
 *     requirements landed after they went live; enforcing them retroactively
 *     would strand an existing seller the first time they toggled their shop
 *     off. `publishedAt` is the marker — it is stamped once and never reset,
 *     so it means "this store has been live at some point" exactly.
 */
export async function setStorePublished(
  ownerId: string,
  storeRef: string,
  isPublished: boolean,
) {
  const store = await assertOwnedStore(ownerId, storeRef); // ownership check
  const previous = await prisma.store.findUniqueOrThrow({
    where: { id: store.id },
    select: { publishedAt: true },
  });

  if (isPublished && previous.publishedAt === null) {
    await assertGate(store, "PUBLISH");
  }

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
  return withReadiness(row);
}
