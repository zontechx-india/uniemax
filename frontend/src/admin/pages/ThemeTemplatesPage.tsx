import { useState } from 'react'
import { adminApi } from '../features/adminApi'
import type {
  ThemeTemplate,
  ThemeTemplateColors,
  ThemeTemplateInput,
} from '../features/adminApi'
import { useAdminQuery } from '../features/useAdminQuery'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import {
  Button,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  TextInput,
} from '../ui/primitives'

/**
 * Store appearance templates — the ready-made palettes a seller applies from
 * their store's Appearance section.
 *
 * A template is **colors only**. Applying one COPIES its five values onto the
 * store, so nothing on this page can reach a live storefront: editing a
 * template leaves every shop that already used it exactly as it is, and
 * disabling one only takes it out of the seller's picker. That is what makes
 * these safe to curate — and it is also why deleting one is not destructive.
 *
 * The initial set was lifted from real, well-configured stores (colors only)
 * by `backend/src/scripts/seedThemeTemplates.ts`.
 */

const BLANK: ThemeTemplateInput = {
  name: '',
  description: null,
  theme: {
    backgroundColor: '#f9fafb',
    primaryColor: '#6c3ef4',
    secondaryColor: null,
    surfaceColor: null,
    buttonTextColor: null,
  },
  isActive: true,
  displayOrder: 0,
}

export default function ThemeTemplatesPage() {
  const { data: templates, loading, error, refresh } = useAdminQuery(
    () => adminApi.listThemeTemplates(),
    [],
  )

  /** `'new'` opens the create form; a template id opens that row's editor. */
  const [editing, setEditing] = useState<'new' | string | null>(null)
  const [form, setForm] = useState<ThemeTemplateInput>(BLANK)
  const [deleteTarget, setDeleteTarget] = useState<ThemeTemplate | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const guard = async (action: () => Promise<unknown>, success?: string) => {
    setBusy(true)
    setFormError(null)
    try {
      await action()
      setNotice(success ?? null)
      refresh()
      return true
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
      return false
    } finally {
      setBusy(false)
    }
  }

  const openCreate = () => {
    setFormError(null)
    if (editing === 'new') {
      setEditing(null)
      return
    }
    // A new template lands after the existing ones rather than at the top.
    setForm({ ...BLANK, displayOrder: templates?.length ?? 0 })
    setEditing('new')
  }

  const openEdit = (template: ThemeTemplate) => {
    setFormError(null)
    setForm({
      name: template.name,
      description: template.description,
      theme: template.theme,
      isActive: template.isActive,
      displayOrder: template.displayOrder,
    })
    setEditing(template.id)
  }

  const save = () =>
    void guard(async () => {
      if (editing === 'new') await adminApi.createThemeTemplate(form)
      else if (editing) await adminApi.updateThemeTemplate(editing, form)
      setEditing(null)
    }, editing === 'new' ? 'Template created.' : 'Template saved.')

  if (error) return <ErrorState message={error} onRetry={refresh} />

  const enabledCount = (templates ?? []).filter((t) => t.isActive).length

  return (
    <>
      <PageHeader
        title="Store themes"
        subtitle="Ready-made palettes sellers can apply to their storefront in one click"
        actions={
          <Button variant="primary" onClick={openCreate}>
            {editing === 'new' ? 'Cancel' : 'New template'}
          </Button>
        }
      />

      {notice ? (
        <p className="mb-4 rounded-lg border border-success/40 bg-success/10 px-4 py-2.5 text-sm text-fg">
          {notice}
        </p>
      ) : null}

      {templates && enabledCount === 0 && templates.length > 0 ? (
        <p className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-fg">
          Every template is disabled — sellers currently see no templates at all
          and have to set their colors by hand.
        </p>
      ) : null}

      {editing === 'new' ? (
        <TemplateEditor
          title="New template"
          form={form}
          onChange={setForm}
          onCancel={() => setEditing(null)}
          onSave={save}
          busy={busy}
          error={formError}
        />
      ) : null}

      {loading && !templates ? (
        <Skeleton rows={4} />
      ) : (templates ?? []).length === 0 ? (
        <Card>
          <EmptyState
            title="No templates yet"
            hint="Create one here, or run the backend's seed-theme-templates script to build the starter set from the palettes already live on the platform."
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {(templates ?? []).map((template) =>
            editing === template.id ? (
              <li key={template.id}>
                <TemplateEditor
                  title={`Edit "${template.name}"`}
                  form={form}
                  onChange={setForm}
                  onCancel={() => setEditing(null)}
                  onSave={save}
                  busy={busy}
                  error={formError}
                />
              </li>
            ) : (
              <li key={template.id}>
                <Card padded={false}>
                  <div className="flex flex-wrap items-center gap-4 p-4">
                    <ThemeThumbnail theme={template.theme} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                        {template.name}
                        <Chip tone={template.isActive ? 'success' : 'neutral'}>
                          {template.isActive ? 'Enabled' : 'Disabled'}
                        </Chip>
                        <Chip>#{template.displayOrder}</Chip>
                      </p>
                      <p className="mt-0.5 text-sm text-muted">
                        {template.description ?? 'No description'}
                      </p>
                      <p className="mt-1 flex flex-wrap gap-3 font-mono text-xs uppercase text-muted">
                        {COLOR_FIELDS.map(({ key, label }) => (
                          <span key={key} className="inline-flex items-center gap-1">
                            <span
                              aria-hidden
                              className="inline-block h-3 w-3 rounded-sm border border-line"
                              style={{
                                background:
                                  template.theme[key] ??
                                  'repeating-linear-gradient(45deg, var(--line) 0 3px, transparent 3px 6px)',
                              }}
                            />
                            {label}: {template.theme[key] ?? 'auto'}
                          </span>
                        ))}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => openEdit(template)}>Edit</Button>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void guard(
                            () =>
                              adminApi.updateThemeTemplate(template.id, {
                                isActive: !template.isActive,
                              }),
                            template.isActive
                              ? 'Template disabled — sellers no longer see it.'
                              : 'Template enabled.',
                          )
                        }
                      >
                        {template.isActive ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => {
                          setDeleteTarget(template)
                          setFormError(null)
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </Card>
              </li>
            ),
          )}
        </ul>
      )}

      {formError && editing === null ? (
        <p className="mt-3 text-sm text-danger">{formError}</p>
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        busy={busy}
        title={`Delete "${deleteTarget?.name}"?`}
        tone="danger"
        confirmLabel="Delete template"
        description={
          <p>
            Stores keep their own copy of these colors, so no storefront
            changes — the template just stops being offered. Disable it instead
            if you might want it back.
          </p>
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() =>
          void guard(async () => {
            await adminApi.deleteThemeTemplate(deleteTarget!.id)
            setDeleteTarget(null)
          }, 'Template deleted.')
        }
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

/**
 * The five color roles, in the order the seller's Appearance section shows
 * them. `auto` fields are nullable: the storefront derives them (secondary
 * follows primary, surface follows the background, button text follows the
 * primary's luminance), which is what most templates should leave them on.
 */
const COLOR_FIELDS: {
  key: keyof ThemeTemplateColors
  label: string
  hint: string
  auto?: string
}[] = [
  { key: 'backgroundColor', label: 'Background', hint: 'The page canvas.' },
  { key: 'primaryColor', label: 'Primary', hint: 'Buttons and the CTA shine.' },
  {
    key: 'secondaryColor',
    label: 'Secondary',
    hint: 'Links, prices and highlights.',
    auto: 'same as primary',
  },
  {
    key: 'surfaceColor',
    label: 'Surface',
    hint: 'Cards and panels.',
    auto: 'derived from the background',
  },
  {
    key: 'buttonTextColor',
    label: 'Button text',
    hint: 'Label on CTA buttons.',
    auto: "from the primary's luminance",
  },
]

const HEX = /^#[0-9a-fA-F]{6}$/

function TemplateEditor({
  title,
  form,
  onChange,
  onCancel,
  onSave,
  busy,
  error,
}: {
  title: string
  form: ThemeTemplateInput
  onChange: (next: ThemeTemplateInput) => void
  onCancel: () => void
  onSave: () => void
  busy: boolean
  error: string | null
}) {
  const setColor = (key: keyof ThemeTemplateColors, value: string | null) =>
    onChange({ ...form, theme: { ...form.theme, [key]: value } })

  const valid =
    form.name.trim().length > 0 &&
    COLOR_FIELDS.every(({ key, auto }) => {
      const value = form.theme[key]
      return value === null ? Boolean(auto) : HEX.test(value)
    })

  return (
    <Card className="mb-4">
      <CardHeader
        title={title}
        subtitle="Colors only — a template never carries anything else about a store."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              label="Name"
              value={form.name}
              maxLength={60}
              onChange={(event) => onChange({ ...form, name: event.target.value })}
            />
            <TextInput
              label="Display order"
              type="number"
              min={0}
              value={form.displayOrder}
              onChange={(event) =>
                onChange({ ...form, displayOrder: Number(event.target.value) || 0 })
              }
              hint="Lowest first in the seller's picker."
            />
            <TextInput
              label="Description"
              className="sm:col-span-2"
              value={form.description ?? ''}
              maxLength={160}
              placeholder="Warm, high-contrast — good for food and fashion"
              onChange={(event) =>
                onChange({ ...form, description: event.target.value || null })
              }
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {COLOR_FIELDS.map(({ key, label, hint, auto }) => (
              <ColorField
                key={key}
                label={label}
                hint={hint}
                auto={auto}
                value={form.theme[key]}
                seed={
                  key === 'surfaceColor'
                    ? form.theme.backgroundColor
                    : form.theme.primaryColor
                }
                onChange={(value) => setColor(key, value)}
              />
            ))}
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) =>
                onChange({ ...form, isActive: event.target.checked })
              }
              className="h-4 w-4 accent-[var(--brand)]"
            />
            Enabled — sellers can pick this template
          </label>
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-fg">Preview</span>
          <ThemeThumbnail theme={form.theme} large />
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <div className="mt-4 flex gap-2">
        <Button variant="primary" disabled={busy || !valid} onClick={onSave}>
          {busy ? 'Saving…' : 'Save template'}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  )
}

/** Hex field with a native swatch; nullable fields carry an Auto toggle. */
function ColorField({
  label,
  hint,
  auto,
  value,
  seed,
  onChange,
}: {
  label: string
  hint: string
  /** What Auto means here. Absent = the field is required. */
  auto?: string
  value: string | null
  /** Colour the picker starts from when switching off Auto. */
  seed: string
  onChange: (value: string | null) => void
}) {
  return (
    <div>
      <span className="mb-1 flex items-center justify-between gap-2 text-sm font-medium text-fg">
        {label}
        {auto ? (
          <button
            type="button"
            onClick={() => onChange(value === null ? seed : null)}
            className="text-xs font-semibold text-brand hover:underline"
          >
            {value === null ? 'Set a color' : 'Use Auto'}
          </button>
        ) : null}
      </span>

      {value === null ? (
        <div className="flex h-[42px] items-center rounded-md border border-dashed border-line px-3 text-sm text-muted">
          Auto — {auto}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-line bg-input px-2 py-1.5">
          <input
            type="color"
            value={HEX.test(value) ? value : '#000000'}
            onChange={(event) => onChange(event.target.value)}
            aria-label={`${label} swatch`}
            className="h-7 w-9 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
          />
          <input
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            maxLength={7}
            spellCheck={false}
            aria-label={`${label} hex code`}
            className="w-full min-w-0 bg-transparent font-mono text-sm uppercase text-fg outline-none"
          />
        </div>
      )}
      <span className="mt-1 block text-xs text-muted">{hint}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Thumbnail
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  if (!HEX.test(hex)) return [128, 128, 128]
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

const isDark = (hex: string) => {
  const [r, g, b] = hexToRgb(hex)
  return 0.299 * r + 0.587 * g + 0.114 * b < 128
}

function mix(hex: string, target: number, amount: number): string {
  const part = (n: number) =>
    Math.round(n + (target - n) * amount)
      .toString(16)
      .padStart(2, '0')
  return `#${hexToRgb(hex).map(part).join('')}`
}

/**
 * The template as the seller will meet it: canvas, a product card with a
 * price, and the CTA. It resolves the Auto values with the SAME rules as the
 * storefront's `storeVars` — a console that showed a placeholder for "auto"
 * would hide the very thing an admin is judging.
 *
 * Written with inline styles rather than the storefront's components on
 * purpose: the console and the storefront share tokens, never components.
 */
function ThemeThumbnail({
  theme,
  large = false,
}: {
  theme: ThemeTemplateColors
  large?: boolean
}) {
  const bg = theme.backgroundColor
  const primary = theme.primaryColor
  const secondary = theme.secondaryColor ?? primary
  const surface = theme.surfaceColor ?? (isDark(bg) ? mix(bg, 255, 0.07) : '#ffffff')
  const line = isDark(surface) ? mix(surface, 255, 0.14) : mix(surface, 0, 0.18)
  const well = isDark(surface) ? mix(surface, 255, 0.07) : mix(surface, 0, 0.045)
  const fg = isDark(bg) ? '#ffffff' : '#101010'
  const ctaText = theme.buttonTextColor ?? (isDark(primary) ? '#ffffff' : '#101010')

  return (
    <div
      className={`shrink-0 overflow-hidden rounded-md border border-line ${large ? 'w-full' : 'w-40'}`}
      style={{ background: bg, color: fg }}
    >
      <div className="p-2.5">
        {/* Header row */}
        <div className="flex items-center gap-1.5">
          <span
            className="h-4 w-4 rounded"
            style={{
              background: `linear-gradient(180deg, ${mix(primary, 255, 0.28)} 0%, ${primary} 48%, ${mix(primary, 0, 0.2)} 100%)`,
            }}
          />
          <span className="h-1.5 w-10 rounded-full" style={{ background: well }} />
          <span
            className="ml-auto h-4 w-4 rounded-full border"
            style={{ background: surface, borderColor: line }}
          />
        </div>

        {/* Product card */}
        <div
          className="mt-2 flex gap-1.5 rounded-md border p-1.5"
          style={{ background: surface, borderColor: line }}
        >
          <span
            className={`shrink-0 rounded ${large ? 'h-12 w-12' : 'h-9 w-9'}`}
            style={{ background: well }}
          />
          <span className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
            <span className="h-1.5 w-full rounded-full" style={{ background: well }} />
            <span
              className="text-[9px] font-bold"
              style={{ color: secondary }}
            >
              ₹1,299
            </span>
          </span>
        </div>

        {/* CTA — where button text contrast is actually judged */}
        <div
          className="mt-2 flex h-6 items-center justify-center rounded text-[9px] font-bold"
          style={{
            background: `linear-gradient(180deg, ${mix(primary, 255, 0.28)} 0%, ${primary} 48%, ${mix(primary, 0, 0.2)} 100%)`,
            color: ctaText,
          }}
        >
          Add to Cart
        </div>
      </div>
    </div>
  )
}
