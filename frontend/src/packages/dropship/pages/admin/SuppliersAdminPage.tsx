import { useState } from 'react'
import { toApiError } from '../../../../shared/auth/http'
import { Badge } from '../../../../shared/ui/Badge'
import { Button } from '../../../../shared/ui/Button'
import { Dialog } from '../../../../shared/ui/Dialog'
import { ErrorNote, Select, TextField } from '../../../../shared/ui/form'
import { EmptyState, ErrorState, PageSkeleton } from '../../../../shared/ui/states'
import { adminSuppliersApi } from '../../api'
import type { AdminSupplier, SupplierStatus } from '../../api'
import { dayText, money, returnsText, shortDate, useLoad } from '../../ui'

const STATUS: Record<SupplierStatus, { text: string; tone: 'success' | 'pending' | 'danger' }> = {
  ACTIVE: { text: 'Active', tone: 'success' },
  PENDING: { text: 'Waiting for approval', tone: 'pending' },
  SUSPENDED: { text: 'Suspended', tone: 'danger' },
}

/**
 * Admin → Suppliers: every supplier with its store, the sellers it supplies,
 * status and join date. Suspend / Restore with a note (SU-8).
 */
export default function SuppliersAdminPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<SupplierStatus | ''>('')
  const list = useLoad(() => adminSuppliersApi.list(page, status || undefined), [page, status])
  const [acting, setActing] = useState<{ supplier: AdminSupplier; to: 'suspend' | 'restore' } | null>(null)

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-fg">Suppliers</h1>
          <p className="mt-1 text-sm text-muted">
            Stores that ship orders for the sellers who invited them.
          </p>
        </div>
        <Select
          className="h-tap"
          containerClassName="w-48"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as SupplierStatus | '')
            setPage(1)
          }}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="PENDING">Waiting for approval</option>
        </Select>
      </header>

      {list.loading && !list.data && <PageSkeleton label="Loading suppliers" />}
      {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
      {list.data && list.data.items.length === 0 && (
        <EmptyState title="No suppliers yet" description="Sellers invite their own suppliers; they appear here once they join." />
      )}

      {list.data && list.data.items.length > 0 && (
        <ul className="space-y-3">
          {list.data.items.map((s) => (
            <li key={s.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-fg">{s.store?.name ?? s.storeId}</span>
                    <Badge tone={STATUS[s.status].tone} dot>
                      {STATUS[s.status].text}
                    </Badge>
                    {s.supplyOnly && <Badge tone="neutral">Supplier account</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Joined {shortDate(s.createdAt)} · fee {money(s.shippingFee)} · ships within{' '}
                    {dayText(s.shipWithinDays)} · {returnsText(s.returnDays).toLowerCase()}
                    {s.store?.phone ? ` · ${s.store.phone}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Supplies:{' '}
                    {s.sellers.length === 0
                      ? '—'
                      : s.sellers.map((l) => `${l.store?.name ?? '?'} (${l.status.toLowerCase()})`).join(', ')}
                  </p>
                  {s.statusNote && <p className="mt-1 text-xs text-fg">Note: {s.statusNote}</p>}
                </div>
                {s.status === 'SUSPENDED' ? (
                  <Button variant="secondary" size="sm" onClick={() => setActing({ supplier: s, to: 'restore' })}>
                    Restore
                  </Button>
                ) : (
                  <Button variant="danger" size="sm" onClick={() => setActing({ supplier: s, to: 'suspend' })}>
                    Suspend
                  </Button>
                )}
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
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= list.data.meta.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {acting && (
        <StatusDialog
          {...acting}
          onClose={() => setActing(null)}
          onDone={() => {
            setActing(null)
            list.reload()
          }}
        />
      )}
    </div>
  )
}

function StatusDialog({
  supplier,
  to,
  onClose,
  onDone,
}: {
  supplier: AdminSupplier
  to: 'suspend' | 'restore'
  onClose: () => void
  onDone: () => void
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = supplier.store?.name ?? 'this supplier'

  const submit = async () => {
    if (!note.trim()) {
      setError('Add a note — the supplier sees it')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (to === 'suspend') await adminSuppliersApi.suspend(supplier.id, note.trim())
      else await adminSuppliersApi.restore(supplier.id, note.trim())
      onDone()
    } catch (err) {
      setError(toApiError(err).message)
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      title={to === 'suspend' ? `Suspend ${name}?` : `Restore ${name}?`}
      subtitle={
        to === 'suspend'
          ? 'It can no longer manage what it supplies. Its sellers are unaffected for now.'
          : 'It can supply its sellers again.'
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={to === 'suspend' ? 'danger' : 'primary'} loading={busy} onClick={submit}>
            {to === 'suspend' ? 'Suspend' : 'Restore'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 pb-1">
        <TextField
          label="Note (the supplier sees it)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
        />
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Dialog>
  )
}
