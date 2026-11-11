import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toApiError } from '../../shared/auth/http'
import { taxonomyApi, flattenTree } from '../../shared/categories/taxonomyApi'
import type { CategoryNode } from '../../shared/categories/taxonomyApi'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Dialog } from '../../shared/ui/Dialog'
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
import { SearchInput } from '../ui/Toolbar'
import { MediaImg } from '../../shared/media/MediaImg'

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
  /** A newly picked picture, uploaded after the category itself saves. */
  image: File | null
  /** Clear the current picture on save. */
  removeImage: boolean
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
  image: null,
  removeImage: false,
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
      image: null,
      removeImage: false,
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
        ...(Number.isFinite(order) && order >= 0 ? { displayOrder: order } : {}),
        isActive: draft.isActive,
        ...templatePayload(draft),
      }
      const saved = draft.node
        ? await taxonomyApi.update(draft.node.id, payload)
        : await taxonomyApi.create(payload)
      // The picture is its own request (multipart), after the row exists.
      if (draft.image) await taxonomyApi.setImage(saved.id, draft.image, draft.image.name)
      else if (draft.removeImage && draft.node?.imageUrl) await taxonomyApi.removeImage(saved.id)
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

      {error && !draft && (
        <div className="mb-4">
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {/* The form opens over the list (a bottom sheet on a phone), so editing
          a row deep in the tree never sends the admin back to the top. */}
      <Dialog
        open={draft !== null}
        title={draft?.node ? `Edit “${draft.node.name}”` : 'New category'}
        onClose={() => {
          if (!saving) setDraft(null)
        }}
        footer={
          <>
            <Button onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : draft?.node ? 'Save changes' : 'Create'}
            </Button>
          </>
        }
      >
        {draft && (
          <div>
            {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
            <div className="grid gap-4">
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
              <CategoryImageField
                current={draft.removeImage ? null : (draft.node?.imageUrl ?? null)}
                picked={draft.image}
                onPick={(image) => setDraft({ ...draft, image, removeImage: false })}
                onRemove={() => setDraft({ ...draft, image: null, removeImage: true })}
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
          </div>
        )}
      </Dialog>

      <div className="mb-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search categories" delay={150} />
      </div>

      {tree === null ? (
        <Skeleton rows={10} />
      ) : tree.length === 0 ? (
        <EmptyState
          title="No categories yet"
          description="Seed the initial taxonomy with `npm run seed-categories`, or add the first one above."
        />
      ) : (
        // Edge to edge on a phone, like a native list; a card from `sm`.
        <Card padding="none" className="max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0">
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
  const [menuOpen, setMenuOpen] = useState(false)
  // Each sheet action closes the sheet first, then acts.
  const act = (action: () => void) => () => {
    setMenuOpen(false)
    action()
  }

  return (
    <div
      // Indent by depth so the hierarchy is visible without a tree widget —
      // 12px a level on a phone (names need the room), 22px from `sm`.
      className={`flex min-h-14 items-center gap-2 py-2 pr-2 sm:gap-3 sm:pr-4 ${
        showPath ? 'pl-2 sm:pl-4' : 'pl-[calc(8px+var(--depth)*12px)] sm:pl-[calc(16px+var(--depth)*22px)]'
      }`}
      style={showPath ? undefined : ({ '--depth': node.depth } as React.CSSProperties)}
    >
      <div className="w-9 shrink-0">
        {node.childCount > 0 && onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${node.name}`}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-alt hover:text-fg"
          >
            <svg
              viewBox="0 0 24 24"
              className={`h-4 w-4 transition-transform ${collapsed ? '' : 'rotate-90'}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        )}
      </div>

      {node.imageUrl ? (
        <MediaImg
          sizes="32px"
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

      {/* From `sm`: the actions sit on the row. */}
      <div className="hidden shrink-0 items-center gap-1 sm:flex">
        <Button variant="ghost" onClick={onAddChild} title={`Add inside ${node.name}`}>
          + Sub
        </Button>
        <Button variant="ghost" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" onClick={onToggleActive}>
          {node.isActive ? 'Disable' : 'Enable'}
        </Button>
        <Button variant="ghost" onClick={onDelete} className="text-danger!">
          Delete
        </Button>
      </div>

      {/* On a phone: one "more" button opening an action sheet. */}
      <Button
        variant="ghost"
        size="md"
        onClick={() => setMenuOpen(true)}
        aria-label={`Actions for ${node.name}`}
        className="text-muted sm:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </Button>
      <Dialog
        open={menuOpen}
        title={node.name}
        subtitle={node.pathLabel}
        flush
        onClose={() => setMenuOpen(false)}
      >
        <div className="grid gap-1 p-2">
          <SheetAction onClick={act(onEdit)}>Edit</SheetAction>
          <SheetAction onClick={act(onAddChild)}>Add a subcategory inside</SheetAction>
          <SheetAction onClick={act(onToggleActive)}>
            {node.isActive ? 'Disable' : 'Enable'}
          </SheetAction>
          <SheetAction onClick={act(onDelete)} danger>
            Delete
          </SheetAction>
        </div>
      </Dialog>
    </div>
  )
}

/** One full-width row of a phone action sheet — a 44px tap target. */
function SheetAction({
  onClick,
  danger = false,
  children,
}: {
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="md"
      onClick={onClick}
      // `!`: the ghost style sets its own text colour, which would win.
      className={`w-full justify-start ${danger ? 'text-danger!' : ''}`}
    >
      {children}
    </Button>
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

/**
 * The category's picture — its tile under "Shop by category" on the
 * marketplace homepage. Picked here, uploaded on Save. Without one the tile
 * shows an icon; it never borrows a seller's product photo.
 */
function CategoryImageField({
  current,
  picked,
  onPick,
  onRemove,
}: {
  current: string | null
  picked: File | null
  onPick: (file: File) => void
  onRemove: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const preview = useMemo(() => (picked ? URL.createObjectURL(picked) : null), [picked])
  useEffect(() => {
    if (!preview) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])
  const hasImage = Boolean(preview ?? current)

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-fg">Picture</span>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-surface-alt">
          {preview ? (
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : current ? (
            <MediaImg sizes="64px" src={current} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-muted">None</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => input.current?.click()}>
            {hasImage ? 'Replace' : 'Upload'}
          </Button>
          {hasImage && (
            <Button size="sm" variant="ghost" onClick={onRemove}>
              Remove
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = '' // re-picking the same file must still fire
            if (file) onPick(file)
          }}
        />
      </div>
      <p className="mt-1 text-xs text-muted">
        Square, object centred with space around it. Shown on the homepage tile
        (top-level categories); saved when you press Save.
      </p>
    </div>
  )
}
