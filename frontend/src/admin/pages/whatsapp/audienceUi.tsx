import { useEffect, useMemo, useState } from 'react'
import { Alert } from '../../../shared/ui/Alert'
import { SegmentedTabs } from '../../../shared/ui/form'
import { adminApi } from '../../features/adminApi'
import type {
  WaAudience,
  WaAudiencePreview,
  WaContactFilters,
  WaField,
  WaFieldCatalogue,
  WaSegment,
  WaSellerFilters,
} from '../../features/adminApi'
import { useAdminQuery } from '../../features/useAdminQuery'
import { Button, Chip, SelectInput, Skeleton, TextArea, TextInput, buttonClass } from '../../ui/primitives'
import { formatCount } from '../../ui/format'
import { formatWaId, plural } from './whatsappUi'

/**
 * The audience builder — who a campaign (or a saved segment) is for.
 *
 *   - **Sellers**: every live store, narrowed by setup, publishing, products,
 *     orders, age, state, or hand-picked stores.
 *   - **Contacts**: WhatsApp contacts by tag and marketing consent.
 *   - **Saved segment**: one of the definitions on the Audiences tab.
 *   - **List**: pasted or uploaded CSV — a phone column plus any columns,
 *     each of which becomes a field the message can use.
 *
 * Every change re-runs a server preview (debounced), so the count shown is
 * the one the campaign will start from.
 */

export type AudienceKind = 'sellers' | 'contacts' | 'segment' | 'list'

export const DEFAULT_AUDIENCE: WaAudience = { kind: 'sellers', filters: { setup: 'incomplete' } }

// ---- Editor ----------------------------------------------------------------------

export function AudienceEditor({
  audience,
  onChange,
  kinds = ['sellers', 'contacts', 'segment', 'list'],
}: {
  audience: WaAudience
  onChange: (audience: WaAudience) => void
  kinds?: AudienceKind[]
}) {
  const kindLabels: Record<AudienceKind, string> = {
    sellers: 'Sellers',
    contacts: 'Contacts',
    segment: 'Saved segment',
    list: 'Paste a list',
  }

  if (audience.kind === 'campaign') {
    return (
      <Alert tone="info" title="Retargeting an earlier campaign">
        Everyone from that campaign whose message{' '}
        {RETARGET_LABEL[audience.filter] ?? audience.filter}. Their details are fetched fresh, so
        values like setup progress are today&apos;s.
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      {kinds.length > 1 ? (
        <SegmentedTabs<AudienceKind>
          tabs={kinds.map((k) => ({ value: k, label: kindLabels[k] }))}
          value={audience.kind}
          onChange={(kind) => {
            if (kind === audience.kind) return
            onChange(
              kind === 'sellers'
                ? { kind: 'sellers', filters: {} }
                : kind === 'contacts'
                  ? { kind: 'contacts', filters: {} }
                  : kind === 'segment'
                    ? { kind: 'segment', segmentId: '' }
                    : { kind: 'list', rows: [] },
            )
          }}
        />
      ) : null}

      {audience.kind === 'sellers' ? (
        <SellerFiltersForm
          filters={audience.filters}
          onChange={(filters) => onChange({ kind: 'sellers', filters })}
        />
      ) : audience.kind === 'contacts' ? (
        <ContactFiltersForm
          filters={audience.filters}
          onChange={(filters) => onChange({ kind: 'contacts', filters })}
        />
      ) : audience.kind === 'segment' ? (
        <SegmentPicker
          value={audience.segmentId}
          onChange={(segmentId) => onChange({ kind: 'segment', segmentId })}
        />
      ) : audience.kind === 'list' ? (
        <ListInput onChange={(rows) => onChange({ kind: 'list', rows })} rows={audience.rows} />
      ) : null}
    </div>
  )
}

export const RETARGET_LABEL: Record<string, string> = {
  failed: 'failed',
  not_delivered: 'was not delivered',
  not_read: 'was not read',
  read: 'was read',
  clicked: 'got a click',
  not_clicked: 'got no click',
  replied: 'got a reply',
  not_replied: 'got no reply',
}

const optionalNumber = (raw: string): number | undefined => {
  const n = Number(raw)
  return raw.trim() && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
}

/** Drop undefined keys so the definition saved is minimal. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== '')) as T
}

export function SellerFiltersForm({
  filters,
  onChange,
}: {
  filters: WaSellerFilters
  onChange: (filters: WaSellerFilters) => void
}) {
  const set = (patch: Partial<WaSellerFilters>) => onChange(compact({ ...filters, ...patch }))
  const bool = (v: boolean | undefined) => (v === undefined ? '' : v ? 'yes' : 'no')
  const toBool = (v: string) => (v === '' ? undefined : v === 'yes')

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectInput
          label="Setup"
          value={filters.setup ?? ''}
          onChange={(e) => set({ setup: (e.target.value || undefined) as WaSellerFilters['setup'] })}
          options={[
            { value: '', label: 'Any' },
            { value: 'incomplete', label: 'Not finished' },
            { value: 'complete', label: 'Finished' },
          ]}
        />
        <TextInput
          label="Setup below (%)"
          type="number"
          min={1}
          max={100}
          value={filters.setupBelow ?? ''}
          placeholder="e.g. 50"
          onChange={(e) => set({ setupBelow: optionalNumber(e.target.value) })}
        />
        <SelectInput
          label="Store"
          value={bool(filters.published)}
          onChange={(e) => set({ published: toBool(e.target.value) })}
          options={[
            { value: '', label: 'Published or not' },
            { value: 'yes', label: 'Published (live)' },
            { value: 'no', label: 'Not published yet' },
          ]}
        />
        <SelectInput
          label="Products"
          value={bool(filters.hasProducts)}
          onChange={(e) => set({ hasProducts: toBool(e.target.value) })}
          options={[
            { value: '', label: 'Any' },
            { value: 'yes', label: 'Has live products' },
            { value: 'no', label: 'No products yet' },
          ]}
        />
        <SelectInput
          label="Orders"
          value={filters.orders ?? ''}
          onChange={(e) => set({ orders: (e.target.value || undefined) as WaSellerFilters['orders'] })}
          options={[
            { value: '', label: 'Any' },
            { value: 'none', label: 'No orders yet' },
            { value: 'any', label: 'Has orders' },
          ]}
        />
        <TextInput
          label="No order in the last (days)"
          type="number"
          min={1}
          max={365}
          value={filters.noOrdersInDays ?? ''}
          placeholder="e.g. 14"
          onChange={(e) => set({ noOrdersInDays: optionalNumber(e.target.value) })}
        />
        <TextInput
          label="Joined in the last (days)"
          type="number"
          min={1}
          value={filters.joinedWithinDays ?? ''}
          placeholder="e.g. 30"
          onChange={(e) => set({ joinedWithinDays: optionalNumber(e.target.value) })}
        />
        <TextInput
          label="State"
          value={filters.state ?? ''}
          placeholder="e.g. Kerala"
          maxLength={80}
          onChange={(e) => set({ state: e.target.value || undefined })}
        />
      </div>
      <StorePicker
        value={filters.storeIds ?? []}
        onChange={(storeIds) => set({ storeIds: storeIds.length > 0 ? storeIds : undefined })}
      />
    </div>
  )
}

/** Hand-pick stores — search, then add. Empty = every store the filters match. */
function StorePicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Map<string, string>>(new Map())
  const results = useAdminQuery(
    () => (q.trim().length >= 2 ? adminApi.searchWaStores(q.trim()) : Promise.resolve([])),
    [q],
  )

  return (
    <div className="space-y-2">
      <TextInput
        label="Only these stores (optional)"
        value={q}
        placeholder="Search by store name…"
        onChange={(e) => setQ(e.target.value)}
        hint={value.length === 0 ? 'Leave empty to include every store the filters match.' : undefined}
      />
      {results.data && results.data.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {results.data
            .filter((s) => !value.includes(s.id))
            .slice(0, 8)
            .map((s) => (
              <Button
                key={s.id}
                variant="ghost"
                onClick={() => {
                  setPicked(new Map(picked).set(s.id, s.name))
                  onChange([...value, s.id])
                }}
              >
                + {s.name}
              </Button>
            ))}
        </div>
      ) : null}
      {value.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {value.map((id) => (
            <Button
              key={id}
              variant="secondary"
              aria-label={`Remove ${picked.get(id) ?? 'store'}`}
              onClick={() => onChange(value.filter((v) => v !== id))}
            >
              {picked.get(id) ?? 'Store'} ×
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function ContactFiltersForm({
  filters,
  onChange,
}: {
  filters: WaContactFilters
  onChange: (filters: WaContactFilters) => void
}) {
  const tags = useAdminQuery(() => adminApi.listWaTags(), [])
  const selected = filters.tags ?? []
  const toggle = (tag: string) => {
    const next = selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]
    onChange(compact({ ...filters, tags: next.length > 0 ? next : undefined }))
  }

  return (
    <div className="space-y-3">
      <SelectInput
        label="Marketing consent"
        value={filters.optedIn === undefined ? '' : filters.optedIn ? 'yes' : 'no'}
        onChange={(e) =>
          onChange(
            compact({
              ...filters,
              optedIn: e.target.value === '' ? undefined : e.target.value === 'yes',
            }),
          )
        }
        options={[
          { value: '', label: 'Anyone' },
          { value: 'yes', label: 'Consented to marketing' },
          { value: 'no', label: 'No consent recorded' },
        ]}
      />
      <div>
        <p className="mb-1.5 text-sm font-medium text-fg">Tags (any of)</p>
        {!tags.data ? (
          <Skeleton rows={1} />
        ) : tags.data.length === 0 ? (
          <p className="text-sm text-muted">
            No tags yet — import contacts with tags on the Audiences tab, or tag them from a conversation.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tags.data.map((t) => (
              <Button
                key={t.tag}
                variant={selected.includes(t.tag) ? 'primary' : 'secondary'}
                aria-pressed={selected.includes(t.tag)}
                onClick={() => toggle(t.tag)}
              >
                {t.tag} · {t.count}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SegmentPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const segments = useAdminQuery(() => adminApi.listWaSegments(), [])
  if (segments.error) return <p className="text-sm text-danger">{segments.error}</p>
  if (!segments.data) return <Skeleton rows={1} />
  if (segments.data.length === 0) {
    return (
      <p className="text-sm text-muted">
        No saved segments yet — create one on the Audiences tab.
      </p>
    )
  }
  return (
    <SelectInput
      label="Segment"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={[
        { value: '', label: 'Choose a segment…' },
        ...segments.data.map((s: WaSegment) => ({
          value: s.id,
          label: `${s.name}${s.count !== null ? ` · ${formatCount(s.count)}` : ''}`,
        })),
      ]}
    />
  )
}

// ---- CSV -----------------------------------------------------------------------

/** One CSV line → cells. Handles "quoted, values" and "" escapes; tabs also split. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',' || ch === '\t') {
      cells.push(cell)
      cell = ''
    } else cell += ch
  }
  cells.push(cell)
  return cells.map((c) => c.trim())
}

/** "First Name" → "first_name" — a column header as a field key. */
export const fieldKey = (header: string) =>
  header
    .toLowerCase()
    .replace(/[^a-z]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)

const PHONE_HEADERS = ['phone', 'number', 'mobile', 'whatsapp', 'phone_number', 'mobile_number']

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
  phoneColumn: number
}

/** A CSV with a header row; the phone column is found by name, else the first. */
export function parseCsv(text: string): ParsedCsv | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return null
  const headers = splitCsvLine(lines[0]!).map(fieldKey)
  const named = headers.findIndex((h) => PHONE_HEADERS.includes(h))
  return {
    headers,
    rows: lines.slice(1).map(splitCsvLine),
    phoneColumn: named >= 0 ? named : 0,
  }
}

async function readSmallFile(file: File | undefined): Promise<string | null> {
  if (!file) return null
  if (file.size > 3_000_000) throw new Error('That file is over 3 MB — split it into smaller lists')
  return file.text()
}

function ListInput({
  rows,
  onChange,
}: {
  rows: { phone: string; fields: Record<string, string> }[]
  onChange: (rows: { phone: string; fields: Record<string, string> }[]) => void
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const parsed = useMemo(() => parseCsv(text), [text])

  useEffect(() => {
    if (!parsed) {
      if (rows.length > 0) onChange([])
      return
    }
    const next = parsed.rows
      .filter((cells) => (cells[parsed.phoneColumn] ?? '').replace(/\D/g, '').length > 0)
      .slice(0, 10_000)
      .map((cells) => ({
        phone: cells[parsed.phoneColumn] ?? '',
        fields: Object.fromEntries(
          parsed.headers
            .map((h, i) => [h, cells[i] ?? ''] as const)
            .filter(([h], i) => h && i !== parsed.phoneColumn),
        ),
      }))
    onChange(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- parse drives the rows
  }, [parsed])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="text-xs text-muted">
          A header row, then one person per line. Needs a <span className="font-mono">phone</span>{' '}
          column; every other column (e.g. <span className="font-mono">name</span>,{' '}
          <span className="font-mono">city</span>) becomes a field for the message.
        </p>
        <label className={buttonClass({ className: 'cursor-pointer' })}>
          Upload CSV
          <input
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="sr-only"
            onChange={(event) => {
              readSmallFile(event.target.files?.[0])
                .then((content) => {
                  setError(null)
                  if (content !== null) setText(content)
                })
                .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not read it'))
              event.target.value = ''
            }}
          />
        </label>
      </div>
      <TextArea
        aria-label="List"
        value={text}
        rows={7}
        placeholder={'phone,name,city\n919876543210,Asha,Kochi\n919812345678,Ravi,Pune'}
        onChange={(event) => setText(event.target.value)}
        className="font-mono"
      />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {parsed ? (
        <p className="text-sm text-muted">
          {plural(rows.length, 'row')} · phone from{' '}
          <span className="font-mono">{parsed.headers[parsed.phoneColumn] || 'column 1'}</span>
          {parsed.headers.length > 1
            ? ` · fields: ${parsed.headers.filter((h, i) => h && i !== parsed.phoneColumn).join(', ')}`
            : ''}
        </p>
      ) : text.trim() ? (
        <p className="text-sm text-danger">Add a header row and at least one person.</p>
      ) : null}
    </div>
  )
}

// ---- Preview -----------------------------------------------------------------------

/** Ready to resolve — a segment chosen, a list pasted. */
export function audienceComplete(audience: WaAudience): boolean {
  if (audience.kind === 'segment') return Boolean(audience.segmentId)
  if (audience.kind === 'list') return audience.rows.length > 0
  return true
}

/** The live server preview, debounced so typing a number doesn't fire per key. */
export function useAudiencePreview(audience: WaAudience) {
  const [debounced, setDebounced] = useState(audience)
  const key = JSON.stringify(audience)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(audience), 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content
  }, [key])
  const complete = audienceComplete(debounced)
  return useAdminQuery<WaAudiencePreview | null>(
    () => (complete ? adminApi.previewWaAudience(debounced) : Promise.resolve(null)),
    [JSON.stringify(debounced)],
  )
}

/** The field chips an audience offers to a mapping. */
export function fieldsFor(
  catalogue: WaFieldCatalogue | null,
  preview: WaAudiencePreview | null,
  audience: WaAudience,
): WaField[] {
  if (audience.kind === 'list') {
    const keys = new Set<string>(['phone'])
    for (const row of audience.rows.slice(0, 50)) Object.keys(row.fields).forEach((k) => keys.add(k))
    return [...keys].map((key) => ({
      key,
      label: key.replace(/_/g, ' '),
      example: audience.rows[0]?.fields[key] ?? (key === 'phone' ? '+919876543210' : key),
    }))
  }
  if (!catalogue) return []
  const kind = preview?.fieldKind ?? (audience.kind === 'contacts' ? 'contacts' : 'sellers')
  return kind === 'contacts' ? catalogue.contacts : kind === 'sellers' ? catalogue.sellers : []
}

export function AudienceSummary({
  preview,
  loading,
  error,
}: {
  preview: WaAudiencePreview | null
  loading: boolean
  error: string | null
}) {
  if (error) return <p className="text-sm text-danger">{error}</p>
  if (!preview) {
    return loading ? <Skeleton rows={2} /> : <p className="text-sm text-muted">Finish choosing the audience to see who is in it.</p>
  }
  const columns = preview.fieldKind === 'sellers' ? ['store_name', 'setup_percent', 'order_count'] : []
  return (
    <div className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="font-figure text-2xl font-bold text-fg">{formatCount(preview.total)}</p>
        <p className="text-sm text-muted">
          {preview.total === 1 ? 'person' : 'people'} with a WhatsApp number
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip tone="success">{formatCount(preview.optedIn)} with marketing consent</Chip>
        {preview.optedOut > 0 ? <Chip tone="danger">{formatCount(preview.optedOut)} opted out</Chip> : null}
        {preview.invalid > 0 ? <Chip tone="warning">{formatCount(preview.invalid)} without a usable number</Chip> : null}
        {preview.duplicates > 0 ? <Chip tone="neutral">{formatCount(preview.duplicates)} repeated numbers</Chip> : null}
      </div>
      {preview.sample.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-alt text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Number</th>
                {columns.map((c) => (
                  <th key={c} className="hidden px-3 py-2 font-medium sm:table-cell">
                    {c.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {preview.sample.slice(0, 8).map((m) => (
                <tr key={m.waId}>
                  <td className="max-w-[10rem] truncate px-3 py-2 text-fg">{m.name || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted">{formatWaId(m.waId)}</td>
                  {columns.map((c) => (
                    <td key={c} className="hidden max-w-[12rem] truncate px-3 py-2 text-muted sm:table-cell">
                      {m.fields[c] || '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {preview.total > 8 ? (
            <p className="border-t border-line px-3 py-2 text-xs text-muted">
              …and {formatCount(preview.total - 8)} more
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
