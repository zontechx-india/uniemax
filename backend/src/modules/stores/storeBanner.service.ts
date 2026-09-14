import { prisma } from "../../config/prisma.js";
import type { StoreActor } from "./storeActor.js";
import { HttpError } from "../../utils/httpError.js";
import {
  mediaUrl,
  newObjectKey,
  storage,
  type UploadedFile,
} from "../../package/storage/index.js";
import { getMyStore } from "./stores.service.js";
import type {
  BannerLinkType,
  StoreBannerCreateInput,
  StoreBannerOrderInput,
  StoreBannerUpdateInput,
} from "./storeBanner.schema.js";

/**
 * Storefront banners — the owner's promo carousel on the store homepage.
 *
 * Every call resolves the store through `getMyStore` first, so ownership is
 * enforced exactly as it is for the catalog: a store the caller does not own
 * is a 404, never a 403.
 *
 * Images live in the `media` bucket under `banners/{storeId}/`, and the DB
 * holds OBJECT KEYS only; public URLs are derived at read time so the bucket
 * or CDN can move without a data migration. ONE image per banner, always 16:5
 * — the storefront scales it by width, so there is no second asset to keep in
 * sync and no variant to pick.
 */

/**
 * Enough for a seasonal rotation without turning the homepage into a
 * slideshow nobody scrolls past. The admin screen stops offering "Add" at
 * this point rather than letting the server be the first to say no.
 */
export const MAX_STORE_BANNERS = 10;

const bannerSelect = {
  id: true,
  title: true,
  imageKey: true,
  linkType: true,
  linkValue: true,
  displayOrder: true,
  isActive: true,
} as const;

interface BannerRow {
  id: string;
  title: string | null;
  imageKey: string;
  linkType: BannerLinkType;
  linkValue: string | null;
  displayOrder: number;
  isActive: boolean;
}

/**
 * What a CATEGORY/PRODUCT link actually points at right now — the owner sees
 * the destination's NAME rather than the cuid they picked, and a target that
 * has since been deleted or switched off is reported as such instead of
 * looking fine in the admin and dying on the storefront.
 */
export interface BannerLinkTarget {
  label: string;
  /** Storefront path, or null when the target can no longer be linked. */
  href: string | null;
  /** Deleted, or switched off so the storefront would not serve it. */
  missing: boolean;
}

export interface ShapedBanner extends Omit<BannerRow, "imageKey"> {
  imageUrl: string | null;
  target: BannerLinkTarget | null;
}

/**
 * Resolve every CATEGORY/PRODUCT link in one pair of queries rather than one
 * per banner — ten banners must not mean twenty round-trips.
 */
async function resolveTargets(
  storeSlug: string,
  storeId: string,
  rows: BannerRow[],
): Promise<Map<string, BannerLinkTarget>> {
  const categoryIds = rows
    .filter((r) => r.linkType === "CATEGORY" && r.linkValue)
    .map((r) => r.linkValue as string);
  const productIds = rows
    .filter((r) => r.linkType === "PRODUCT" && r.linkValue)
    .map((r) => r.linkValue as string);

  const [categories, products] = await Promise.all([
    categoryIds.length
      ? prisma.storeCategory.findMany({
          where: { id: { in: categoryIds }, storeId },
          select: { id: true, name: true, slug: true, isActive: true },
        })
      : Promise.resolve([]),
    productIds.length
      ? prisma.storeProduct.findMany({
          where: { id: { in: productIds }, storeId },
          select: { id: true, name: true, slug: true, isActive: true },
        })
      : Promise.resolve([]),
  ]);

  const out = new Map<string, BannerLinkTarget>();
  for (const c of categories) {
    out.set(c.id, {
      label: c.name,
      href: c.isActive ? `/store/${storeSlug}/category/${c.slug}` : null,
      missing: !c.isActive,
    });
  }
  for (const p of products) {
    out.set(p.id, {
      label: p.name,
      href: p.isActive ? `/store/${storeSlug}/product/${p.slug}` : null,
      missing: !p.isActive,
    });
  }
  return out;
}

function shapeBanner(
  row: BannerRow,
  targets: Map<string, BannerLinkTarget>,
): ShapedBanner {
  const { imageKey, ...rest } = row;
  let target: BannerLinkTarget | null = null;
  if (row.linkType === "URL" && row.linkValue) {
    target = { label: row.linkValue, href: row.linkValue, missing: false };
  } else if (
    (row.linkType === "CATEGORY" || row.linkType === "PRODUCT") &&
    row.linkValue
  ) {
    target = targets.get(row.linkValue) ?? {
      // The row still points at something this store no longer has.
      label:
        row.linkType === "CATEGORY" ? "Deleted category" : "Deleted product",
      href: null,
      missing: true,
    };
  }
  return {
    ...rest,
    imageUrl: mediaUrl("media", imageKey),
    target,
  };
}

/**
 * The owner's full list in their arranged order — inactive banners included,
 * because the admin screen is where they are switched back on.
 *
 * Every mutation returns this, so the client always re-renders from one
 * authoritative list instead of patching a row and hoping order and link
 * labels still agree.
 */
async function listForStore(storeId: string, storeSlug: string) {
  const rows = (await prisma.storeBanner.findMany({
    where: { storeId },
    select: bannerSelect,
    orderBy: { displayOrder: "asc" },
  })) as BannerRow[];
  const targets = await resolveTargets(storeSlug, storeId, rows);
  return rows.map((row) => shapeBanner(row, targets));
}

export async function listBanners(actor: StoreActor, storeRef: string) {
  const store = await getMyStore(actor, storeRef);
  return listForStore(store.id, store.slug);
}

/**
 * A CATEGORY/PRODUCT link must name something in THIS store. Checked on every
 * write so a mistyped or cross-store id is rejected at the source, rather
 * than becoming a banner that quietly leads nowhere.
 */
async function assertLinkTarget(
  storeId: string,
  linkType: BannerLinkType | undefined,
  linkValue: string | null,
) {
  if (!linkType || linkType === "NONE" || linkType === "URL") return;
  if (!linkValue) return; // the schema already rejects this pairing
  const exists =
    linkType === "CATEGORY"
      ? await prisma.storeCategory.findFirst({
          where: { id: linkValue, storeId },
          select: { id: true },
        })
      : await prisma.storeProduct.findFirst({
          where: { id: linkValue, storeId },
          select: { id: true },
        });
  if (!exists) {
    throw HttpError.badRequest(
      linkType === "CATEGORY"
        ? "That category is not in this store"
        : "That product is not in this store",
    );
  }
}

/**
 * Create from a multipart upload — the image is the one thing a banner cannot
 * exist without, so it arrives with the row. Metadata rides along as text
 * fields, parsed by the controller before this is called.
 */
export async function createBanner(
  actor: StoreActor,
  storeRef: string,
  file: UploadedFile,
  input: StoreBannerCreateInput,
) {
  const store = await getMyStore(actor, storeRef);

  const count = await prisma.storeBanner.count({ where: { storeId: store.id } });
  if (count >= MAX_STORE_BANNERS) {
    throw HttpError.conflict(
      `A store can have at most ${MAX_STORE_BANNERS} banners`,
    );
  }
  await assertLinkTarget(store.id, input.linkType, input.linkValue ?? null);

  const key = newObjectKey(`banners/${store.id}`, file.contentType);
  await storage.put("media", key, file.buffer, file.contentType);

  const last = await prisma.storeBanner.findFirst({
    where: { storeId: store.id },
    orderBy: { displayOrder: "desc" },
    select: { displayOrder: true },
  });

  const linkType = input.linkType ?? "NONE";
  await prisma.storeBanner.create({
    data: {
      storeId: store.id,
      imageKey: key,
      title: input.title ?? null,
      linkType,
      linkValue: linkType === "NONE" ? null : (input.linkValue ?? null),
      isActive: input.isActive ?? true,
      displayOrder: (last?.displayOrder ?? -1) + 1,
    },
  });

  return listForStore(store.id, store.slug);
}

export async function updateBanner(
  actor: StoreActor,
  storeRef: string,
  bannerId: string,
  input: StoreBannerUpdateInput,
) {
  const store = await getMyStore(actor, storeRef);
  const current = await prisma.storeBanner.findFirst({
    where: { id: bannerId, storeId: store.id },
    select: { id: true, linkType: true, linkValue: true },
  });
  if (!current) throw HttpError.notFound("Banner not found");

  // Validate the link as it will be AFTER the patch: a body may change only
  // the kind, or only the value.
  const nextType = (input.linkType ?? current.linkType) as BannerLinkType;
  const nextValue =
    input.linkValue !== undefined ? input.linkValue : current.linkValue;
  await assertLinkTarget(store.id, nextType, nextValue);

  const data: {
    title?: string | null;
    linkType?: BannerLinkType;
    linkValue?: string | null;
    isActive?: boolean;
  } = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.linkType !== undefined || input.linkValue !== undefined) {
    data.linkType = nextType;
    // "No link" keeps no target — a stale value would resurface the moment
    // the owner switched the kind back on.
    data.linkValue = nextType === "NONE" ? null : nextValue;
  }

  await prisma.storeBanner.update({ where: { id: current.id }, data });
  return listForStore(store.id, store.slug);
}

/**
 * Swap the banner's image. The previous object is deleted only AFTER the row
 * points at the new one, so a failed delete can never leave a banner with no
 * image.
 */
export async function replaceBannerImage(
  actor: StoreActor,
  storeRef: string,
  bannerId: string,
  file: UploadedFile,
) {
  const store = await getMyStore(actor, storeRef);
  const current = await prisma.storeBanner.findFirst({
    where: { id: bannerId, storeId: store.id },
    select: { id: true, imageKey: true },
  });
  if (!current) throw HttpError.notFound("Banner not found");

  const key = newObjectKey(`banners/${store.id}`, file.contentType);
  await storage.put("media", key, file.buffer, file.contentType);

  const previous = current.imageKey;
  await prisma.storeBanner.update({
    where: { id: current.id },
    data: { imageKey: key },
  });
  await storage.remove("media", previous).catch(() => {});

  return listForStore(store.id, store.slug);
}

export async function deleteBanner(
  actor: StoreActor,
  storeRef: string,
  bannerId: string,
) {
  const store = await getMyStore(actor, storeRef);
  const current = await prisma.storeBanner.findFirst({
    where: { id: bannerId, storeId: store.id },
    select: { id: true, imageKey: true },
  });
  if (!current) throw HttpError.notFound("Banner not found");

  await prisma.storeBanner.delete({ where: { id: current.id } });
  // The object goes with the row — nothing else can reference it.
  await storage.remove("media", current.imageKey).catch(() => {});

  return listForStore(store.id, store.slug);
}

/**
 * Reorder — `bannerIds` must be exactly this store's banner ids, for the same
 * reason the homepage section PATCH takes the whole list: a partial order
 * says nothing about where the rest belong.
 */
export async function reorderBanners(
  actor: StoreActor,
  storeRef: string,
  input: StoreBannerOrderInput,
) {
  const store = await getMyStore(actor, storeRef);
  const rows = await prisma.storeBanner.findMany({
    where: { storeId: store.id },
    select: { id: true },
  });

  const currentIds = new Set(rows.map((r) => r.id));
  const nextIds = new Set(input.bannerIds);
  if (
    currentIds.size !== nextIds.size ||
    [...currentIds].some((id) => !nextIds.has(id))
  ) {
    throw HttpError.badRequest(
      "bannerIds must contain exactly this store's banner ids",
    );
  }

  await prisma.$transaction(
    input.bannerIds.map((id, index) =>
      prisma.storeBanner.update({
        where: { id },
        data: { displayOrder: index },
      }),
    ),
  );

  return listForStore(store.id, store.slug);
}

/**
 * Storefront read: the banners a shopper should actually see, in order.
 * Inactive rows never leave the server, and a link whose target has gone is
 * flattened to `href: null` so the banner renders as a plain image rather
 * than a dead link.
 *
 * Lives here rather than in `publicStore.service` so the shaping — and the
 * meaning of "active" — has exactly one definition.
 */
export async function listPublicBanners(storeId: string, storeSlug: string) {
  const rows = (await prisma.storeBanner.findMany({
    where: { storeId, isActive: true },
    select: bannerSelect,
    orderBy: { displayOrder: "asc" },
  })) as BannerRow[];
  const targets = await resolveTargets(storeSlug, storeId, rows);
  return rows.map((row) => {
    const shaped = shapeBanner(row, targets);
    return {
      id: shaped.id,
      title: shaped.title,
      imageUrl: shaped.imageUrl,
      href: shaped.target?.href ?? null,
      /** Only a URL banner can leave the site; the storefront opens it safely. */
      external: row.linkType === "URL",
    };
  });
}
