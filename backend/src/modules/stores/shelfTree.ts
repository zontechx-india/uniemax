import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { MAX_CATEGORY_DEPTH } from "../category/categoryTree.js";

/**
 * A store's shelves as a tree of any depth.
 *
 * Shelves mirror the global taxonomy, so they nest as deep as an admin nests
 * the taxonomy (`MAX_CATEGORY_DEPTH`). A store has tens of shelves, so every
 * tree question is answered from one query and a little memory rather than
 * recursive SQL — the same approach as `categoryTree.ts`.
 */

export const shelfSelect = {
  id: true,
  name: true,
  slug: true,
  parentId: true,
  isActive: true,
  isFeatured: true,
  sortOrder: true,
  createdAt: true,
  categoryId: true,
} satisfies Prisma.StoreCategorySelect;

export type Shelf = Prisma.StoreCategoryGetPayload<{ select: typeof shelfSelect }>;

/** Seller-set order first; ties keep creation order. */
export function loadShelves(storeId: string): Promise<Shelf[]> {
  return prisma.storeCategory.findMany({
    where: { storeId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: shelfSelect,
  });
}

type TreeRow = { id: string; parentId: string | null; isActive: boolean };

export function shelfIndex<S extends TreeRow>(rows: S[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const kids = new Map<string | null, S[]>();
  for (const row of rows) {
    const bucket = kids.get(row.parentId);
    if (bucket) bucket.push(row);
    else kids.set(row.parentId, [row]);
  }

  const childrenOf = (parentId: string | null): S[] => kids.get(parentId) ?? [];

  /** Root first, the shelf itself last. */
  const pathOf = (id: string): S[] => {
    const path: S[] = [];
    const guard = new Set<string>();
    let cursor = byId.get(id);
    while (cursor && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      path.unshift(cursor);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return path;
  };

  /** The shelf and everything beneath it. */
  const descendantIds = (id: string): string[] => [
    id,
    ...childrenOf(id).flatMap((child) => descendantIds(child.id)),
  ];

  /** Active with every ancestor active — what the storefront may show. */
  const visible = (id: string): boolean => {
    const path = pathOf(id);
    return path.length > 0 && path[0]!.parentId === null && path.every((s) => s.isActive);
  };

  return { byId, childrenOf, pathOf, descendantIds, visible };
}

/**
 * Prisma filter: the shelf and every ancestor are active. Shelves nest at
 * most `MAX_CATEGORY_DEPTH` levels, so a fixed nesting of `parent` filters
 * covers the whole chain — which is what lets cross-store queries (discovery,
 * product visibility) express the rule without loading trees.
 */
export function activeShelfChain(levels = MAX_CATEGORY_DEPTH): Prisma.StoreCategoryWhereInput {
  if (levels <= 1) return { isActive: true };
  return {
    isActive: true,
    OR: [{ parentId: null }, { parent: activeShelfChain(levels - 1) }],
  };
}
