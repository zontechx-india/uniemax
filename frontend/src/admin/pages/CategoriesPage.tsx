import { useCallback, useEffect, useState } from 'react'
import { toApiError } from '../../shared/auth/http'
import { taxonomyApi, flattenTree } from '../../shared/categories/taxonomyApi'
import type { CategoryNode } from '../../shared/categories/taxonomyApi'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  PageHeader,
  SelectInput,
  Skeleton,
  TextInput,
} from '../ui/primitives'

/**
 * The GLOBAL category taxonomy — one hierarchy every store on the platform
 * classifies against.
 *
 * This is the only place it can be edited. Sellers select from it and never
 * write to it: a seller who needs a category that doesn't exist goes through
 * the (separate) suggestion workflow, so one shop's vocabulary can never
 * reshape the taxonomy every other shop is measured by.
 *
 * Depth is unbounded — the tree follows `parentId`, and "category" and
 * "subcategory" are the same kind of row at different depths. The initial
 * 29 roots / 125 children come from `backend/src/scripts/seedCategories.ts`.
 *
 * Disabling a node hides its whole branch from sellers and shoppers while
 * leaving every existing tag intact, which makes it the safe way to retire a
 * category. Deleting is refused while a node still has children or products.
 */

interface DraftState {
  /** The node being edited, or null while creating. */
  node: CategoryNode | null
  name: string
  parentId: string
  imageUrl: string
  displayOrder: string
  isActive: boolean
  /** One option per line — `Size: S, M, L`. Empty = inherit from the parent. */
  optionTemplates: string
  /** Comma-separated labels — `Fabric, Wash care`. Empty = inherit. */
  specTemplates: string
}

const BLANK: DraftState = {
  node: null,
  name: '',
  parentId: '',
  imageUrl: '',
  displayOrder: '0',
  isActive: true,
  optionTemplates: '',
  specTemplates: '',
}

export default function CategoriesPage() {
  const [tree, setTree] = useState<CategoryNode[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState<CategoryNode | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const load = useCallback(() => {
    setError(null)
    // activeOnly=false — the console must show disabled branches; they are
    // exactly what an admin comes here to re-enable.
    taxonomyApi
      .adminTree(false)
      .then(setTree)
      .catch((err) => setError(toApiError(err).message))
  }, [])

  useEffect(load, [load])

  const flat = tree ? flattenTree(tree) : []
  const term = query.trim().toLowerCase()
  // Searching flattens the view: a match deep in a collapsed branch has to be
  // reachable without the admin guessing which parent to open.
  const searching = term.length > 0
  const matches = searching
    ? flat.filter((node) => node.pathLabel.toLowerCase().includes(term))
    : []

  const parentOptions = [
    { value: '', label: 'Top level (no parent)' },
    ...flat.map((node) => ({
      value: node.id,
      label: `${'— '.repeat(node.depth)}${node.name}`,
    })),
  ]

  const startCreate = (parent?: CategoryNode) =>
    setDraft({
      ...BLANK,
      parentId: parent?.id ?? '',
      // A new sibling goes last rather than fighting for position 0.
      displayOrder: String(
        parent ? parent.children.length : (tree?.length ?? 0),
      ),
    })

  const startEdit = (node: CategoryNode) =>
    setDraft({
      node,
      name: node.name,
      parentId: node.parentId ?? '',
      imageUrl: node.imageUrl ?? '',
      displayOrder: String(node.displayOrder),
      isActive: node.isActive,
      // Inherited suggestions stay blank here (and show as a hint) so saving
      // the form does not silently turn them into this node's own copy.
      optionTemplates: node.templatesFrom ? '' : templatesToText(node.optionTemplates),
      specTemplates: node.templatesFrom ? '' : node.specTemplates.join(', '),
    })

  const save = async () => {
    if (!draft) return
    if (!draft.name.trim()) return setError('Please enter a category name.')

    setError(null)
    setSaving(true)
    try {
      const order = Number(draft.displayOrder)
      const payload = {
        name: draft.name.trim(),
        parentId: draft.parentId || null,
        // An emptied field means "no image", not an empty string.
        ...(draft.imageUrl.trim() ? { imageUrl: draft.imageUrl.trim() } : {}),
        ...(Number.isFinite(order) && order >= 0 ? { displayOrder: order } : {}),
        isActive: draft.isActive,
        ...templatePayload(draft),
      }
      if (draft.node) await taxonomyApi.update(draft.node.id, payload)
      else await taxonomyApi.create(payload)
      setDraft(null)
      load()
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (node: CategoryNode) => {
    setError(null)
    try {
      await taxonomyApi.update(node.id, { isActive: !node.isActive })
      load()
    } catch (err) {
      setError(toApiError(err).message)
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    try {
      await taxonomyApi.remove(toDelete.id)
      setToDelete(null)
      load()
    } catch (err) {
      setError(toApiError(err).message)
      setToDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  const toggleCollapsed = (id: string) => {
    const next = new Set(collapsed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setCollapsed(next)
  }

  /** Renders a node and, unless collapsed, its whole subtree. Any depth. */
  const renderNode = (node: CategoryNode): React.ReactNode => (
    <div key={node.id}>
      <CategoryRow
        node={node}
        collapsed={collapsed.has(node.id)}
        onToggleCollapse={() => toggleCollapsed(node.id)}
        onEdit={() => startEdit(node)}
        onAddChild={() => startCreate(node)}
        onToggleActive={() => void toggleActive(node)}
        onDelete={() => setToDelete(node)}
      />
      {!collapsed.has(node.id) && node.children.map(renderNode)}
    </div>
  )

  return (
    <div>
      <PageHeader
        title="Categories"
        subtitle="The platform-wide taxonomy every store classifies against. Sellers select from this list; they cannot add to it."
        actions={
          <Button variant="primary" onClick={() => startCreate()}>
            New category
          </Button>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {draft && (
        <Card className="mb-5">
          <div className="p-4">
            <h2 className="mb-4 font-heading text-base font-semibold text-fg">
              {draft.node ? `Edit “${draft.node.name}”` : 'New category'}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput
                label="Name"
                value={draft.name}
                maxLength={120}
                autoFocus
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <SelectInput
                label="Parent category"
                value={draft.parentId}
                options={
                  // A node can't be its own parent; the server also refuses to
                  // move one under its own descendant.
                  draft.node
                    ? parentOptions.filter((o) => o.value !== draft.node!.id)
                    : parentOptions
                }
                onChange={(e) => setDraft({ ...draft, parentId: e.target.value })}
              />
              <TextInput
                label="Sort order"
                type="number"
                min={0}
                value={draft.displayOrder}
                hint="Lower sorts first; ties fall back to name."
                onChange={(e) =>
                  setDraft({ ...draft, displayOrder: e.target.value })
                }
              />
              <TextInput
                label="Image URL"
                value={draft.imageUrl}
                placeholder="https://…"
                hint="Optional. A link only — there is no upload here."
                onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}
              />
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-fg">
                  Suggested options
                </span>
                <textarea
                  value={draft.optionTemplates}
                  onChange={(e) =>
                    setDraft({ ...draft, optionTemplates: e.target.value })
                  }
                  rows={3}
                  placeholder={'Size: S, M, L, XL\nColour: Black, White, Blue'}
                  className="w-full rounded-md border border-line bg-input px-3 py-2 font-mono text-xs text-fg outline-none focus:border-accent"
                />
                <p className="mt-1 text-xs text-muted">
                  {draft.node?.templatesFrom
                    ? `Inherits from ${draft.node.templatesFrom}: ${templatesToText(draft.node.optionTemplates).replace(/\n/g, ' · ') || 'none'}. Fill this in to give this category its own.`
                    : 'One option per line, values after a colon. Sellers see these as one-tap presets when adding a product here.'}
                </p>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-fg">
                  Suggested specification labels
                </span>
                <textarea
                  value={draft.specTemplates}
                  onChange={(e) =>
                    setDraft({ ...draft, specTemplates: e.target.value })
                  }
                  rows={3}
                  placeholder="Fabric, Fit, Wash care"
                  className="w-full rounded-md border border-line bg-input px-3 py-2 font-mono text-xs text-fg outline-none focus:border-accent"
                />
                <p className="mt-1 text-xs text-muted">
                  {draft.node?.templatesFrom
                    ? `Inherits from ${draft.node.templatesFrom}: ${draft.node.specTemplates.join(', ') || 'none'}.`
                    : 'Comma-separated. Pre-filled as empty rows in the product form.'}
                </p>
              </label>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) =>
                  setDraft({ ...draft, isActive: e.target.checked })
                }
                className="h-4 w-4 rounded border-line accent-[var(--brand)]"
              />
              Active — a disabled category hides its whole branch from sellers
              and shoppers, but keeps every existing tag.
            </label>

            <div className="mt-4 flex gap-2">
              <Button variant="primary" onClick={() => void save()} disabled={saving}>
                {saving ? 'Saving…' : draft.node ? 'Save changes' : 'Create'}
              </Button>
              <Button onClick={() => setDraft(null)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="mb-3">
        <TextInput
          placeholder="Search the taxonomy…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {tree === null ? (
        <Skeleton rows={10} />
      ) : tree.length === 0 ? (
        <EmptyState
          title="No categories yet"
          hint="Seed the initial taxonomy with `npm run seed-categories`, or add the first one above."
        />
      ) : (
        <Card>
          <div className="divide-y divide-line">
            {searching ? (
              matches.length === 0 ? (
                <p className="p-4 text-sm text-muted">
                  No category matches “{query.trim()}”.
                </p>
              ) : (
                matches.map((node) => (
                  <CategoryRow
                    key={node.id}
                    node={node}
                    /* Search results are a flat list — the path replaces the
                       indentation that would otherwise show the nesting. */
                    showPath
                    onEdit={() => startEdit(node)}
                    onAddChild={() => startCreate(node)}
                    onToggleActive={() => void toggleActive(node)}
                    onDelete={() => setToDelete(node)}
                  />
                ))
              )
            ) : (
              tree.map(renderNode)
            )}
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete category?"
        description={
          toDelete ? (
            <>
              <span className="font-medium text-fg">{toDelete.pathLabel}</span>{' '}
              will be removed from the taxonomy. A category with subcategories
              or products can't be deleted — disable it instead, which hides it
              without touching anything already tagged with it.
            </>
          ) : null
        }
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}

function CategoryRow({
  node,
  collapsed = false,
  showPath = false,
  onToggleCollapse,
  onEdit,
  onAddChild,
  onToggleActive,
  onDelete,
}: {
  node: CategoryNode
  collapsed?: boolean
  /** Show the full ancestor path instead of relying on indentation. */
  showPath?: boolean
  onToggleCollapse?: () => void
  onEdit: () => void
  onAddChild: () => void
  onToggleActive: () => void
  onDelete: () => void
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5"
      // Indent by depth so the hierarchy is visible without a tree widget.
      style={showPath ? undefined : { paddingLeft: 16 + node.depth * 22 }}
    >
      <div className="w-5 shrink-0">
        {node.childCount > 0 && onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${node.name}`}
            className="flex h-5 w-5 items-center justify-center rounded-sm text-muted transition-colors hover:text-fg"
          >
            <span className={collapsed ? '' : 'rotate-90'} style={{ display: 'inline-block' }}>
              ›
            </span>
          </button>
        )}
      </div>

      {node.imageUrl ? (
        <img
          src={node.imageUrl}
          alt=""
          className="h-8 w-8 shrink-0 rounded-md border border-line object-cover"
        />
      ) : null}

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium ${
            node.isActive ? 'text-fg' : 'text-muted'
          }`}
        >
          {node.name}
        </p>
        <p className="truncate text-xs text-muted">
          {showPath ? node.pathLabel : node.slug}
          {node.childCount > 0 && ` · ${node.childCount} inside`}
        </p>
      </div>

      {!node.isActive && <Chip tone="neutral">Disabled</Chip>}

      <Button variant="ghost" onClick={onAddChild} title={`Add inside ${node.name}`}>
        + Sub
      </Button>
      <Button variant="ghost" onClick={onEdit}>
        Edit
      </Button>
      <Button variant="ghost" onClick={onToggleActive}>
        {node.isActive ? 'Disable' : 'Enable'}
      </Button>
      <Button variant="ghost" onClick={onDelete} className="text-danger">
        Delete
      </Button>
    </div>
  )
}

/** `[{ name: 'Size', values: ['S','M'] }]` → `Size: S, M` per line. */
function templatesToText(templates: { name: string; values: string[] }[]): string {
  return templates.map((t) => `${t.name}: ${t.values.join(', ')}`).join('\n')
}

function parseTemplates(text: string): { name: string; values: string[] }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf(':')
      const name = (at >= 0 ? line.slice(0, at) : line).trim()
      const values = (at >= 0 ? line.slice(at + 1) : '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
      return { name, values }
    })
    .filter((t) => t.name)
}

/**
 * Blank fields mean different things: on a node with its own suggestions,
 * blank clears them (`null` = inherit again); on one that inherits, blank
 * changes nothing.
 */
function templatePayload(draft: DraftState) {
  const own = draft.node !== null && !draft.node.templatesFrom
  const options = parseTemplates(draft.optionTemplates)
  const specs = draft.specTemplates
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
  return {
    ...(options.length > 0
      ? { optionTemplates: options }
      : own && draft.node!.optionTemplates.length > 0
        ? { optionTemplates: null }
        : {}),
    ...(specs.length > 0
      ? { specTemplates: specs }
      : own && draft.node!.specTemplates.length > 0
        ? { specTemplates: null }
        : {}),
  }
}
