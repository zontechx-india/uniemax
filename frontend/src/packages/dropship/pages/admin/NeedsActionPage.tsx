import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../../shared/auth/http'
import { Badge } from '../../../../shared/ui/Badge'
import { Button } from '../../../../shared/ui/Button'
import { Dialog } from '../../../../shared/ui/Dialog'
import { ErrorNote, Select, TextField } from '../../../../shared/ui/form'
import { EmptyState, ErrorState, PageSkeleton } from '../../../../shared/ui/states'
import { adminNeedsApi } from '../../api'
import type { NeedsItem, NeedsKind } from '../../api'
import { dateTime, money, useLoad } from '../../ui'

const KINDS: Record<NeedsKind, { label: string; tone: 'danger' | 'pending' | 'brand'; hint: (i: NeedsItem) => string }> = {
  late: {
    label: 'Late',
    tone: 'pending',
    hint: (i) => `Not shipped yet${i.shipBy ? ` — was due ${new Date(i.shipBy).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}.`,
  },
  cant_ship: {
    label: "Can't ship",
    tone: 'danger',
    hint: (i) => `${i.closeReason ?? "The supplier couldn't ship it"}. The order is still open — it may need a manual partial refund.`,
  },
  came_back: { label: 'Came back', tone: 'danger', hint: () => 'The parcel came back to the supplier.' },
  problem: { label: 'Problem reported', tone: 'brand', hint: () => 'The seller reported a problem — see the support ticket.' },
  refund: {
    label: 'Refund to make',
    tone: 'danger',
    hint: (i) =>
      `A paid order was cancelled for a supplier reason. Refund ${i.orderTotal != null ? money(i.orderTotal) : 'the customer'} from the gateway dashboard.`,
  },
}

/**
 * Admin → Needs action: everything a person has to look at, in one list with a
 * filter. Each item goes away once someone resolves it with a note.
 */
export default function NeedsActionPage() {
  const [page, setPage] = useState(1)
  const [kind, setKind] = useState<NeedsKind | ''>('')
  const list = useLoad(() => adminNeedsApi.list(page, kind || undefined), [page, kind])
  const [resolving, setResolving] = useState<NeedsItem | null>(null)

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-fg">Needs action</h1>
          <p className="mt-1 text-sm text-muted">Supplier orders that need a person: late, couldn't ship, came back, problems and refunds.</p>
        </div>
        <Select
          className="h-tap"
          containerClassName="w-52"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as NeedsKind | '')
            setPage(1)
          }}
          aria-label="Filter by kind"
        >
          <option value="">Everything</option>
          {(Object.keys(KINDS) as NeedsKind[]).map((k) => (
            <option key={k} value={k}>
              {KINDS[k].label}
            </option>
          ))}
        </Select>
      </header>

      {list.loading && !list.data && <PageSkeleton label="Loading" />}
      {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
      {list.data && list.data.items.length === 0 && (
        <EmptyState title="Nothing needs action" description="Late parcels, problems and refunds show up here when there are any." />
      )}

      {list.data && list.data.items.length > 0 && (
        <ul className="space-y-3">
          {list.data.items.map((i) => (
            <li key={i.key} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={KINDS[i.kind].tone} dot>
                      {KINDS[i.kind].label}
                    </Badge>
                    <Link to={`/orders/${i.orderId}`} className="text-sm font-semibold text-brand underline">
                      Order #{i.orderNumber}
                    </Link>
                    <span className="text-xs text-muted">{dateTime(i.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm text-fg">{KINDS[i.kind].hint(i)}</p>
                  <p className="mt-1 text-xs text-muted">
                    Seller {i.seller} · Supplier {i.supplier}
                    {i.supplierShare != null ? ` · supplier gets ${money(i.supplierShare)}` : ''}
                  </p>
                  {i.kind === 'problem' && i.ticketId && (
                    <Link to={`/support/${i.ticketId}`} className="mt-1 inline-block text-sm font-semibold text-brand underline">
                      Open the support ticket
                    </Link>
                  )}
                </div>
                <Button variant="secondary" size="sm" onClick={() => setResolving(i)}>
                  Resolve
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {list.data && list.data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            Page {list.data.meta.page} of {list.data.meta.totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={page >= list.data.meta.totalPages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {resolving && (
        <ResolveDialog
          item={resolving}
          onClose={() => setResolving(null)}
          onDone={() => {
            setResolving(null)
            list.reload()
          }}
        />
      )}
    </div>
  )
}

function ResolveDialog({ item, onClose, onDone }: { item: NeedsItem; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (note.trim().length < 3) {
      setError('Add a short note on what was done')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await adminNeedsApi.resolve(item.supplierOrderId, note.trim())
      onDone()
    } catch (err) {
      setError(toApiError(err).message)
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      title={`Resolve order #${item.orderNumber}`}
      subtitle="The note is kept with the order. A reported problem tells the seller it was resolved."
      onClose={() => !busy && onClose()}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            Resolve
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <ErrorNote>{error}</ErrorNote>}
        <TextField label="What was done" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Dialog>
  )
}
