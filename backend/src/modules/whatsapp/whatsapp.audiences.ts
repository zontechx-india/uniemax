import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { resolveProfile } from "../stores/storeProfile.schema.js";
import { evaluateReadiness } from "../stores/storeReadiness.js";
import { loadReadinessCounts } from "../stores/stores.service.js";
import type { Audience, RetargetFilter, SegmentDefinition, SellerFilters } from "./whatsapp.schema.js";
import { toWaId } from "./whatsapp.webhook.js";

/**
 * Audiences — who a campaign or a segment is for, resolved from the
 * platform's own data at the moment it is used (never a stale copy).
 *
 *   - **sellers**: one member per store (suspended stores never), reached on
 *     the store's contact phone or else the owner's login phone, with the
 *     store's live setup state, product and order counts as fields;
 *   - **contacts**: WhatsApp contacts by tag and consent;
 *   - **segment**: a saved sellers/contacts definition;
 *   - **campaign**: retargeting — an earlier campaign's recipients, by what
 *     happened to their message (not read, clicked, replied…);
 *   - **list**: pasted or uploaded rows, each column a field.
 *
 * A number appearing twice (two stores, one owner) is kept once — the first.
 */

export interface AudienceMember {
  waId: string;
  name: string | null;
  storeId: string | null;
  fields: Record<string, string>;
}

export interface ResolvedAudience {
  members: AudienceMember[];
  /** Rows with no usable WhatsApp number. */
  invalid: number;
  /** Rows dropped because the number was already in. */
  duplicates: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Where message links point. PUBLIC_WEB_URL on the server, else production. */
export const siteUrl = () =>
  (process.env["PUBLIC_WEB_URL"]?.trim() || "https://uniemax.com").replace(/\/+$/, "");

/** "+919876543210" for a field; Meta's wa_id is the same digits. */
const plusPhone = (waId: string) => `+${waId}`;

function collect(
  rows: { phone: string | null | undefined; altPhone?: string | null | undefined; member: Omit<AudienceMember, "waId"> }[],
): ResolvedAudience {
  const seen = new Set<string>();
  const members: AudienceMember[] = [];
  let invalid = 0;
  let duplicates = 0;
  for (const row of rows) {
    const waId =
      (row.phone ? toWaId(row.phone) : null) ?? (row.altPhone ? toWaId(row.altPhone) : null);
    if (!waId) {
      invalid += 1;
      continue;
    }
    if (seen.has(waId)) {
      duplicates += 1;
      continue;
    }
    seen.add(waId);
    members.push({ ...row.member, waId, fields: { ...row.member.fields, phone: plusPhone(waId) } });
  }
  return { members, invalid, duplicates };
}

// ---- Sellers -----------------------------------------------------------------

/**
 * Every live (not suspended) store with what the filters and fields need.
 * Readiness is computed, not stored, so it is evaluated here in memory —
 * bounded by the number of sellers, like the admin store list's setup filter.
 */
export async function loadSellers(filters: SellerFilters, storeIds?: string[]) {
  const ids = storeIds ?? filters.storeIds;
  const stores = await prisma.store.findMany({
    where: {
      suspendedAt: null,
      ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
      ...(filters.published !== undefined ? { isPublished: filters.published } : {}),
      ...(filters.joinedWithinDays
        ? { createdAt: { gte: new Date(Date.now() - filters.joinedWithinDays * DAY_MS) } }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      logoKey: true,
      profile: true,
      isPublished: true,
      publishedAt: true,
      createdAt: true,
      owner: { select: { name: true, phone: true } },
    },
  });
  if (stores.length === 0) return [];

  const storeIdList = stores.map((s) => s.id);
  const [counts, orders] = await Promise.all([
    loadReadinessCounts(storeIdList),
    prisma.order.groupBy({
      by: ["storeId"],
      where: { storeId: { in: storeIdList }, status: { not: "CANCELLED" } },
      _count: { _all: true },
      _max: { placedAt: true },
    }),
  ]);
  const orderBy = new Map(orders.map((o) => [o.storeId!, o]));

  return stores.map((store) => {
    const profile = resolveProfile(store.profile);
    const storeCounts = counts.get(store.id)!;
    const readiness = evaluateReadiness({
      name: store.name,
      logoKey: store.logoKey,
      profile,
      ...storeCounts,
    });
    const order = orderBy.get(store.id);
    const percent =
      readiness.totalCount > 0 ? Math.round((readiness.metCount / readiness.totalCount) * 100) : 100;
    const pending = readiness.steps
      .filter((step) => !step.complete && step.totalCount > 0)
      .map((step) => step.title);
    return {
      store,
      profile,
      readiness,
      percent,
      pending,
      productCount: storeCounts.productCount,
      orderCount: order?._count._all ?? 0,
      lastOrderAt: order?._max.placedAt ?? null,
    };
  });
}

export type SellerRow = Awaited<ReturnType<typeof loadSellers>>[number];

/** The fields a seller recipient carries (FIELD_CATALOGUE.sellers). */
export function sellerFields(row: SellerRow): Record<string, string> {
  const site = siteUrl();
  return {
    seller_name: row.profile.sellerName ?? row.store.owner.name ?? "",
    store_name: row.store.name,
    store_slug: row.store.slug,
    store_url: `${site}/store/${row.store.slug}`,
    dashboard_url: `${site}/mystores/${row.store.slug}`,
    setup_percent: `${row.percent}%`,
    pending_steps: row.pending.join(", "),
    product_count: String(row.productCount),
    order_count: String(row.orderCount),
    city: row.profile.address?.city ?? "",
    state: row.profile.address?.state ?? "",
  };
}

function matchesSeller(row: SellerRow, filters: SellerFilters): boolean {
  if (filters.setup === "complete" && !row.readiness.complete) return false;
  if (filters.setup === "incomplete" && row.readiness.complete) return false;
  if (filters.setupBelow !== undefined && row.percent >= filters.setupBelow) return false;
  if (filters.hasProducts === true && row.productCount === 0) return false;
  if (filters.hasProducts === false && row.productCount > 0) return false;
  if (filters.orders === "none" && row.orderCount > 0) return false;
  if (filters.orders === "any" && row.orderCount === 0) return false;
  if (filters.noOrdersInDays !== undefined) {
    const cutoff = Date.now() - filters.noOrdersInDays * DAY_MS;
    if (row.lastOrderAt && row.lastOrderAt.getTime() >= cutoff) return false;
  }
  if (filters.state) {
    const state = row.profile.address?.state?.trim().toLowerCase();
    if (state !== filters.state.trim().toLowerCase()) return false;
  }
  return true;
}

export function sellerMember(row: SellerRow) {
  return {
    phone: row.profile.phone,
    altPhone: row.store.owner.phone,
    member: {
      name: row.profile.sellerName ?? row.store.owner.name ?? null,
      storeId: row.store.id,
      fields: sellerFields(row),
    },
  };
}

async function resolveSellers(filters: SellerFilters): Promise<ResolvedAudience> {
  const rows = (await loadSellers(filters)).filter((row) => matchesSeller(row, filters));
  return collect(rows.map(sellerMember));
}

// ---- Contacts ----------------------------------------------------------------

async function resolveContacts(filters: { tags?: string[] | undefined; optedIn?: boolean | undefined }) {
  const contacts = await prisma.waContact.findMany({
    where: {
      ...(filters.tags && filters.tags.length > 0 ? { tags: { hasSome: filters.tags } } : {}),
      ...(filters.optedIn === true ? { marketingOptInAt: { not: null } } : {}),
      ...(filters.optedIn === false ? { marketingOptInAt: null } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { waId: true, name: true },
  });
  return collect(
    contacts.map((c) => ({
      phone: c.waId,
      member: { name: c.name, storeId: null, fields: { name: c.name ?? "" } },
    })),
  );
}

// ---- Retargeting -------------------------------------------------------------

/** waIds of an earlier campaign's recipients matching `filter`. */
async function retargetWaIds(campaignId: string, filter: RetargetFilter): Promise<Set<string>> {
  const recipients = await prisma.waCampaignRecipient.findMany({
    where: { campaignId, status: { in: ["SENT", "FAILED"] } },
    select: {
      waId: true,
      status: true,
      processedAt: true,
      message: { select: { lastStatus: true } },
    },
  });

  const needsClicks = filter === "clicked" || filter === "not_clicked";
  const clicked = needsClicks
    ? new Set(
        (
          await prisma.waLink.findMany({
            where: { campaignId, clicks: { gt: 0 } },
            select: { waId: true },
          })
        ).flatMap((l) => (l.waId ? [l.waId] : [])),
      )
    : new Set<string>();

  const needsReplies = filter === "replied" || filter === "not_replied";
  const replied = new Set<string>();
  if (needsReplies && recipients.length > 0) {
    const earliest = recipients.reduce(
      (min, r) => (r.processedAt && r.processedAt < min ? r.processedAt : min),
      new Date(),
    );
    const inbound = await prisma.waMessage.findMany({
      where: {
        direction: "IN",
        waId: { in: recipients.map((r) => r.waId) },
        createdAt: { gte: earliest },
      },
      select: { waId: true, createdAt: true },
    });
    const sentAt = new Map(recipients.map((r) => [r.waId, r.processedAt]));
    // A reply counts within 7 days of that person's message.
    for (const m of inbound) {
      const at = sentAt.get(m.waId);
      if (at && m.createdAt >= at && m.createdAt.getTime() - at.getTime() <= 7 * DAY_MS) {
        replied.add(m.waId);
      }
    }
  }

  const out = new Set<string>();
  for (const r of recipients) {
    const status = r.status === "FAILED" ? "failed" : (r.message?.lastStatus ?? "accepted");
    const sent = status !== "failed";
    const keep: Record<RetargetFilter, boolean> = {
      failed: !sent,
      not_delivered: sent && (status === "accepted" || status === "sent"),
      not_read: sent && status !== "read",
      read: status === "read",
      clicked: clicked.has(r.waId),
      not_clicked: sent && !clicked.has(r.waId),
      replied: replied.has(r.waId),
      not_replied: sent && !replied.has(r.waId),
    };
    if (keep[filter]) out.add(r.waId);
  }
  return out;
}

async function resolveRetarget(
  campaignId: string,
  filter: RetargetFilter,
  depth: number,
): Promise<ResolvedAudience> {
  const campaign = await prisma.waCampaign.findUnique({
    where: { id: campaignId },
    select: { audience: true },
  });
  if (!campaign) throw HttpError.notFound("Campaign to retarget not found");
  const keep = await retargetWaIds(campaignId, filter);

  // Rebuild from the original audience so the fields are fresh (a seller's
  // setup % today, not on the day of the first campaign). Campaigns from
  // before audiences were stored fall back to name + phone.
  const original = campaign.audience as Audience | null;
  if (original && depth < 3) {
    const resolved = await resolveAudienceAt(original, depth + 1);
    return {
      members: resolved.members.filter((m) => keep.has(m.waId)),
      invalid: 0,
      duplicates: 0,
    };
  }
  const recipients = await prisma.waCampaignRecipient.findMany({
    where: { campaignId, waId: { in: [...keep] } },
    select: { waId: true, name: true },
  });
  return collect(
    recipients.map((r) => ({
      phone: r.waId,
      member: { name: r.name, storeId: null, fields: { name: r.name ?? "" } },
    })),
  );
}

// ---- Entry points ------------------------------------------------------------

async function resolveAudienceAt(audience: Audience, depth: number): Promise<ResolvedAudience> {
  switch (audience.kind) {
    case "sellers":
      return resolveSellers(audience.filters);
    case "contacts":
      return resolveContacts(audience.filters);
    case "segment": {
      const segment = await prisma.waSegment.findUnique({ where: { id: audience.segmentId } });
      if (!segment) throw HttpError.notFound("Segment not found");
      return resolveAudienceAt(segment.definition as SegmentDefinition, depth);
    }
    case "campaign":
      return resolveRetarget(audience.campaignId, audience.filter, depth);
    case "list":
      return collect(
        audience.rows.map((row) => ({
          phone: row.phone,
          member: { name: row.fields["name"] ?? null, storeId: null, fields: row.fields },
        })),
      );
  }
}

export function resolveAudience(audience: Audience): Promise<ResolvedAudience> {
  return resolveAudienceAt(audience, 0);
}

/** Which field set an audience offers — what the mapping's chips should show. */
export async function audienceFieldKind(audience: Audience): Promise<"sellers" | "contacts" | "list"> {
  switch (audience.kind) {
    case "sellers":
    case "contacts":
    case "list":
      return audience.kind;
    case "segment": {
      const segment = await prisma.waSegment.findUnique({ where: { id: audience.segmentId } });
      return (segment?.definition as SegmentDefinition | undefined)?.kind ?? "contacts";
    }
    case "campaign": {
      const campaign = await prisma.waCampaign.findUnique({
        where: { id: audience.campaignId },
        select: { audience: true },
      });
      const original = campaign?.audience as Audience | null;
      return original ? audienceFieldKind(original) : "contacts";
    }
  }
}

/**
 * The Audiences tab's live count: who is in, how many have consent / sent
 * STOP, and a sample with their fields.
 */
export async function previewAudience(audience: Audience) {
  const resolved = await resolveAudience(audience);
  const waIds = resolved.members.map((m) => m.waId);
  const contacts = waIds.length
    ? await prisma.waContact.findMany({
        where: { waId: { in: waIds } },
        select: { waId: true, optedOut: true, marketingOptInAt: true },
      })
    : [];
  const byId = new Map(contacts.map((c) => [c.waId, c]));
  let optedOut = 0;
  let optedIn = 0;
  for (const id of waIds) {
    const c = byId.get(id);
    if (c?.optedOut) optedOut += 1;
    else if (c?.marketingOptInAt) optedIn += 1;
  }
  return {
    total: resolved.members.length,
    invalid: resolved.invalid,
    duplicates: resolved.duplicates,
    optedOut,
    optedIn,
    fieldKind: await audienceFieldKind(audience),
    sample: resolved.members.slice(0, 20).map((m) => ({
      waId: m.waId,
      name: m.name,
      storeId: m.storeId,
      fields: m.fields,
    })),
  };
}

// ---- Segments ------------------------------------------------------------------

export function listSegments() {
  return prisma.waSegment.findMany({ orderBy: { updatedAt: "desc" } });
}

/** Segments with their current size — each is resolved, so the list is per request. */
export async function listSegmentsWithCounts() {
  const segments = await listSegments();
  return Promise.all(
    segments.map(async (segment) => {
      const resolved = await resolveAudience(segment.definition as SegmentDefinition).catch(
        () => null,
      );
      return { ...segment, count: resolved ? resolved.members.length : null };
    }),
  );
}

export function createSegment(input: { name: string; definition: SegmentDefinition }) {
  return prisma.waSegment.create({
    data: { name: input.name, definition: input.definition },
  });
}

export async function updateSegment(
  id: string,
  input: { name: string; definition: SegmentDefinition },
) {
  const found = await prisma.waSegment.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw HttpError.notFound("Segment not found");
  return prisma.waSegment.update({
    where: { id },
    data: { name: input.name, definition: input.definition },
  });
}

export async function deleteSegment(id: string) {
  const found = await prisma.waSegment.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw HttpError.notFound("Segment not found");
  await prisma.waSegment.delete({ where: { id } });
}

/** Seller search for hand-picking stores into an audience. */
export function searchStores(q: string) {
  return prisma.store.findMany({
    where: {
      suspendedAt: null,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { slug: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 20,
    select: { id: true, name: true, slug: true, isPublished: true },
  });
}
