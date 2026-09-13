import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import {
  mediaUrl,
  newObjectKey,
  storage,
  type UploadedFile,
} from "../../package/storage/index.js";
import type {
  BannerCreateInput,
  BannerLinkType,
  BannerOrderInput,
  BannerUpdateInput,
} from "./banners.schema.js";

/**
 * Marketplace banners — the platform-wide carousel at the top of the
 * marketplace homepage.
 *
 * No ownership check here (unlike `storeBanner.service`): every caller is
 * already inside the `requireAdmin` subtree, and a platform banner belongs to
 * the platform rather than to any one admin.
 *
 * Images live in the `media` bucket under `banners/marketplace/`, and the DB
 * holds OBJECT KEYS only; public URLs are derived at read time so the bucket
 * or CDN can move without a data migration. One image per banner, always 16:5
 * — the marketplace scales it by width, matching the store banners.
 */

/** Enough for a campaign rotation without burying the page under a slideshow. */
export const MAX_BANNERS = 10;

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
 * What a STORE/URL link points at right now — the admin sees the shop's NAME
 * rather than the cuid they picked, and a store that has since been
 * unpublished or suspended is reported instead of looking fine in the console
 * while the marketplace renders a dead banner.
 */
export interface BannerLinkTarget {
  label: string;
  /** Marketplace path, or null when the target can no longer be linked. */
  href: string | null;
  missing: boolean;
}

export interface ShapedBanner extends Omit<BannerRow, "imageKey"> {
  imageUrl: string | null;
  target: BannerLinkTarget | null;
}

/** One query for every STORE link, not one per banner. */
async function resolveTargets(
  rows: BannerRow[],
): Promise<Map<string, BannerLinkTarget>> {
  const storeIds = rows
    .filter((r) => r.linkType === "STORE" && r.linkValue)
    .map((r) => r.linkValue as string);
  if (storeIds.length === 0) return new Map();

  const stores = await prisma.store.findMany({
    where: { id: { in: storeIds } },
    select: {
      id: true,
      name: true,
      slug: true,
      isPublished: true,
      suspendedAt: true,
    },
  });

  const out = new Map<string, BannerLinkTarget>();
  for (const store of stores) {
    // A suspended or unpublished shop is not served to shoppers, so linking
    // to it would be a 404 with a banner's worth of promotion behind it.
    const reachable = store.isPublished && store.suspendedAt === null;
    out.set(store.id, {
      label: store.name,
      href: reachable ? `/store/${store.slug}` : null,
      missing: !reachable,
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
  } else if (row.linkType === "STORE" && row.linkValue) {
    target = targets.get(row.linkValue) ?? {
      label: "Deleted store",
      href: null,
      missing: true,
    };
  }
  return { ...rest, imageUrl: mediaUrl("media", imageKey), target };
}

/**
 * The console's full list in admin order — inactive rows included, because the
 * console is where they are switched back on. Every mutation returns this, so
 * the client re-renders from one authoritative array.
 */
async function listAll() {
  const rows = (await prisma.banner.findMany({
    select: bannerSelect,
    orderBy: { displayOrder: "asc" },
  })) as BannerRow[];
  const targets = await resolveTargets(rows);
  return rows.map((row) => shapeBanner(row, targets));
}

export async function listBanners() {
  return listAll();
}

/** A STORE link must name a real store; a typo should fail at the source. */
async function assertLinkTarget(
  linkType: BannerLinkType | undefined,
  linkValue: string | null,
) {
  if (!linkType || linkType !== "STORE" || !linkValue) return;
  const exists = await prisma.store.findUnique({
    where: { id: linkValue },
    select: { id: true },
  });
  if (!exists) throw HttpError.badRequest("That store does not exist");
}

export async function createBanner(file: UploadedFile, input: BannerCreateInput) {
  const count = await prisma.banner.count();
  if (count >= MAX_BANNERS) {
    throw HttpError.conflict(`There can be at most ${MAX_BANNERS} banners`);
  }
  await assertLinkTarget(input.linkType, input.linkValue ?? null);

  const key = newObjectKey("banners/marketplace", file.contentType);
  await storage.put("media", key, file.buffer, file.contentType);

  const last = await prisma.banner.findFirst({
    orderBy: { displayOrder: "desc" },
    select: { displayOrder: true },
  });

  const linkType = input.linkType ?? "NONE";
  await prisma.banner.create({
    data: {
      imageKey: key,
      title: input.title ?? null,
      linkType,
      linkValue: linkType === "NONE" ? null : (input.linkValue ?? null),
      isActive: input.isActive ?? true,
      displayOrder: (last?.displayOrder ?? -1) + 1,
    },
  });

  return listAll();
}

export async function updateBanner(bannerId: string, input: BannerUpdateInput) {
  const current = await prisma.banner.findUnique({
    where: { id: bannerId },
    select: { id: true, linkType: true, linkValue: true },
  });
  if (!current) throw HttpError.notFound("Banner not found");

  // Validate the link as it will be AFTER the patch: a body may change only
  // the kind, or only the value.
  const nextType = (input.linkType ?? current.linkType) as BannerLinkType;
  const nextValue =
    input.linkValue !== undefined ? input.linkValue : current.linkValue;
  await assertLinkTarget(nextType, nextValue);

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
    // the kind was switched back on.
    data.linkValue = nextType === "NONE" ? null : nextValue;
  }

  await prisma.banner.update({ where: { id: current.id }, data });
  return listAll();
}

/**
 * Swap the image. The previous object is deleted only AFTER the row points at
 * the new one, so a failed delete can never leave a banner with no image.
 */
export async function replaceBannerImage(bannerId: string, file: UploadedFile) {
  const current = await prisma.banner.findUnique({
    where: { id: bannerId },
    select: { id: true, imageKey: true },
  });
  if (!current) throw HttpError.notFound("Banner not found");

  const key = newObjectKey("banners/marketplace", file.contentType);
  await storage.put("media", key, file.buffer, file.contentType);

  await prisma.banner.update({
    where: { id: current.id },
    data: { imageKey: key },
  });
  await storage.remove("media", current.imageKey).catch(() => {});

  return listAll();
}

export async function deleteBanner(bannerId: string) {
  const current = await prisma.banner.findUnique({
    where: { id: bannerId },
    select: { id: true, imageKey: true },
  });
  if (!current) throw HttpError.notFound("Banner not found");

  await prisma.banner.delete({ where: { id: current.id } });
  // The object goes with the row — nothing else can reference it.
  await storage.remove("media", current.imageKey).catch(() => {});

  return listAll();
}

export async function reorderBanners(input: BannerOrderInput) {
  const rows = await prisma.banner.findMany({ select: { id: true } });

  const currentIds = new Set(rows.map((r) => r.id));
  const nextIds = new Set(input.bannerIds);
  if (
    currentIds.size !== nextIds.size ||
    [...currentIds].some((id) => !nextIds.has(id))
  ) {
    throw HttpError.badRequest("bannerIds must contain exactly the banner ids");
  }

  await prisma.$transaction(
    input.bannerIds.map((id, index) =>
      prisma.banner.update({ where: { id }, data: { displayOrder: index } }),
    ),
  );

  return listAll();
}

/**
 * Marketplace read: the banners a shopper should actually see, in order.
 * Inactive rows never leave the server, and a link whose target has gone is
 * flattened to `href: null` so the banner renders as a plain image rather than
 * a dead link.
 */
export async function listPublicBanners() {
  const rows = (await prisma.banner.findMany({
    where: { isActive: true },
    select: bannerSelect,
    orderBy: { displayOrder: "asc" },
  })) as BannerRow[];
  const targets = await resolveTargets(rows);
  return rows.map((row) => {
    const shaped = shapeBanner(row, targets);
    return {
      id: shaped.id,
      title: shaped.title,
      imageUrl: shaped.imageUrl,
      href: shaped.target?.href ?? null,
      /** Only a URL banner can leave the site; the client opens it safely. */
      external: row.linkType === "URL",
    };
  });
}
