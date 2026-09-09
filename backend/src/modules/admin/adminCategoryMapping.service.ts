import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import { buildListMeta } from "../../utils/response.js";
import { getCategoryPath } from "../category/categoryTree.js";
import type { CategoryCrumb, CategoryNode } from "../category/categoryTree.js";
import { uniqueCategorySlug } from "../stores/catalogSlug.js";
import { loadShelves, shelfIndex } from "../stores/shelfTree.js";
import type { Shelf } from "../stores/shelfTree.js";
import type { ShelfListQuery } from "./admin.schema.js";

/**
 * CONVERTING sellers' typed shelves into platform categories.
 *
 * Every shelf created since the taxonomy landed is a platform category by
 * construction — the seller picks one rather than typing a name. What this
 * module exists for is the shelves that predate that rule: free text a seller
 * once typed ("Bag", "Cricket Bats", "KTM"). The goal is to make those go
 * away, so converting a shelf REPLACES it: the row is renamed and re-parented
 * to match the chosen node, its products move with it, and if the store
 * already holds that node the legacy shelf is merged into it and deleted.
 *
 * Conversion is one-way. A merge cannot be un-merged, so there is no unmap;
 * instead every conversion is planned first (`planConversion`) and the
 * console shows that plan before anything is written.
 */

const shelfSelect = {
  id: true,
  name: true,
  slug: true,
  parentId: true,
  storeId: true,
  isActive: true,
  categoryId: true,
  parent: { select: { id: true, name: true, categoryId: true } },
  store: { select: { id: true, name: true, slug: true } },
  _count: { select: { products: true, children: true } },
} satisfies Prisma.StoreCategorySelect;

type ShelfRow = Prisma.StoreCategoryGetPayload<{ select: typeof shelfSelect }>;

/**
 * unmapped  — no taxonomy link at all (typed, never touched)
 * tagged    — linked by the earlier bulk migration, but still wearing its
 *             typed name / sitting in its typed position: half-converted
 * converted — name and position both match the platform node
 */
export type ShelfState = "unmapped" | "tagged" | "converted";

function stateOf(row: ShelfRow, node: CategoryNode | null): ShelfState {
  if (!row.categoryId || !node) return "unmapped";
  const nameMatches = row.name === node.name;
  const placeMatches = node.parentId
    ? row.parent?.categoryId === node.parentId
    : row.parentId === null;
  return nameMatches && placeMatches ? "converted" : "tagged";
}

const PATH_SEPARATOR = " › ";

async function shape(row: ShelfRow, shelfPath: string) {
  // activeOnly: false — a shelf linked to a node an admin later disabled must
  // still show what it points at rather than reading as unmapped.
  const node = row.categoryId
    ? await getCategoryPath(row.categoryId, false)
    : null;
  const state = stateOf(row, node);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isActive: row.isActive,
    /** "KTM › Duke 200" — the shelf as the seller sees it in their own shop. */
    shelfPath,
    isSubcategory: row.parent !== null,
    store: row.store,
    productCount: row._count.products,
    subcategoryCount: row._count.children,
    categoryId: row.categoryId,
    category: node
      ? { id: node.id, name: node.name, pathLabel: node.pathLabel }
      : null,
    state,
    converted: state === "converted",
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

  // "Converted" is name-and-position-match against another table, which no
  // where-clause can express, so the status filter runs in memory. A platform
  // has tens of shelves per store, not millions; this is fine.
  const rows = await prisma.storeCategory.findMany({
    where,
    // Grouped by shop, then roots before their own subcategories, so the
    // list reads the way the seller's catalog is actually shaped.
    orderBy: [
      { store: { name: "asc" } },
      { parentId: { sort: "asc", nulls: "first" } },
      { name: "asc" },
    ],
    select: shelfSelect,
  });
  // A search narrows the rows, so ancestors may be missing from them; the
  // path is read from the full set so it never truncates.
  const all = query.q ? await prisma.storeCategory.findMany({ select: shelfSelect }) : rows;
  const idx = shelfIndex(all);
  const pathOf = (id: string) => idx.pathOf(id).map((s) => s.name).join(PATH_SEPARATOR);
  const shaped = await Promise.all(rows.map((row) => shape(row, pathOf(row.id))));
  const filtered =
    query.status === "PENDING"
      ? shaped.filter((s) => !s.converted)
      : query.status === "CONVERTED"
        ? shaped.filter((s) => s.converted)
        : shaped;

  const start = (query.page - 1) * query.pageSize;
  return {
    rows: filtered.slice(start, start + query.pageSize),
    meta: buildListMeta(filtered.length, query.page, query.pageSize),
  };
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

export interface ConversionPlan {
  /** rename = this row becomes the category; merge = it folds into one that already stands for it. */
  action: "rename" | "merge";
  /** Set when the conversion must not run — the reason, in the admin's words. */
  blocked: string | null;
  from: { name: string; shelfPath: string; productCount: number; subcategoryCount: number };
  to: { name: string; pathLabel: string };
  /** The chain of shelves a converted shelf lands under; `created` when any of them does not exist yet. */
  parent: { name: string; created: boolean } | null;
  mergeInto: { id: string; name: string } | null;
  productsMoved: number;
  nameChanges: boolean;
}

/** One ancestor shelf, root downwards: reused, adopted from an untagged twin, or created. */
type ParentStep =
  | { kind: "existing"; id: string; name: string }
  | { kind: "adopt"; id: string; name: string; nodeId: string }
  | { kind: "create"; node: CategoryCrumb };

interface Resolved {
  shelf: ShelfRow;
  node: CategoryNode;
  plan: ConversionPlan;
  parents: ParentStep[];
  /** Merge target, and whether it must first be linked to the node. */
  target: { id: string; adopt: boolean } | null;
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

async function resolve(shelfId: string, nodeId: string): Promise<Resolved> {
  const shelf = await prisma.storeCategory.findUnique({
    where: { id: shelfId },
    select: shelfSelect,
  });
  if (!shelf) throw HttpError.notFound("Store category not found");

  // activeOnly: false — an admin may legitimately file a shelf under a
  // category that is currently retired.
  const node = await getCategoryPath(nodeId, false);
  if (!node) throw HttpError.badRequest("Selected category was not found");

  const shelves = await loadShelves(shelf.storeId);
  const idx = shelfIndex(shelves);
  const others = shelves.filter((s) => s.id !== shelf.id);

  const plan: ConversionPlan = {
    action: "rename",
    blocked: null,
    from: {
      name: shelf.name,
      shelfPath: idx.pathOf(shelf.id).map((s) => s.name).join(PATH_SEPARATOR),
      productCount: shelf._count.products,
      subcategoryCount: shelf._count.children,
    },
    to: { name: node.name, pathLabel: node.pathLabel },
    parent: null,
    mergeInto: null,
    productsMoved: shelf._count.products,
    nameChanges: shelf.name !== node.name,
  };
  const out: Resolved = { shelf, node, plan, parents: [], target: null };

  if (stateOf(shelf, node) === "converted") {
    plan.blocked = `Already converted to ${node.pathLabel}.`;
    return out;
  }
  // A shelf cannot become a descendant of the node it already is: its own row
  // would have to be duplicated above itself.
  if (shelf.categoryId && node.path.slice(0, -1).some((c) => c.id === shelf.categoryId)) {
    plan.blocked = `"${shelf.name}" already is ${node.path.find((c) => c.id === shelf.categoryId)?.name}. Add "${node.name}" as a new subcategory in the store instead.`;
    return out;
  }

  // --- the chain of ancestors the converted shelf lands under --------------
  let parentShelfId: string | null = null;
  let creating = false;
  for (const crumb of node.path.slice(0, -1)) {
    if (creating) {
      out.parents.push({ kind: "create", node: crumb });
      continue;
    }
    const existing = others.find((s) => s.categoryId === crumb.id);
    if (existing) {
      out.parents.push({ kind: "existing", id: existing.id, name: existing.name });
      parentShelfId = existing.id;
      continue;
    }
    // An untagged shelf the seller typed with the same name in the same place
    // IS this ancestor; adopt it rather than standing a twin next to it.
    const adoptable = others.find(
      (s) => s.parentId === parentShelfId && s.categoryId === null && sameName(s.name, crumb.name),
    );
    if (adoptable) {
      out.parents.push({ kind: "adopt", id: adoptable.id, name: adoptable.name, nodeId: crumb.id });
      parentShelfId = adoptable.id;
      continue;
    }
    out.parents.push({ kind: "create", node: crumb });
    creating = true;
    parentShelfId = null;
  }
  if (out.parents.length > 0) {
    plan.parent = {
      name: out.parents
        .map((step) => (step.kind === "create" ? step.node.name : step.name))
        .join(PATH_SEPARATOR),
      created: creating,
    };
  }

  // --- does something already stand for this node? → merge ---------------
  let target: Shelf | null = others.find((s) => s.categoryId === node.id) ?? null;
  let adoptTarget = false;
  if (!target && !creating) {
    // Same name, same position, never linked: that shelf is this category in
    // all but the link, so it becomes the merge target rather than a clash.
    target =
      others.find(
        (s) => s.parentId === parentShelfId && s.categoryId === null && sameName(s.name, node.name),
      ) ?? null;
    adoptTarget = target !== null;
  }

  if (target) {
    plan.action = "merge";
    plan.mergeInto = { id: target.id, name: target.name };
    out.target = { id: target.id, adopt: adoptTarget };

    // Subcategories move onto the target too, so no two may share a name.
    const theirs = idx.childrenOf(target.id);
    const clash = idx.childrenOf(shelf.id).find((mine) => theirs.some((t) => sameName(t.name, mine.name)));
    if (clash) {
      plan.blocked = `Both "${shelf.name}" and "${target.name}" have a subcategory called "${clash.name}". Convert that one first.`;
    }
    return out;
  }

  // --- plain rename: the name must be free among its new siblings ----------
  if (!creating) {
    const clash = others.find((s) => s.parentId === parentShelfId && sameName(s.name, node.name));
    if (clash) {
      plan.blocked = `This store already has a shelf called "${clash.name}" there${
        clash.categoryId ? ", linked to a different category" : ""
      }. Convert that one first.`;
    }
  }
  return out;
}

/** What `convertShelf` would do, without doing it. */
export async function planConversion(shelfId: string, nodeId: string) {
  return (await resolve(shelfId, nodeId)).plan;
}

/**
 * Turn a typed shelf into the platform category it stands for.
 *
 * Rename: the row keeps its id, takes the node's name and position, gets a
 * fresh slug only if the name changed (an unchanged name keeps shared links
 * working), and its products are reclassified where they are; its own
 * subcategories come along. Merge: the products and subcategories move onto
 * the shelf that already stands for the node, and the legacy row is deleted.
 * One transaction either way.
 */
export async function convertShelf(shelfId: string, nodeId: string) {
  const { shelf, node, plan, parents, target } = await resolve(shelfId, nodeId);
  if (plan.blocked) throw HttpError.conflict(plan.blocked);

  const resultId = await prisma.$transaction(async (tx) => {
    let parentShelfId: string | null = null;
    for (const step of parents) {
      if (step.kind === "create") {
        const created: { id: string } = await tx.storeCategory.create({
          data: {
            storeId: shelf.storeId,
            name: step.node.name,
            slug: await uniqueCategorySlug(shelf.storeId, step.node.name, tx),
            parentId: parentShelfId,
            categoryId: step.node.id,
          },
          select: { id: true },
        });
        parentShelfId = created.id;
        continue;
      }
      if (step.kind === "adopt") {
        await tx.storeCategory.update({
          where: { id: step.id },
          data: { categoryId: step.nodeId },
        });
      }
      parentShelfId = step.id;
    }

    if (target) {
      if (target.adopt) {
        await tx.storeCategory.update({
          where: { id: target.id },
          data: { categoryId: node.id },
        });
      }
      await tx.storeProduct.updateMany({
        where: { categoryId: shelf.id },
        data: { categoryId: target.id, globalCategoryId: node.id },
      });
      await tx.storeCategory.updateMany({
        where: { parentId: shelf.id },
        data: { parentId: target.id },
      });
      await tx.storeCategory.delete({ where: { id: shelf.id } });
      return target.id;
    }

    await tx.storeCategory.update({
      where: { id: shelf.id },
      data: {
        name: node.name,
        ...(plan.nameChanges
          ? { slug: await uniqueCategorySlug(shelf.storeId, node.name, tx, shelf.id) }
          : {}),
        parentId: parentShelfId,
        categoryId: node.id,
        // Featuring is a root-only merchandising flag.
        ...(parentShelfId ? { isFeatured: false } : {}),
      },
    });
    await tx.storeProduct.updateMany({
      where: { categoryId: shelf.id },
      data: { globalCategoryId: node.id },
    });
    return shelf.id;
  });

  const row = await prisma.storeCategory.findUniqueOrThrow({
    where: { id: resultId },
    select: shelfSelect,
  });
  const idx = shelfIndex(await loadShelves(row.storeId));
  const shelfPath = idx.pathOf(row.id).map((s) => s.name).join(PATH_SEPARATOR);
  return { shelf: await shape(row, shelfPath), plan };
}
