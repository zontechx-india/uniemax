import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '../../../shared/ui/Alert'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { Dialog } from '../../../shared/ui/Dialog'
import { showToast } from '../../../shared/ui/Toast'
import { adminApi } from '../../features/adminApi'
import type { WaAudience, WaSegment, WaSegmentDefinition } from '../../features/adminApi'
import { useAdminQuery } from '../../features/useAdminQuery'
import { Button, Chip, ErrorState, Skeleton, TextArea, TextInput, buttonClass } from '../../ui/primitives'
import { formatCount, formatRelative } from '../../ui/format'
import { AudienceEditor, AudienceSummary, parseCsv, useAudiencePreview } from './audienceUi'
import { WhatsAppShell, plural } from './whatsappUi'

/**
 * Audiences — saved segments (a sellers or contacts filter, resolved fresh
 * every time it is used), contact import with tags and consent, and the tags
 * in use.
 */

export default function WhatsAppAudiencesPage() {
  const [editing, setEditing] = useState<WaSegment | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const segments = useAdminQuery(() => adminApi.listWaSegments(), [])
  const tags = useAdminQuery(() => adminApi.listWaTags(), [])

  return (
    <WhatsAppShell
      actions={
        <div className="flex flex-wrap gap-2">
          <Button size="md" onClick={() => setImporting(true)}>
            Import contacts
          </Button>
          <Button variant="primary" size="md" onClick={() => setEditing('new')}>
            New segment
          </Button>
        </div>
      }
    >
      {() => (
        <div className="space-y-6 p-4 sm:p-5">
          <section>
            <h2 className="text-base font-semibold text-fg">Saved segments</h2>
            <p className="mb-3 text-sm text-muted">
              Who a campaign is for, saved for reuse. Sizes are counted now — they change as
              sellers set up, publish and sell.
            </p>
            <SegmentList
              segments={segments.data}
              error={segments.error}
              onRetry={segments.refresh}
              onEdit={setEditing}
              onDeleted={segments.refresh}
            />
          </section>

          <section>
            <h2 className="text-base font-semibold text-fg">Tags</h2>
            <p className="mb-3 text-sm text-muted">
              Labels on contacts — from imports or added in a conversation. Target them with a
              Contacts audience.
            </p>
            {tags.error ? (
              <ErrorState message={tags.error} onRetry={tags.refresh} />
            ) : !tags.data ? (
              <Skeleton rows={1} />
            ) : tags.data.length === 0 ? (
              <p className="text-sm text-muted">No tags yet. Import contacts with a tag to start.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.data.map((t) => (
                  <Link
                    key={t.tag}
                    to={`/whatsapp/inbox?tag=${encodeURIComponent(t.tag)}`}
                    className={buttonClass({})}
                  >
                    {t.tag} · {formatCount(t.count)}
                  </Link>
                ))}
              </div>
            )}
          </section>

          <SegmentDialog
            segment={editing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null)
              segments.refresh()
            }}
          />
          <ImportDialog
            open={importing}
            onClose={() => setImporting(false)}
            onDone={() => {
              tags.refresh()
              segments.refresh()
            }}
          />
        </div>
      )}
    </WhatsAppShell>
  )
}

const KIND_LABEL: Record<string, string> = { sellers: 'Sellers', contacts: 'Contacts' }

function SegmentList({
  segments,
  error,
  onRetry,
  onEdit,
  onDeleted,
}: {
  segments: WaSegment[] | null
  error: string | null
  onRetry: () => void
  onEdit: (segment: WaSegment) => void
  onDeleted: () => void
}) {
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState<WaSegment | null>(null)
  const [busy, setBusy] = useState(false)

  if (error) return <ErrorState message={error} onRetry={onRetry} />
  if (!segments) return <Skeleton rows={3} />
  if (segments.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line p-6 text-center">
        <p className="text-sm font-medium text-fg">No segments yet</p>
        <p className="mt-1 text-sm text-muted">
          For example “Sellers who haven&apos;t finished setup” or “Live stores with no orders in
          14 days”. Create one with New segment.
        </p>
      </div>
    )
  }

  const remove = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await adminApi.deleteWaSegment(deleting.id)
      showToast('Segment deleted')
      onDeleted()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete', 'danger')
    } finally {
      setBusy(false)
      setDeleting(null)
    }
  }

  return (
    <>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {segments.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
            <div className="min-w-0">
              <p className="truncate font-medium text-fg">{s.name}</p>
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <Chip tone="neutral">{KIND_LABEL[s.definition.kind] ?? s.definition.kind}</Chip>
                <span>{s.count === null ? 'Size unknown' : plural(s.count, 'person', 'people')}</span>
                <span>· updated {formatRelative(s.updatedAt).toLowerCase()}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setDeleting(s)}>
                Delete
              </Button>
              <Button onClick={() => onEdit(s)}>Edit</Button>
              <Button variant="secondary" onClick={() => navigate(`/whatsapp/campaigns/new?segment=${s.id}`)}>
                Use in campaign
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this segment?"
        description="Campaigns already sent to it keep their recipients. It just won't be offered any more."
        confirmLabel="Delete"
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}

function SegmentDialog({
  segment,
  onClose,
  onSaved,
}: {
  segment: WaSegment | 'new' | null
  onClose: () => void
  onSaved: () => void
}) {
  const open = segment !== null
  const existing = segment && segment !== 'new' ? segment : null
  return open ? (
    <SegmentForm key={existing?.id ?? 'new'} existing={existing} onClose={onClose} onSaved={onSaved} />
  ) : null
}

function SegmentForm({
  existing,
  onClose,
  onSaved,
}: {
  existing: WaSegment | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [definition, setDefinition] = useState<WaSegmentDefinition>(
    existing?.definition ?? { kind: 'sellers', filters: { setup: 'incomplete' } },
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const preview = useAudiencePreview(definition)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const body = { name: name.trim(), definition }
      if (existing) await adminApi.updateWaSegment(existing.id, body)
      else await adminApi.createWaSegment(body)
      showToast('Segment saved')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      title={existing ? 'Edit segment' : 'New segment'}
      subtitle="Saved as a rule — who is in it is worked out each time it's used"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || !name.trim()} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save segment'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <TextInput
          label="Name"
          value={name}
          maxLength={120}
          placeholder="Sellers who haven't finished setup"
          onChange={(event) => setName(event.target.value)}
        />
        <AudienceEditor
          audience={definition}
          kinds={['sellers', 'contacts']}
          onChange={(next: WaAudience) => {
            if (next.kind === 'sellers' || next.kind === 'contacts') setDefinition(next)
          }}
        />
        <div className="border-t border-line pt-4">
          <AudienceSummary preview={preview.data} loading={preview.loading} error={preview.error} />
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    </Dialog>
  )
}

// ---- Import --------------------------------------------------------------------

const YES = new Set(['yes', 'y', 'true', '1', 'opted_in', 'agreed'])

/** The server's tag rule — anything else would refuse the whole import. */
const isTag = (t: string) => /^[a-z0-9][a-z0-9 _-]{0,39}$/.test(t)

function ImportDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [text, setText] = useState('')
  const [tagText, setTagText] = useState('')
  const [allConsented, setAllConsented] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ created: number; updated: number; invalidCount: number } | null>(null)

  const parsed = useMemo(() => parseCsv(text), [text])
  const rows = useMemo(() => {
    if (!parsed) return []
    const col = (names: string[]) => parsed.headers.findIndex((h) => names.includes(h))
    const nameCol = col(['name', 'full_name', 'first_name'])
    const tagsCol = col(['tags', 'tag'])
    const consentCol = col(['opted_in', 'optin', 'consent', 'marketing'])
    return parsed.rows.slice(0, 5000).map((cells) => ({
      phone: cells[parsed.phoneColumn] ?? '',
      ...(nameCol >= 0 && cells[nameCol] ? { name: cells[nameCol]!.slice(0, 120) } : {}),
      tags:
        tagsCol >= 0
          ? (cells[tagsCol] ?? '')
              .split(/[;|]/)
              .map((t) => t.trim().toLowerCase())
              .filter(isTag)
          : [],
      optIn: allConsented || (consentCol >= 0 && YES.has((cells[consentCol] ?? '').trim().toLowerCase())),
    }))
  }, [parsed, allConsented])
  const extraTags = tagText
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(isTag)

  const close = () => {
    setText('')
    setTagText('')
    setAllConsented(false)
    setResult(null)
    setError(null)
    onClose()
  }

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await adminApi.importWaContacts({ rows, tags: extraTags })
      setResult(r)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      size="lg"
      onClose={close}
      title="Import contacts"
      subtitle="Adds new numbers and merges tags into existing ones — nothing is sent"
      footer={
        result ? (
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" disabled={busy || rows.length === 0} onClick={() => void run()}>
              {busy ? 'Importing…' : rows.length > 0 ? `Import ${formatCount(rows.length)}` : 'Import'}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <Alert tone="success" title="Imported">
          {plural(result.created, 'new contact')}, {plural(result.updated, 'updated contact')}
          {result.invalidCount > 0 ? `, ${plural(result.invalidCount, 'row')} skipped (no usable number)` : ''}.
        </Alert>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            A CSV with a header row. Columns used: <span className="font-mono">phone</span>{' '}
            (required), <span className="font-mono">name</span>,{' '}
            <span className="font-mono">tags</span> (separate several with ;) and{' '}
            <span className="font-mono">opted_in</span> (yes/no).
          </p>
          <div className="flex justify-end">
            <label className={buttonClass({ className: 'cursor-pointer' })}>
              Upload CSV
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (!file) return
                  if (file.size > 3_000_000) {
                    setError('That file is over 3 MB — split it')
                    return
                  }
                  void file.text().then(setText)
                }}
              />
            </label>
          </div>
          <TextArea
            aria-label="Contacts CSV"
            value={text}
            rows={7}
            className="font-mono"
            placeholder={'phone,name,tags,opted_in\n919876543210,Asha,vip;kochi,yes\n919812345678,Ravi,,no'}
            onChange={(event) => setText(event.target.value)}
          />
          <TextInput
            label="Tag everyone in this import (optional)"
            value={tagText}
            placeholder="e.g. expo-2026"
            hint="Separate several with commas"
            onChange={(event) => setTagText(event.target.value)}
          />
          <label className="flex cursor-pointer items-start gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={allConsented}
              onChange={(event) => setAllConsented(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
            />
            <span>
              Everyone on this list agreed to marketing messages
              <span className="block text-xs text-muted">
                Only if you collected that consent (a signup form, an event sheet). An import
                never removes consent someone already gave.
              </span>
            </span>
          </label>
          {parsed ? (
            <p className="text-sm text-muted">
              {plural(rows.length, 'row')} ready · {plural(rows.filter((r) => r.optIn).length, 'with consent', 'with consent')}
            </p>
          ) : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      )}
    </Dialog>
  )
}
