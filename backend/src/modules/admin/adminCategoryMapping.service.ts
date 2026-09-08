import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import { buildListMeta } from "../../utils/response.js";
import { getCategoryPath } from "../category/categoryTree.js";
import type { ShelfListQuery, ShelfMappingInput } from "./admin.schema.js";

/**
 * Mapping sellers' SHELVES onto the global category taxonomy.
 *
 * Every shelf created since the taxonomy landed is classified by construction
 * — the seller picks a category rather than typing one. What this module
 * exists for is the shelves that predate that rule: free text a seller once
 * typed, which is often a brand ("KTM"), a vehicle model ("Duke 200") or a
 * merchandising tier ("Pro Edition") rather than a category at all.
 *
 * Those cannot be mapped automatically without guessing, so an admin decides
 * one shelf at a time. Mapping is deliberately reversible (clear it and the
 * shelf is unclassified again) and never touches the shelf's NAME: the
 * seller's storefront navigation is theirs, and rewriting it would rebuild
 * their shop out from under them.
 */

const shelfSelect = {
  id: true,
  name: true,
  slug: true,
  isActive: true,
  categoryId: true,
  parent: { select: { id: true, name: true } },
  store: { select: { id: true, name: true, slug: true } },
  _count: { select: { products: true, children: true } },
} satisfies Prisma.StoreCategorySelect;

type ShelfRow = Prisma.StoreCategoryGetPayload<{ select: typeof shelfSelect }>;

async function shape(row: ShelfRow) {
  // activeOnly: false — a shelf mapped before an admin retired that node must
  // still show what it points at rather than reading as unmapped.
  const node = row.categoryId
    ? await getCategoryPath(row.categoryId, false)
    : null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isActive: row.isActive,
    /** "KTM › Duke 200" — the shelf as the seller sees it in their own shop. */
    shelfPath: row.parent ? `${row.parent.name} › ${row.name}` : row.name,
    isSubcategory: row.parent !== null,
    store: row.store,
    productCount: row._count.products,
    subcategoryCount: row._count.children,
    categoryId: row.categoryId,
    category: node
      ? { id: node.id, name: node.name, pathLabel: node.pathLabel }
      : null,
  };
}

export async function listShelves(query: ShelfListQuery) {
  const where: Prisma.StoreCategoryWhereInput = {};
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { store: { name: { contains: query.q, mode: "insensitive" } } },
    ];
  }
  if (query.storeId) where.storeId = query.storeId;
  if (query.status === "UNMAPPED") where.categoryId = null;
  if (query.status === "MAPPED") where.categoryId = { not: null };

  const [total, rows] = await Promise.all([
    prisma.storeCategory.count({ where }),
    prisma.storeCategory.findMany({
      where,
      // Grouped by shop, then roots before their own subcategories, so the
      // list reads the way the seller's catalog is actually shaped.
      orderBy: [
        { store: { name: "asc" } },
        { parentId: { sort: "asc", nulls: "first" } },
        { name: "asc" },
      ],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: shelfSelect,
    }),
  ]);

  return {
    rows: await Promise.all(rows.map(shape)),
    meta: buildListMeta(total, query.page, query.pageSize),
  };
}

/**
 * Point one shelf at a taxonomy node, or clear it with `categoryId: null`.
 *
 * `applyToProducts` also re-files the products sitting directly on the shelf,
 * which is the reason an admin is here at all: a shelf is only worth mapping
 * because it makes the products under it findable platform-wide. It is opt-out
 * rather than automatic so that a shelf whose products were already classified
 * by hand can be mapped without undoing that work.
 */
export async function setShelfCategory(
  shelfId: string,
  input: ShelfMappingInput,
) {
  const shelf = await prisma.storeCategory.findUnique({
    where: { id: shelfId },
    select: { id: true, name: true, store: { select: { name: true } } },
  });
  if (!shelf) throw HttpError.notFound("Store category not found");

  if (input.categoryId) {
    const node = await getCategoryPath(input.categoryId, false);
    if (!node) throw HttpError.badRequest("Selected category was not found");
  }

  // One transaction: a shelf must never end up pointing somewhere its own
  // products do not.
  const productsUpdated = await prisma.$transaction(async (tx) => {
    await tx.storeCategory.update({
      where: { id: shelfId },
      data: { categoryId: input.categoryId },
    });
    if (!input.applyToProducts) return 0;
    const { count } = await tx.storeProduct.updateMany({
      where: { categoryId: shelfId },
      data: { globalCategoryId: input.categoryId },
    });
    return count;
  });

  const row = await prisma.storeCategory.findUniqueOrThrow({
    where: { id: shelfId },
    select: shelfSelect,
  });
  return { shelf: await shape(row), productsUpdated };
}
