import { call, http } from '../auth/http'

/**
 * The GLOBAL category taxonomy — one hierarchy shared by every tenant,
 * managed by admins and only ever *selected* by sellers.
 *
 * Read endpoints are public (`/api/v1/categories/...`), so both apps use them;
 * the write endpoints live under `/api/v1/admin/categories` and are admin-only.
 * Nesting is unbounded: every shape here follows `parentId`, and nothing
 * assumes exactly two levels.
 */

const PUBLIC = '/api/v1/categories'
const ADMIN = '/api/v1/admin/categories'

export interface CategoryCrumb {
  id: string
  name: string
  slug: string
}

export interface CategoryNode {
  id: string
  name: string
  slug: string
  imageUrl: string | null
  displayOrder: number
  isActive: boolean
  parentId: string | null
  /** Root-first, self LAST: [Automotive, Motorcycle Parts, Brake Parts]. */
  path: CategoryCrumb[]
  /** "Automotive > Motorcycle Parts > Brake Parts" — display only. */
  pathLabel: string
  /** 0 for a root. */
  depth: number
  childCount: number
  /** Populated by `tree()`; empty from `children()` and `search()`. */
  children: CategoryNode[]
}

/** How a selected path is rendered everywhere in the UI. */
export const PATH_SEPARATOR = ' › '

export function formatPath(node: {
  path: CategoryCrumb[]
  name: string
}): string {
  return node.path.length > 0
    ? node.path.map((crumb) => crumb.name).join(PATH_SEPARATOR)
    : node.name
}

export interface CategoryChildren {
  /** null when listing the roots. */
  parent: CategoryNode | null
  items: CategoryNode[]
}

export interface CategoryWriteInput {
  name: string
  parentId?: string | null
  description?: string
  imageUrl?: string
  displayOrder?: number
  isActive?: boolean
}

export const taxonomyApi = {
  /**
   * The whole tree in one call. Small enough to be worth it for a management
   * screen; the product selector prefers `children()` so it only ever fetches
   * the level being looked at.
   */
  async tree(activeOnly = true): Promise<CategoryNode[]> {
    return call<CategoryNode[]>(
      http.get(`${PUBLIC}/tree`, { params: { activeOnly } }),
    )
  },

  /** One level: the children of `parentSlug`, or the roots when omitted. */
  async children(
    parentSlug?: string | null,
    activeOnly = true,
  ): Promise<CategoryChildren> {
    return call<CategoryChildren>(
      http.get(`${PUBLIC}/children`, {
        params: { ...(parentSlug ? { parentSlug } : {}), activeOnly },
      }),
    )
  },

  /** Full-text across the tree; each hit carries its ancestor path. */
  async search(
    q: string,
    limit = 20,
    activeOnly = true,
  ): Promise<CategoryNode[]> {
    return call<CategoryNode[]>(
      http.get(`${PUBLIC}/search`, { params: { q, limit, activeOnly } }),
    )
  },

  // --- admin only ---------------------------------------------------------

  /** Admin view of the tree, including disabled branches. */
  async adminTree(activeOnly = false): Promise<CategoryNode[]> {
    return call<CategoryNode[]>(
      http.get(`${ADMIN}/tree`, { params: { activeOnly } }),
    )
  },

  async create(input: CategoryWriteInput): Promise<CategoryNode> {
    return call<CategoryNode>(http.post(ADMIN, input))
  },

  async update(
    id: string,
    patch: Partial<CategoryWriteInput>,
  ): Promise<CategoryNode> {
    return call<CategoryNode>(http.patch(`${ADMIN}/${id}`, patch))
  },

  async remove(id: string): Promise<void> {
    await call(http.delete(`${ADMIN}/${id}`))
  },
}

/** Depth-first flatten of a tree — the order a nested list renders in. */
export function flattenTree(nodes: CategoryNode[]): CategoryNode[] {
  const out: CategoryNode[] = []
  const walk = (list: CategoryNode[]) => {
    for (const node of list) {
      out.push(node)
      if (node.children.length > 0) walk(node.children)
    }
  }
  walk(nodes)
  return out
}
