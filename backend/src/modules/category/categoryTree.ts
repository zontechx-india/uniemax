import { prisma } from "../../config/prisma.js";

/**
 * Read models for the GLOBAL category taxonomy.
 *
 * The taxonomy is small (low hundreds of rows) and changes only when an admin
 * edits it, while the seller product form needs it on nearly every render.
 * So the whole table is loaded ONCE into a process-local cache and every tree
 * / search / children / path answer is assembled from that in memory —
 * instead of a recursive CTE or an N+1 walk per request. Any admin write
 * calls `invalidateCategoryCache()`, and a short TTL bounds how long a second
 * server process can serve a stale tree.
 */

const CACHE_TTL_MS = 60_000;

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  displayOrder: number;
  isActive: boolean;
  parentId: string | null;
};

/** A node plus its ancestors — what a selector needs to show a full path. */
export type CategoryCrumb = { id: string; name: string; slug: string };

export type CategoryNode = CategoryRow & {
  /** Root-first, self LAST: [Automotive, Motorcycle Parts, Brake Parts]. */
  path: CategoryCrumb[];
  /** "Automotive > Motorcycle Parts > Brake Parts" — display only. */
  pathLabel: string;
  depth: number;
  childCount: number;
  children: CategoryNode[];
};

let cache: { rows: CategoryRow[]; loadedAt: number } | null = null;

/** Drop the cache — call after any write to `Category`. */
export function invalidateCategoryCache() {
  cache = null;
}

async function allCategories(): Promise<CategoryRow[]> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.rows;
  const rows = await prisma.category.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      imageUrl: true,
      displayOrder: true,
      isActive: true,
      parentId: true,
    },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
  cache = { rows, loadedAt: Date.now() };
  return rows;
}

type Index = {
  byId: Map<string, CategoryRow>;
  bySlug: Map<string, CategoryRow>;
  childrenOf: Map<string | null, CategoryRow[]>;
  rows: CategoryRow[];
};

async function index(activeOnly: boolean): Promise<Index> {
  const all = await allCategories();
  // A disabled parent hides its whole branch, exactly as a disabled shelf
  // does in a store — otherwise a child would outlive the category it sits in.
  const rows = activeOnly ? keepActiveBranches(all) : all;

  const byId = new Map(rows.map((row) => [row.id, row]));
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  const childrenOf = new Map<string | null, CategoryRow[]>();
  for (const row of rows) {
    // A row whose parent was filtered out is orphaned, not promoted to root.
    if (row.parentId && !byId.has(row.parentId)) continue;
    const key = row.parentId ?? null;
    const bucket = childrenOf.get(key);
    if (bucket) bucket.push(row);
    else childrenOf.set(key, [row]);
  }
  return { byId, bySlug, childrenOf, rows };
}

/** Keeps only rows that are active AND have no disabled ancestor. */
function keepActiveBranches(all: CategoryRow[]): CategoryRow[] {
  const byId = new Map(all.map((row) => [row.id, row]));
  const verdict = new Map<string, boolean>();

  const visible = (row: CategoryRow): boolean => {
    const cached = verdict.get(row.id);
    if (cached !== undefined) return cached;
    // Guard against a cycle a bad edit could introduce: assume hidden while
    // resolving, so a loop terminates instead of recursing forever.
    verdict.set(row.id, false);
    const parent = row.parentId ? byId.get(row.parentId) : undefined;
    const result = row.isActive && (!row.parentId || (!!parent && visible(parent)));
    verdict.set(row.id, result);
    return result;
  };

  return all.filter(visible);
}

function crumbs(row: CategoryRow, byId: Map<string, CategoryRow>): CategoryCrumb[] {
  const path: CategoryCrumb[] = [];
  let cursor: CategoryRow | undefined = row;
  const guard = new Set<string>();
  while (cursor && !guard.has(cursor.id)) {
    guard.add(cursor.id);
    path.unshift({ id: cursor.id, name: cursor.name, slug: cursor.slug });
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return path;
}

const label = (path: CategoryCrumb[]) => path.map((c) => c.name).join(" > ");

function toNode(row: CategoryRow, idx: Index, deep: boolean): CategoryNode {
  const path = crumbs(row, idx.byId);
  const kids = idx.childrenOf.get(row.id) ?? [];
  return {
    ...row,
    path,
    pathLabel: label(path),
    depth: path.length - 1,
    childCount: kids.length,
    children: deep ? kids.map((kid) => toNode(kid, idx, true)) : [],
  };
}

/** The whole taxonomy, nested. Any depth — the shape follows `parentId`. */
export async function getCategoryTree(activeOnly: boolean): Promise<CategoryNode[]> {
  const idx = await index(activeOnly);
  return (idx.childrenOf.get(null) ?? []).map((row) => toNode(row, idx, true));
}

/**
 * Direct children of one node, or the roots when `parentSlug` is null — the
 * "drill one level at a time" half of the selector, so a large taxonomy never
 * has to ship whole.
 */
export async function getCategoryChildren(
  parentSlug: string | null,
  activeOnly: boolean,
): Promise<{ parent: CategoryNode | null; items: CategoryNode[] }> {
  const idx = await index(activeOnly);
  let parentId: string | null = null;
  let parent: CategoryNode | null = null;

  if (parentSlug) {
    const row = idx.bySlug.get(parentSlug);
    // An unknown or hidden slug has no children rather than every root's.
    if (!row) return { parent: null, items: [] };
    parentId = row.id;
    parent = toNode(row, idx, false);
  }

  return {
    parent,
    items: (idx.childrenOf.get(parentId) ?? []).map((row) => toNode(row, idx, false)),
  };
}

/**
 * Free-text search across the taxonomy, each hit carrying its full path so
 * "brake" can render as "Automotive > Motorcycle Parts > Brake Parts".
 * A node also matches on its ancestors' names, so "automotive brake" works.
 * Ranking: name-prefix first, then name-substring, then path-only matches;
 * shallower nodes win ties, so "Fashion" outranks "Fashion > Men".
 */
export async function searchCategories(
  q: string,
  limit: number,
  activeOnly: boolean,
): Promise<CategoryNode[]> {
  const idx = await index(activeOnly);
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const scored: { node: CategoryNode; score: number }[] = [];
  for (const row of idx.rows) {
    const node = toNode(row, idx, false);
    const name = row.name.toLowerCase();
    const path = node.pathLabel.toLowerCase();
    // Every term must appear somewhere in the path — that is what makes
    // multi-word queries narrow the result instead of widening it.
    if (!terms.every((term) => path.includes(term))) continue;

    const best = terms.some((term) => name.startsWith(term))
      ? 0
      : terms.some((term) => name.includes(term))
        ? 1
        : 2;
    scored.push({ node, score: best * 100 + node.depth });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.node.name.localeCompare(b.node.name))
    .slice(0, limit)
    .map((entry) => entry.node);
}

/** One node with its ancestors — used to render an already-stored id. */
export async function getCategoryPath(
  id: string,
  activeOnly: boolean,
): Promise<CategoryNode | null> {
  const idx = await index(activeOnly);
  const row = idx.byId.get(id);
  return row ? toNode(row, idx, false) : null;
}
