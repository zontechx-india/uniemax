import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import type { CartLineStatus } from "../../generated/prisma/client.js";
import { mediaUrl } from "../../package/storage/index.js";
import { HttpError } from "../../utils/httpError.js";
import { MAX_CART_LINES } from "./cart.schema.js";
import type { CartLineInput, CartMergeInput, CartReplaceInput } from "./cart.schema.js";

/**
 * The signed-in customer's durable cart.
 *
 * Division of labour with the browser: localStorage is the HOT path (instant
 * taps, guests, offline) and this is the DURABLE one (other devices, a
 * cleared browser, abandoned-cart recovery). The client mirrors its cart here
 * with `replaceCart` and re-hydrates from `getCart`; `mergeCart` reconciles
 * the two exactly once, at sign-in.
 *
 * Two invariants hold everywhere below:
 *
 *  1. **Money is never read from this table.** Prices, stock and totals are
 *     resolved from the live catalog on every read, and checkout re-prices
 *     independently. A cart row is a reference, a quantity and an intent.
 *  2. **A line always points at a real variant.** The variant is the unit of
 *     sale, so `variantId: null` (an option-less product) resolves to that
 *     product's implicit `isDefault` variant on the way in and is emitted as
 *     null again on the way out — the storefront's line identity is unchanged
 *     by this table existing.
 */

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const cartLineSelect = {
  id: true,
  quantity: true,
  status: true,
  priceAtAdd: true,
  metadata: true,
  createdAt: true,
  store: { select: { slug: true, name: true, isPublished: true } },
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      priceMin: true,
      category: {
        select: { isActive: true, parent: { select: { isActive: true } } },
      },
      // Cover image only — the lowest displayOrder, exactly as the public
      // product endpoints pick it, so a cart thumbnail always matches the
      // storefront's.
      media: {
        where: { type: "IMAGE" as const },
        orderBy: [{ displayOrder: "asc" as const }, { createdAt: "asc" as const }],
        take: 1,
        select: { key: true },
      },
    },
  },
  variant: {
    select: {
      id: true,
      name: true,
      price: true,
      stockQuantity: true,
      isActive: true,
      isDefault: true,
    },
  },
} satisfies Prisma.CartLineSelect;

type CartLineRow = Prisma.CartLineGetPayload<{ select: typeof cartLineSelect }>;

/**
 * Why a line cannot be bought right now, or null when it can. The storefront
 * only needs the `stockQuantity: 0` convention it already understands, but
 * naming the cause is what lets a future cart say "this store closed" instead
 * of the misleading "out of stock".
 */
export type CartLineUnavailable =
  | "STORE_UNAVAILABLE"
  | "PRODUCT_UNAVAILABLE"
  | "VARIANT_UNAVAILABLE"
  | "OUT_OF_STOCK";

/**
 * Mirrors `PUBLIC_PRODUCT_VISIBILITY` (publicStore.service.ts) row-wise: a
 * cart holds specific ids, so it filters in memory rather than in SQL, but
 * the RULE must stay identical — a product hidden from the storefront is not
 * buyable from the cart either.
 */
function unavailableReason(row: CartLineRow): CartLineUnavailable | null {
  if (!row.store.isPublished) return "STORE_UNAVAILABLE";
  const { product } = row;
  const categoryActive =
    product.category.isActive &&
    (product.category.parent === null || product.category.parent.isActive);
  if (!product.isActive || product.priceMin === null || !categoryActive) {
    return "PRODUCT_UNAVAILABLE";
  }
  if (!row.variant.isActive) return "VARIANT_UNAVAILABLE";
  if (row.variant.stockQuantity <= 0) return "OUT_OF_STOCK";
  return null;
}

function shapeLine(row: CartLineRow) {
  const unavailable = unavailableReason(row);
  return {
    id: row.id,
    storeSlug: row.store.slug,
    storeName: row.store.name,
    productId: row.product.id,
    productSlug: row.product.slug,
    name: row.product.name,
    /** Null for the implicit default variant — see the module note. */
    variantId: row.variant.isDefault ? null : row.variant.id,
    variantName: row.variant.isDefault ? null : row.variant.name,
    imageUrl: mediaUrl("media", row.product.media[0]?.key ?? null),
    /** Live catalog price (Decimal → JSON string), never a stored one. */
    price: row.variant.price,
    /**
     * Zero for anything unbuyable, whatever the cause. The storefront already
     * treats "stock 0" as "show it, don't count it, don't check it out", so an
     * unpublished store and a sold-out variant need no separate handling;
     * `unavailableReason` carries the distinction for UI that wants it.
     */
    stockQuantity: unavailable === null ? row.variant.stockQuantity : 0,
    quantity: row.quantity,
    status: row.status,
    /** What it cost when it was added — for "cheaper now" hints only. */
    priceAtAdd: row.priceAtAdd,
    unavailableReason: unavailable,
    metadata: row.metadata,
    addedAt: row.createdAt,
  };
}

async function readCart(customerId: string) {
  const cart = await prisma.cart.findUnique({
    where: { customerId },
    select: {
      updatedAt: true,
      metadata: true,
      lines: {
        select: cartLineSelect,
        // Oldest first: the cart reads in the order things were added, and
        // `groupByStore` on the client preserves first-seen store order.
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return {
    lines: cart ? cart.lines.map(shapeLine) : [],
    metadata: cart?.metadata ?? null,
    /** Lets a client detect that another device moved the cart on. */
    updatedAt: cart?.updatedAt ?? null,
  };
}

/** The customer's cart, priced and captioned from the live catalog. */
export async function getCart(customerId: string) {
  return readCart(customerId);
}

// ---------------------------------------------------------------------------
// Resolving client lines to real variants
// ---------------------------------------------------------------------------

interface ResolvedLine {
  variantId: string;
  productId: string;
  storeId: string;
  price: Prisma.Decimal;
  quantity: number;
  status: CartLineStatus;
  metadata: Prisma.InputJsonValue | typeof Prisma.DbNull;
}

/**
 * Turn client references into rows we can store, dropping anything that no
 * longer resolves.
 *
 * **Unresolvable lines are skipped, not rejected.** This is a sync endpoint:
 * a tab left open while a seller deletes a product would otherwise fail every
 * write from then on, stranding the cart forever. The response is the
 * authoritative cart, so the client learns exactly what persisted — and the
 * storefront's own revalidation already explains vanished items to the
 * shopper.
 *
 * Duplicates collapse to the LARGEST quantity rather than the sum, so pushing
 * the same cart twice is a no-op. (Two inputs can land on one variant: a
 * simple product sent both as `variantId: null` and by its default id.)
 */
async function resolveLines(inputs: CartLineInput[]): Promise<ResolvedLine[]> {
  if (inputs.length === 0) return [];

  const explicitVariantIds = inputs
    .map((line) => line.variantId)
    .filter((id): id is string => id !== null);
  const defaultProductIds = inputs
    .filter((line) => line.variantId === null)
    .map((line) => line.productId);

  const or: Prisma.StoreProductVariantWhereInput[] = [];
  if (explicitVariantIds.length > 0) or.push({ id: { in: explicitVariantIds } });
  if (defaultProductIds.length > 0) {
    or.push({ productId: { in: defaultProductIds }, isDefault: true });
  }

  const variants = await prisma.storeProductVariant.findMany({
    where: { OR: or },
    select: {
      id: true,
      productId: true,
      price: true,
      isDefault: true,
      product: { select: { storeId: true } },
    },
  });

  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  const defaultByProduct = new Map(
    variants.filter((v) => v.isDefault).map((v) => [v.productId, v]),
  );

  const resolved = new Map<string, ResolvedLine>();
  for (const line of inputs) {
    const variant =
      line.variantId === null
        ? defaultByProduct.get(line.productId)
        : byId.get(line.variantId);
    // Gone, or a variant that belongs to a different product than the client
    // claimed — either way there is nothing here to buy.
    if (!variant || variant.productId !== line.productId) continue;

    const existing = resolved.get(variant.id);
    if (existing) {
      existing.quantity = Math.max(existing.quantity, line.quantity);
      continue;
    }
    resolved.set(variant.id, {
      variantId: variant.id,
      productId: variant.productId,
      storeId: variant.product.storeId,
      price: variant.price,
      quantity: line.quantity,
      status: line.status,
      metadata: (line.metadata ?? Prisma.DbNull) as
        | Prisma.InputJsonValue
        | typeof Prisma.DbNull,
    });
  }
  return [...resolved.values()];
}

/** The cart row for this customer, created on first write. */
async function ensureCart(
  tx: Prisma.TransactionClient,
  customerId: string,
  metadata: Prisma.InputJsonValue | typeof Prisma.DbNull,
) {
  return tx.cart.upsert({
    where: { customerId },
    create: { customerId, metadata },
    update: { metadata },
    select: { id: true },
  });
}

function toJsonInput(
  value: Record<string, unknown> | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null
    ? Prisma.DbNull
    : (value as Prisma.InputJsonValue);
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Replace the stored cart with exactly these lines — the routine mirror of
 * the browser's cart. Lines the client did not send are deleted; lines it did
 * keep their original `priceAtAdd` and `createdAt`, so "cheaper since you
 * added it" and the cart's ordering both survive every sync.
 */
export async function replaceCart(customerId: string, input: CartReplaceInput) {
  const lines = await resolveLines(input.lines);

  await prisma.$transaction(async (tx) => {
    const cart = await ensureCart(tx, customerId, toJsonInput(input.metadata));
    await tx.cartLine.deleteMany({
      where: {
        cartId: cart.id,
        ...(lines.length > 0
          ? { variantId: { notIn: lines.map((line) => line.variantId) } }
          : {}),
      },
    });
    for (const line of lines) {
      await upsertLine(tx, cart.id, line, line.quantity);
    }
  });

  return readCart(customerId);
}

/**
 * Union these lines into the stored cart — the sign-in reconciliation.
 *
 * Quantities are the LARGER of the two sides, never the sum: signing out and
 * straight back in pushes the same cart the account already holds, and that
 * must not silently double every line. Lines only the account knows about are
 * left alone, which is the whole point of merging instead of replacing.
 *
 * Overflow past `MAX_CART_LINES` drops the excess INCOMING lines rather than
 * failing: a sign-in must not be blocked by a full cart, and the account's
 * own cart is the side with the better claim to being kept.
 */
export async function mergeCart(customerId: string, input: CartMergeInput) {
  const incoming = await resolveLines(input.lines);

  await prisma.$transaction(async (tx) => {
    const cart = await ensureCart(tx, customerId, toJsonInput(input.metadata));
    const existing = await tx.cartLine.findMany({
      where: { cartId: cart.id },
      select: { variantId: true, quantity: true },
    });
    const existingQty = new Map(existing.map((l) => [l.variantId, l.quantity]));

    let room = MAX_CART_LINES - existing.length;
    for (const line of incoming) {
      const current = existingQty.get(line.variantId);
      if (current === undefined) {
        if (room <= 0) continue;
        room -= 1;
      }
      await upsertLine(
        tx,
        cart.id,
        line,
        Math.max(line.quantity, current ?? 0),
      );
    }
  });

  return readCart(customerId);
}

/**
 * Write one line. `priceAtAdd` is set on CREATE only — it answers "what did
 * this cost when the shopper decided to buy it", which a later sync must not
 * quietly redefine to "what did it cost at the last sync".
 */
function upsertLine(
  tx: Prisma.TransactionClient,
  cartId: string,
  line: ResolvedLine,
  quantity: number,
) {
  return tx.cartLine.upsert({
    where: { cartId_variantId: { cartId, variantId: line.variantId } },
    create: {
      cartId,
      storeId: line.storeId,
      productId: line.productId,
      variantId: line.variantId,
      quantity,
      status: line.status,
      priceAtAdd: line.price,
      metadata: line.metadata,
    },
    update: {
      quantity,
      status: line.status,
      metadata: line.metadata,
    },
    select: { id: true },
  });
}

/** Empty the cart (every store). Idempotent — an absent cart is success. */
export async function clearCart(customerId: string) {
  await prisma.cartLine.deleteMany({ where: { cart: { customerId } } });
  return readCart(customerId);
}

/**
 * Drop every line belonging to one store — what an order placement means for
 * the cart it came from.
 *
 * Called from the order service after a successful placement (by store id, no
 * slug lookup) so the basket empties on EVERY device the customer is signed
 * in on, not just the tab that checked out. Best-effort by contract: the
 * caller must never fail a paid order because a cart could not be tidied.
 */
export async function clearStoreLines(customerId: string, storeId: string) {
  await prisma.cartLine.deleteMany({
    where: { cart: { customerId }, storeId },
  });
}

/**
 * Guard for a store-scoped clear requested by a client: the slug must belong
 * to a real store. Kept beside the operation it protects so the controller
 * stays a thin parser.
 */
export async function clearStoreBySlug(customerId: string, slug: string) {
  const store = await prisma.store.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!store) throw HttpError.notFound("Store not found");
  await clearStoreLines(customerId, store.id);
  return readCart(customerId);
}
