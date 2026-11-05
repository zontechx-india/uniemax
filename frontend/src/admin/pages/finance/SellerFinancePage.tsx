import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { adminApi } from '../../features/adminApi'
import type { LedgerEntry, StoreFinance } from '../../features/adminApi'
import { useAdminList, useAdminQuery } from '../../features/useAdminQuery'
import { Dialog } from '../../../shared/ui/Dialog'
import { Button, Card, CardHeader, Chip, Detail, ErrorState, PageHeader, SelectInput, Skeleton, TextArea, TextInput } from '../../ui/primitives'
import { DataTable, Pagination } from '../../ui/DataTable'
import type { Column } from '../../ui/DataTable'
import { FilterSelect, Toolbar } from '../../ui/Toolbar'
import { StatTile } from '../../ui/StatTile'
import { formatDateTime, formatMoneyExact } from '../../ui/format'
import { BackIcon } from '../../layout/icons'
import { BUCKET_LABEL, ENTRY_LABEL, signed } from '../../../shared/finance/ledgerLabels'

/**
 * One seller's money: the three balances, delivered-order totals and the
 * full ledger — every entry with the balance before and after. Entries are
 * never edited; a correction is a new entry ("Adjust balance") with a reason.
 */

export default function SellerFinancePage() {
  const { storeId = '' } = useParams()
  const navigate = useNavigate()
  const summary = useAdminQuery(() => adminApi.getStoreFinance(storeId), [storeId])
  const ledger = useAdminList<LedgerEntry>((query) => adminApi.listLedger(storeId, query), { keys: ['bucket'] })
  const [adjusting, setAdjusting] = useState(false)

  const columns: Column<LedgerEntry>[] = [
    {
      header: 'Entry',
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-fg">{ENTRY_LABEL[row.type]}</p>
          <p className="truncate text-xs text-muted">{row.description}</p>
          {row.orderId ? (
            <Link to={`/orders/${row.orderId}`} className="text-xs text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
              {row.orderNumber ?? 'Open order'}
            </Link>
          ) : null}
        </div>
      ),
    },
    {
      header: 'Balance',
      hideOnMobile: true,
      cell: (row) => <Chip>{BUCKET_LABEL[row.bucket].admin}</Chip>,
    },
    {
      header: 'When',
      hideOnMobile: true,
      cell: (row) => (
        <span className="text-sm text-muted">
          {formatDateTime(row.createdAt)}
          {row.createdByEmail ? <span className="block text-xs">by {row.createdByEmail}</span> : null}
        </span>
      ),
    },
    {
      header: 'Amount',
      className: 'text-right',
      cell: (row) => <span className="font-figure font-medium">{signed(row.amount, formatMoneyExact)}</span>,
    },
    {
      header: 'Balance after',
      hideOnMobile: true,
      className: 'text-right',
      cell: (row) => <span className="font-figure text-muted">{formatMoneyExact(row.balanceAfter)}</span>,
    },
  ]

  if (summary.error) return <ErrorState message={summary.error} onRetry={summary.refresh} />
  if (!summary.data) return <Skeleton rows={10} />
  const data = summary.data

  return (
    <>
      <Button variant="ghost" onClick={() => navigate(-1)} className="mb-3 -ml-2">
        <BackIcon />
        Back
      </Button>
      <PageHeader
        title={data.store.name}
        subtitle={
          <>
            Platform fee now {Number(data.rates.platform.percent)}% ·{' '}
            <Link to={`/stores/${data.store.id}`} className="text-accent hover:underline">
              Open store
            </Link>
          </>
        }
        actions={<Button onClick={() => setAdjusting(true)}>Adjust balance</Button>}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile label="We owe the seller" value={formatMoneyExact(data.balance.payable)} hint="Ready to pay" />
        <StatTile label="Being paid" value={formatMoneyExact(data.balance.inPayout)} hint="Payouts not finished" />
        <StatTile
          label="Seller owes UnieMax"
          value={formatMoneyExact(data.balance.owed)}
          hint="COD platform fees"
          tone={Number(data.balance.owed) > 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Totals title="Online orders (delivered)" t={data.delivered.online} />
        <Totals title="Cash on delivery (delivered)" t={data.delivered.cod} />
      </div>

      <Card padding="none">
        <div className="px-4 pt-4 sm:px-5">
          <CardHeader title="Ledger" subtitle="Every movement of this seller's money, newest first." className="mb-2" />
        </div>
        <Toolbar>
          <FilterSelect
            label="Balance"
            value={ledger.filters['bucket'] ?? ''}
            onChange={(value) => ledger.setFilter('bucket', value)}
            options={[
              { value: '', label: 'All balances' },
              { value: 'PAYABLE', label: BUCKET_LABEL.PAYABLE.admin },
              { value: 'IN_PAYOUT', label: BUCKET_LABEL.IN_PAYOUT.admin },
              { value: 'OWED', label: BUCKET_LABEL.OWED.admin },
            ]}
          />
        </Toolbar>
        <DataTable
          rows={ledger.rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={ledger.loading}
          error={ledger.error}
          onRetry={ledger.refresh}
          empty={{ title: 'No entries yet', hint: 'Entries appear when this store’s orders are delivered.' }}
        />
        <Pagination
          page={ledger.meta.page}
          totalPages={ledger.meta.totalPages}
          total={ledger.meta.total}
          onPage={ledger.setPage}
          busy={ledger.loading}
        />
      </Card>

      {adjusting ? (
        <AdjustDialog
          storeId={storeId}
          onClose={() => setAdjusting(false)}
          onSaved={() => {
            setAdjusting(false)
            summary.refresh()
            ledger.refresh()
          }}
        />
      ) : null}
    </>
  )
}

function Totals({ title, t }: { title: string; t: StoreFinance['delivered']['online'] }) {
  return (
    <Card>
      <CardHeader title={title} className="mb-2" />
      <dl>
        <Detail label="Orders">{t.orders}</Detail>
        <Detail label="Sales">{formatMoneyExact(t.sales)}</Detail>
        <Detail label="Platform fees">{formatMoneyExact(t.platformFees)}</Detail>
        <Detail label="Gateway fees">{formatMoneyExact(t.gatewayFees)}</Detail>
      </dl>
    </Card>
  )
}

function AdjustDialog({ storeId, onClose, onSaved }: { storeId: string; onClose: () => void; onSaved: () => void }) {
  const [idempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
  )
  const [bucket, setBucket] = useState<'PAYABLE' | 'OWED'>('OWED')
  const [direction, setDirection] = useState<'INCREASE' | 'DECREASE'>('DECREASE')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const amountOk = /^\d{1,8}(\.\d{1,2})?$/.test(amount.trim()) && Number(amount) > 0
  const canSave = amountOk && reason.trim().length >= 5

  async function save() {
    setBusy(true)
    setSaveError(null)
    try {
      await adminApi.addAdjustment(storeId, { bucket, direction, amount: amount.trim(), reason: reason.trim(), idempotencyKey })
      onSaved()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the correction')
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      title="Adjust balance"
      subtitle="Adds a correction entry. Nothing already on the ledger is changed."
      onClose={() => {
        if (!busy) onClose()
      }}
      footer={
        <>
          {saveError ? <p className="mr-auto text-sm text-danger">{saveError}</p> : null}
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSave || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save correction'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectInput
            label="Balance"
            value={bucket}
            onChange={(e) => setBucket(e.target.value as 'PAYABLE' | 'OWED')}
            options={[
              { value: 'OWED', label: BUCKET_LABEL.OWED.admin },
              { value: 'PAYABLE', label: BUCKET_LABEL.PAYABLE.admin },
            ]}
          />
          <SelectInput
            label="Change"
            value={direction}
            onChange={(e) => setDirection(e.target.value as 'INCREASE' | 'DECREASE')}
            options={[
              { value: 'DECREASE', label: 'Decrease' },
              { value: 'INCREASE', label: 'Increase' },
            ]}
          />
        </div>
        <TextInput
          label="Amount (₹)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={amount !== '' && !amountOk}
        />
        <TextArea
          label="Reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint="The seller sees this on their Earnings page."
        />
      </div>
    </Dialog>
  )
}
