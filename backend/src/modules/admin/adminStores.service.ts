import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import { buildListMeta } from "../../utils/response.js";
import { mediaUrl } from "../../package/storage/index.js";
import {
  resolveCheckoutFields,
  resolvePayments,
  resolveShipping,
} from "../stores/stores.schema.js";
import { resolveProfile } from "../stores/storeProfile.schema.js";
import { loadReadinessCounts } from "../stores/stores.service.js";
import {
  evaluateReadiness,
  summariseReadiness,
} from "../stores/storeReadiness.js";
import type { Readiness } from "../stores/storeReadiness.js";
import { notify } from "../notifications/notifications.service.js";
import type {
  BankVerificationInput,
  StoreListQuery,
  StoreSuspendInput,
} from "./admin.schema.js";

/**
 * Seller stores, from the platform's side.
 *
 * The admin sees every store — published, draft and suspended — while the
 * owner-facing `modules/stores` sees only their own. The one power the admin
 * has that the owner does not is **suspension**: a moderation switch that
 * takes a store off the marketplace without touching the owner's own
 * publish choice, so lifting it restores exactly what they had.
 */

const listSelect = {
  id: true,
  name: true,
  slug: true,
  logoKey: true,
  // Read only by the readiness evaluation below — the raw profile never
  // reaches the console, which sees the verdict rather than the fields.
  profile: true,
  isPublished: true,
  publishedAt: true,
  suspendedAt: true,
  suspendedReason: true,
  createdAt: true,
  owner: { select: { id: true, name: true, email: true, phone: true } },
  _count: { select: { products: true, categories: true, orders: true } },
} satisfies Prisma.StoreSelect;

type StoreListRow = Prisma.StoreGetPayload<{ select: typeof listSelect }>;

function shapeListRow(row: StoreListRow, revenue: Prisma.Decimal) {
  const { logoKey, profile, _count, ...rest } = row;
  return {
    ...rest,
    logoUrl: mediaUrl("logo", logoKey),
    counts: {
      products: _count.products,
      categories: _count.categories,
      orders: _count.orders,
    },
    revenue,
  };
}

/**
 * Store readiness, from the platform's side.
 *
 * The admin's job here is chasing sellers who have stalled — "who has not
 * finished their business details?" is the console's most common question
 * about a draft store — so every store the console shows carries the same
 * evaluation the seller sees on their own pages. It is computed, never
 * stored, which is why it is assembled per response rather than selected.
 */
async function readinessFor(rows: StoreListRow[]): Promise<Map<string, Readiness>> {
  const counts = await loadReadinessCounts(rows.map((row) => row.id));
  return new Map(
    rows.map((row) => [
      row.id,
      evaluateReadiness({
        name: row.name,
        logoKey: row.logoKey,
        profile: resolveProfile(row.profile),
        ...counts.get(row.id)!,
      }),
    ]),
  );
}

/** Revenue per store for exactly the rows on this page — one extra query. */
async function revenueByStore(storeIds: string[]) {
  if (storeIds.length === 0) return new Map<string, Prisma.Decimal>();
  const grouped = await prisma.order.groupBy({
    by: ["storeId"],
    where: { storeId: { in: storeIds }, status: { not: "CANCELLED" } },
    _sum: { total: true },
  });
  return new Map(
    grouped.map((row) => [row.storeId!, row._sum.total ?? new Prisma.Decimal(0)]),
  );
}

export async function listStores(query: StoreListQuery) {
  const where: Prisma.StoreWhereInput = {};
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { slug: { contains: query.q, mode: "insensitive" } },
      { owner: { email: { contains: query.q, mode: "insensitive" } } },
    ];
  }
  // Suspension outranks the publish flag: a suspended store is not "live"
  // however its owner left the switch, so the filters must not overlap.
  if (query.status === "SUSPENDED") where.suspendedAt = { not: null };
  if (query.status === "PUBLISHED") {
    where.isPublished = true;
    where.suspendedAt = null;
  }
  if (query.status === "DRAFT") {
    where.isPublished = false;
    where.suspendedAt = null;
  }

  const orderBy: Prisma.StoreOrderByWithRelationInput =
    query.sort === "NAME"
      ? { name: "asc" }
      : query.sort === "OLDEST"
        ? { createdAt: "asc" }
        : query.sort === "ORDERS"
          ? { orders: { _count: "desc" } }
          : { createdAt: "desc" };

  /**
   * The setup filter cannot be expressed in SQL — readiness is COMPUTED from
   * the profile JSON plus three aggregate counts, and deliberately not stored
   * (one registry, evaluated everywhere, so it can never go stale). So when
   * it is asked for, the matching set is evaluated and paged in memory rather
   * than pretending a WHERE clause exists.
   *
   * The cost is honest and bounded by the seller count, not the order or
   * product count: `listSelect` per store plus three grouped aggregates. If
   * this platform ever carries tens of thousands of sellers, the fix is a
   * denormalised `setupCompleteAt` column maintained on profile writes —
   * NOT a second copy of the rules here.
   */
  if (query.setup) {
    const all = await prisma.store.findMany({ where, orderBy, select: listSelect });
    const readiness = await readinessFor(all);
    const matching = all.filter(
      (row) => readiness.get(row.id)!.complete === (query.setup === "COMPLETE"),
    );
    const page = matching.slice(
      (query.page - 1) * query.pageSize,
      query.page * query.pageSize,
    );
    const revenue = await revenueByStore(page.map((row) => row.id));
    return {
      rows: page.map((row) => ({
        ...shapeListRow(row, revenue.get(row.id) ?? new Prisma.Decimal(0)),
        setup: summariseReadiness(readiness.get(row.id)!),
      })),
      meta: buildListMeta(matching.length, query.page, query.pageSize),
    };
  }

  const [total, rows] = await Promise.all([
    prisma.store.count({ where }),
    prisma.store.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: listSelect,
    }),
  ]);

  const [revenue, readiness] = await Promise.all([
    revenueByStore(rows.map((row) => row.id)),
    readinessFor(rows),
  ]);
  return {
    rows: rows.map((row) => ({
      ...shapeListRow(row, revenue.get(row.id) ?? new Prisma.Decimal(0)),
      setup: summariseReadiness(readiness.get(row.id)!),
    })),
    meta: buildListMeta(total, query.page, query.pageSize),
  };
}

/** One store in full — everything the detail page shows, in one request. */
export async function getStore(storeRef: string) {
  const store = await prisma.store.findFirst({
    where: { OR: [{ id: storeRef }, { slug: storeRef }] },
    select: {
      ...listSelect,
      theme: true,
      payments: true,
      shipping: true,
      checkout: true,
      footer: true,
      updatedAt: true,
      bankAccounts: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          accountHolderName: true,
          accountNumber: true,
          ifsc: true,
          bankName: true,
          branch: true,
          upiId: true,
          isPrimary: true,
          verificationStatus: true,
          verificationMethod: true,
          verificationNote: true,
          verifiedAt: true,
          createdAt: true,
        },
      },
    },
  });
  if (!store) throw HttpError.notFound("Store not found");

  const [readiness, revenue, orderStatus, recentOrders] = await Promise.all([
    readinessFor([store as StoreListRow]),
    prisma.order.aggregate({
      where: { storeId: store.id, status: { not: "CANCELLED" } },
      _sum: { total: true },
    }),
    prisma.order.groupBy({
      by: ["status"],
      where: { storeId: store.id },
      _count: { _all: true },
    }),
    prisma.order.findMany({
      where: { storeId: store.id },
      orderBy: { placedAt: "desc" },
      take: 10,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        customerName: true,
        paymentMethod: true,
        paymentStatus: true,
        total: true,
        placedAt: true,
      },
    }),
  ]);

  const { bankAccounts, theme, payments, shipping, checkout, footer, ...rest } =
    store;
  return {
    ...shapeListRow(rest as StoreListRow, revenue._sum.total ?? new Prisma.Decimal(0)),
    // Both shapes: `setup` so the detail page renders the same chip the list
    // does, and the full evaluation so it can name the individual missing
    // requirements ("Contact email", "PAN") rather than only the step.
    setup: summariseReadiness(readiness.get(store.id)!),
    readiness: readiness.get(store.id)!,
    theme,
    footer,
    // Resolved rather than raw, so the console reads the same effective
    // settings the storefront does — defaults included.
    settings: {
      payments: resolvePayments(payments),
      shipping: resolveShipping(shipping),
      checkout: resolveCheckoutFields(checkout),
    },
    // Account numbers are never shown in full to an admin — the last four
    // are enough to match a seller's support request against a payout.
    bankAccounts: bankAccounts.map(({ accountNumber, ...account }) => ({
      ...account,
      accountNumberLast4: accountNumber.slice(-4),
    })),
    orderStatus: Object.fromEntries(
      orderStatus.map((row) => [row.status, row._count._all]),
    ),
    recentOrders,
  };
}

/**
 * Suspend or restore a store. Suspension hides it from the marketplace and
 * the storefront and blocks new orders (`publicStore.service`), but leaves
 * the owner's management access intact — they need it to fix whatever caused
 * the suspension.
 */
export async function setSuspended(storeRef: string, input: StoreSuspendInput) {
  const store = await prisma.store.findFirst({
    where: { OR: [{ id: storeRef }, { slug: storeRef }] },
    select: { id: true, name: true, suspendedAt: true, ownerId: true },
  });
  if (!store) throw HttpError.notFound("Store not found");

  const alreadySuspended = store.suspendedAt !== null;
  if (alreadySuspended === input.suspended) {
    throw HttpError.conflict(
      input.suspended
        ? "This store is already suspended"
        : "This store is not suspended",
    );
  }

  await prisma.store.update({
    where: { id: store.id },
    data: input.suspended
      ? { suspendedAt: new Date(), suspendedReason: input.reason ?? null }
      : { suspendedAt: null, suspendedReason: null },
  });

  notify({
    principalType: "CUSTOMER",
    principalId: store.ownerId,
    kind: "STORE",
    title: input.suspended ? "Store suspended" : "Store restored",
    body: input.suspended
      ? `"${store.name}" has been suspended and is no longer visible to customers.`
      : `"${store.name}" is live again.`,
    url: `/stores/${store.id}`,
  });

  return getStore(store.id);
}

/**
 * Manual payout-account verification — the `MANUAL` half of the two
 * verification methods the schema provisions (the other being a third-party
 * account validator). Recording WHO verified is the point: money moves to
 * this account, so the decision must be attributable.
 */
export async function setBankVerification(
  storeRef: string,
  accountId: string,
  adminId: string,
  input: BankVerificationInput,
) {
  const store = await prisma.store.findFirst({
    where: { OR: [{ id: storeRef }, { slug: storeRef }] },
    select: { id: true, name: true, ownerId: true },
  });
  if (!store) throw HttpError.notFound("Store not found");

  const account = await prisma.storeBankAccount.findFirst({
    where: { id: accountId, storeId: store.id },
    select: { id: true, bankName: true, accountNumber: true },
  });
  if (!account) throw HttpError.notFound("Bank account not found");

  if (input.status === "FAILED" && !input.note?.trim()) {
    // A failure the seller can't act on is worse than no answer.
    throw HttpError.badRequest("Add a note explaining why verification failed");
  }

  await prisma.storeBankAccount.update({
    where: { id: account.id },
    data: {
      verificationStatus: input.status,
      verificationMethod: input.status === "PENDING" ? null : "MANUAL",
      verificationNote: input.note ?? null,
      verifiedAt: input.status === "VERIFIED" ? new Date() : null,
      verifiedBy: input.status === "PENDING" ? null : adminId,
    },
  });

  if (input.status !== "PENDING") {
    notify({
      principalType: "CUSTOMER",
      principalId: store.ownerId,
      kind: "ACCOUNT",
      title:
        input.status === "VERIFIED"
          ? "Payout account verified"
          : "Payout account verification failed",
      body: `${account.bankName} ····${account.accountNumber.slice(-4)} — ${
        input.status === "VERIFIED"
          ? "payouts can now be settled to this account."
          : (input.note ?? "please check the details and try again.")
      }`,
      url: `/stores/${store.id}/bank`,
    });
  }

  return getStore(store.id);
}
