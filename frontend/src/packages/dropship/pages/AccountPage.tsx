import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { Badge } from '../../../shared/ui/Badge'
import { Button, buttonClass } from '../../../shared/ui/Button'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { Dialog } from '../../../shared/ui/Dialog'
import { ErrorNote, InfoNote, TextField } from '../../../shared/ui/form'
import { EmptyState, ErrorState, PageSkeleton } from '../../../shared/ui/states'
import { useManagedStore } from '../../../storefront/features/stores/useManagedStore'
import { RupeeIcon } from '../../../storefront/layout/icons'
import { PageHeader, showToast } from '../../../storefront/pages/stores/ui'
import { accountApi, sellerSuppliersApi, supplierApi } from '../api'
import type { Account, AccountLine, AccountPayment } from '../api'
import { TermsLog, money, shortDate, useLoad } from '../ui'

/**
 * The account with one supplier (seller side) or one seller (supplier side):
 * who owes whom, line by line, and the payments either of you recorded. Both
 * sides see the same numbers in their own words. UnieMax only keeps the
 * record — the money moves directly between you.
 */
export const SellerAccountPage = () => <AccountPage side="seller" />
export const SupplierAccountPage = () => <AccountPage side="supplier" />

function AccountPage({ side }: { side: 'seller' | 'supplier' }) {
  const { store } = useManagedStore()
  const { linkId = '' } = useParams()
  const account = useLoad(() => accountApi.get(side, store.id, linkId), [store.id, linkId, side])
  const terms = useLoad(
    () => (side === 'seller' ? sellerSuppliersApi.terms(store.id, linkId) : supplierApi.terms(store.id, linkId)),
    [store.id, linkId, side],
  )
  const [recording, setRecording] = useState(false)
  const [removing, setRemoving] = useState<AccountPayment | null>(null)
  const [busy, setBusy] = useState(false)
  const data = account.data

  const remove = async () => {
    if (!removing) return
    setBusy(true)
    try {
      account.setData(await accountApi.remove(side, store.id, linkId, removing.id))
      showToast('Payment removed')
    } catch (err) {
      showToast(toApiError(err).message, 'danger')
      account.reload()
    } finally {
      setBusy(false)
      setRemoving(null)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={RupeeIcon}
        title={data ? `Account with ${data.other.name}` : 'Account'}
        description="Who owes whom for the orders you share. Record a payment when money moves between you."
        action={
          <Link to="../.." relative="path" className={buttonClass({ variant: 'ghost', size: 'md' })}>
            {side === 'seller' ? 'Back to suppliers' : 'Back to sellers'}
          </Link>
        }
      />

      {account.loading && !data && <PageSkeleton label="Loading the account" />}
      {account.error && <ErrorState message={account.error} onRetry={account.reload} />}

      {data && (
        <>
          <section className="rounded-lg border border-line bg-surface p-4">
            <p className="text-xl font-semibold text-fg">{data.words}</p>
            <p className="mt-1 text-sm text-muted">
              Only delivered orders count. An order on hold or still on its way is shown but not added up.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => setRecording(true)}>Record a payment</Button>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-fg">Payments</h2>
            {data.payments.length === 0 ? (
              <p className="text-sm text-muted">No payments recorded yet.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                {data.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-fg">
                        {p.text} {money(p.amount)}
                      </p>
                      <p className="text-xs text-muted">
                        {shortDate(p.paidOn)}
                        {p.reference ? ` · ${p.reference}` : ''}
                        {p.note ? ` · ${p.note}` : ''}
                        {p.recordedByYou ? ' · recorded by you' : ' · recorded by them'}
                      </p>
                    </div>
                    {p.canDelete && (
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(p)}>
                        Delete
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-fg">Orders</h2>
            {data.lines.length === 0 ? (
              <EmptyState
                compact
                icon={RupeeIcon}
                title="No orders yet"
                description="Orders for this relationship show up here as they are placed."
              />
            ) : (
              <ul className="space-y-2">
                {data.lines.map((l) => (
                  <LineRow key={l.supplierOrderId} line={l} side={side} />
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-fg">Terms</h2>
            {terms.data ? <TermsLog log={terms.data.log} viewer={side} /> : <p className="text-sm text-muted">Loading…</p>}
          </section>
        </>
      )}

      {recording && data && (
        <RecordSheet
          side={side}
          storeId={store.id}
          linkId={linkId}
          account={data}
          onClose={() => setRecording(false)}
          onDone={(next) => {
            account.setData(next)
            setRecording(false)
            showToast('Payment recorded — they have been told')
          }}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Delete this payment?"
        description={
          removing
            ? `${removing.text} ${money(removing.amount)} will be taken off the account, and ${data?.other.name ?? 'the other side'} is told. It stays in the record for audit.`
            : ''
        }
        confirmLabel="Delete"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  )
}

function LineRow({ line: l, side }: { line: AccountLine; side: 'seller' | 'supplier' }) {
  const tone = l.state === 'OWED' ? 'brand' : l.state === 'HELD' ? 'pending' : l.state === 'VOID' ? 'danger' : 'neutral'
  const amountText =
    l.state === 'VOID' ? '—' : l.forYou === 0 ? '—' : l.forYou > 0 ? `You get ${money(l.forYou)}` : `You owe ${money(-l.forYou)}`
  return (
    <li className="rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        {side === 'seller' ? (
          <Link to={`../../../orders/${l.orderId}`} relative="path" className="text-sm font-semibold text-brand underline">
            Order #{l.orderNumber}
          </Link>
        ) : (
          <span className="text-sm font-semibold text-fg">Order #{l.orderNumber}</span>
        )}
        <Badge tone={tone} dot>
          {l.stateText}
        </Badge>
        <span className="ml-auto text-xs text-muted">{shortDate(l.date)}</span>
      </div>
      <p className="mt-1 text-sm text-fg">
        {l.paymentMode === 'COD' ? 'Cash on delivery' : 'Prepaid'}
        {l.customerPaid != null ? ` · customer paid ${money(l.customerPaid)}` : ''}
        {` · supplier gets ${money(l.supplierGets)}`}
      </p>
      <p className={`mt-1 text-sm font-semibold ${l.counts ? 'text-fg' : 'text-muted'}`}>{amountText}</p>
    </li>
  )
}

function RecordSheet({
  side,
  storeId,
  linkId,
  account,
  onClose,
  onDone,
}: {
  side: 'seller' | 'supplier'
  storeId: string
  linkId: string
  account: Account
  onClose: () => void
  onDone: (next: Account) => void
}) {
  const name = account.other.name
  // Prefill with what is owed, from the side that would pay it.
  const youOwe = account.balance < 0
  const [paid, setPaid] = useState<'me' | 'them'>(youOwe ? 'me' : 'them')
  const [amount, setAmount] = useState(account.balance === 0 ? '' : String(Math.abs(account.balance)))
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter the amount that was paid')
      return
    }
    setBusy(true)
    setError(null)
    try {
      onDone(await accountApi.record(side, storeId, linkId, { paid, amount: value, paidOn, reference: reference.trim() || null, note: note.trim() || null }))
    } catch (err) {
      setError(toApiError(err).message)
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      title="Record a payment"
      subtitle="Only record money that really moved between you. UnieMax doesn't move it."
      onClose={() => !busy && onClose()}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            Record payment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Who paid">
          <Button size="sm" variant={paid === 'me' ? 'primary' : 'secondary'} aria-pressed={paid === 'me'} onClick={() => setPaid('me')}>
            I paid {name}
          </Button>
          <Button size="sm" variant={paid === 'them' ? 'primary' : 'secondary'} aria-pressed={paid === 'them'} onClick={() => setPaid('them')}>
            {name} paid me
          </Button>
        </div>
        <TextField label="Amount (₹)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
        <TextField label="Date paid" type="date" value={paidOn} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setPaidOn(e.target.value)} />
        <TextField label="UPI or bank reference (optional)" value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} />
        <TextField label="Note (optional)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        <InfoNote>{name} is told about this payment and can see it on their account.</InfoNote>
      </div>
    </Dialog>
  )
}
