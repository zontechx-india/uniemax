import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { adminApi } from '../../features/adminApi'
import type {
  ManualPayoutInput,
  OrderMessageChannel,
  OrderPayouts,
  Payout,
  PayoutMessagePreview,
  PayoutStatus,
} from '../../features/adminApi'
import { Tabs } from '../../ui/Toolbar'
import { EmailPreview, WhatsAppPreview } from './OrderMessagesCard'
import { useAdminQuery } from '../../features/useAdminQuery'
import { Dialog } from '../../../shared/ui/Dialog'
import { Alert } from '../../../shared/ui/Alert'
import {
  Button,
  Card,
  CardHeader,
  ErrorState,
  SelectInput,
  Skeleton,
  TextArea,
  TextInput,
} from '../../ui/primitives'
import { BankStatusChip, PayoutMethodChip, PayoutStatusChip, payoutStatusLabel } from '../../ui/statusMeta'
import { formatDate, formatDateTime, formatMoneyExact } from '../../ui/format'

/**
 * Seller payout for one order — the money UnieMax sends the seller after an
 * online-paid order is delivered. Tracked apart from the order status.
 *
 * Two ways to pay, one history:
 *   - Record manual payout: the admin already sent the money from a savings
 *     account and writes down what happened.
 *   - Pay via PaymentHub: the hub sends it (off until the hub offers payouts).
 *
 * The server owns every number here (totals, what is left, what is allowed);
 * the page never does money maths.
 */

type Summary = OrderPayouts['summary']

/** Today's date in India — the default "paid on" day. */
function todayInIndia(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)
}

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

export function OrderPayoutCard({ orderId }: { orderId: string }) {
  const { data, loading, error, refresh } = useAdminQuery(() => adminApi.getOrderPayouts(orderId), [orderId])
  const [dialog, setDialog] = useState<
    { kind: 'manual' } | { kind: 'gateway' } | { kind: 'status'; payout: Payout } | null
  >(null)
  const [notice, setNotice] = useState<string | null>(null)

  const done = (message: string) => {
    setDialog(null)
    setNotice(message)
    refresh()
  }

  return (
    <Card>
      <CardHeader
        title="Seller payout"
        subtitle="Money sent to the seller for this order. Separate from the order status."
      />
      {error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : !data || loading ? (
        <Skeleton rows={4} />
      ) : (
        <div className="space-y-4">
          {notice ? (
            <Alert tone="success">
              <span role="status">{notice}</span>
            </Alert>
          ) : null}

          {/* No payout applies yet (COD, undelivered…) and none was made:
              the reason alone — totals with "left to pay" would mislead. */}
          {data.payouts.length > 0 || data.summary.blockers.length === 0 ? (
            <>
              <Totals summary={data.summary} />
              <PayTo summary={data.summary} />
            </>
          ) : null}

          {data.summary.blockers.length > 0 ? (
            <Alert tone="info">{data.summary.blockers.join(' ')}</Alert>
          ) : data.summary.canPay ? (
            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button variant="primary" onClick={() => setDialog({ kind: 'manual' })}>
                  Record manual payout
                </Button>
                <Button
                  disabled={!data.summary.gateway.available}
                  onClick={() => setDialog({ kind: 'gateway' })}
                >
                  Pay via PaymentHub
                </Button>
              </div>
              {data.summary.gateway.reason ? (
                <p className="text-xs text-muted">{data.summary.gateway.reason}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted">
              Nothing is left to pay on this order (paid out or in progress).
            </p>
          )}

          {data.payouts.length > 0 ? (
            <section aria-label="Payout history">
              <h3 className="mb-1 text-sm font-semibold text-fg">History</h3>
              <ul className="divide-y divide-line">
                {data.payouts
                  .slice()
                  .reverse()
                  .map((payout) => (
                    <PayoutItem
                      key={payout.id}
                      orderId={orderId}
                      payout={payout}
                      onChangeStatus={() => setDialog({ kind: 'status', payout })}
                      onResent={(message) => done(message)}
                    />
                  ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}

      {data && dialog?.kind === 'manual' ? (
        <ManualPayoutDialog
          orderId={orderId}
          summary={data.summary}
          onClose={() => setDialog(null)}
          onSaved={(payout) =>
            done(`Payout of ${formatMoneyExact(payout.amount)} recorded as ${payoutStatusLabel(payout.status).toLowerCase()}.`)
          }
        />
      ) : null}
      {data && dialog?.kind === 'gateway' ? (
        <GatewayPayoutDialog
          orderId={orderId}
          summary={data.summary}
          onClose={() => setDialog(null)}
          onSent={(payout) =>
            done(`PaymentHub payout of ${formatMoneyExact(payout.amount)} is ${payoutStatusLabel(payout.status).toLowerCase()}.`)
          }
        />
      ) : null}
      {dialog?.kind === 'status' ? (
        <StatusDialog
          orderId={orderId}
          payout={dialog.payout}
          onClose={() => setDialog(null)}
          onSaved={(payout) => done(`Payout marked ${payoutStatusLabel(payout.status).toLowerCase()}.`)}
        />
      ) : null}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function Totals({ summary }: { summary: Summary }) {
  const fin = summary.financials
  const feeLabel = fin.platformFeePercent !== null ? `Platform fee (${Number(fin.platformFeePercent)}%)` : 'Platform fee'
  const cells: { label: string; value: string; strong?: boolean }[] = [
    { label: 'Order total', value: summary.orderTotal },
    { label: feeLabel, value: summary.platformFee },
    { label: 'Seller earns', value: summary.sellerEarning },
    { label: 'Paid out', value: summary.paidOut },
    ...(Number(summary.duesDeducted) > 0 ? [{ label: 'COD dues deducted', value: summary.duesDeducted }] : []),
    { label: 'In progress', value: summary.inProgress },
    { label: 'Left to pay', value: summary.remaining, strong: true },
  ]
  return (
    <div className="space-y-1.5">
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
      {cells.map((cell, i) => (
        <div key={cell.label} className={`bg-surface px-3 py-2.5 ${i === cells.length - 1 ? lastSpan(cells.length) : ''}`}>
          <dt className="text-xs text-muted">{cell.label}</dt>
          <dd className={`font-figure text-sm text-fg ${cell.strong ? 'font-semibold' : 'font-medium'}`}>
            {formatMoneyExact(cell.value)}
          </dd>
        </div>
      ))}
    </dl>
    {fin.paymentMethod === 'ONLINE' && Number(fin.gatewayFee) > 0 ? (
      <p className="text-xs text-muted">
        Gateway fee {formatMoneyExact(fin.gatewayFee)} ({Number(fin.gatewayFeePercent)}%) —{' '}
        {fin.gatewayFeeBearer === 'PLATFORM' ? 'paid by UnieMax, not taken from the seller.' : 'taken from the seller.'}
      </p>
    ) : null}
    </div>
  )
}

/** The last box stretches over the empty cells of its row (2 columns, 3 from sm). */
function lastSpan(count: number): string {
  const phone = count % 2 === 1 ? 'col-span-2' : ''
  const wide = count % 3 === 1 ? 'sm:col-span-3' : count % 3 === 2 ? 'sm:col-span-2' : 'sm:col-span-1'
  return `${phone} ${wide}`
}

function PayTo({ summary }: { summary: Summary }) {
  const { payee } = summary
  if (!payee) {
    return summary.blockers.length > 0 ? null : (
      <Alert tone="warning" title="The store has no primary bank account">
        Confirm the seller&apos;s account with them before sending money.
      </Alert>
    )
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-alt px-3 py-2.5">
      <div className="min-w-0 text-sm">
        <p className="text-xs text-muted">Pay to (store&apos;s primary account)</p>
        <p className="font-medium text-fg">{payee.accountHolderName}</p>
        <p className="text-muted">
          {payee.bankName} · ••••{payee.last4} · <span className="font-mono text-xs">{payee.ifsc}</span>
        </p>
      </div>
      <BankStatusChip status={payee.verificationStatus} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

const SOURCE_LABEL: Record<Payout['events'][number]['source'], string> = {
  ADMIN: 'Admin',
  HUB_RESPONSE: 'PaymentHub answer',
  HUB_WEBHOOK: 'PaymentHub webhook',
}

function PayoutItem({
  orderId,
  payout,
  onChangeStatus,
  onResent,
}: {
  orderId: string
  payout: Payout
  onChangeStatus: () => void
  onResent: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [resendError, setResendError] = useState<string | null>(null)
  const [messaging, setMessaging] = useState(false)

  async function resend() {
    setBusy(true)
    setResendError(null)
    try {
      const updated = await adminApi.resendGatewayPayout(orderId, payout.id)
      onResent(`Sent to PaymentHub again — now ${payoutStatusLabel(updated.status).toLowerCase()}.`)
    } catch (err) {
      setResendError(errorText(err, 'Could not reach PaymentHub'))
      setBusy(false)
    }
  }

  const when = payout.paidAt
    ? payout.paidAtTimeKnown
      ? formatDateTime(payout.paidAt)
      : formatDate(payout.paidAt)
    : null

  return (
    <li className="space-y-1.5 py-3 first:pt-1 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-figure text-base font-semibold text-fg">{formatMoneyExact(payout.amount)}</span>
          <PayoutStatusChip status={payout.status} />
          <PayoutMethodChip method={payout.method} />
        </div>
        <div className="flex gap-2">
          {payout.canResend ? (
            <Button disabled={busy} onClick={() => void resend()}>
              {busy ? 'Sending…' : 'Send again'}
            </Button>
          ) : null}
          {payout.status === 'SUCCEEDED' ? (
            <Button onClick={() => setMessaging(true)}>Send message</Button>
          ) : null}
          {payout.nextStatuses.length > 0 ? <Button onClick={onChangeStatus}>Change status</Button> : null}
        </div>
      </div>
      {messaging ? (
        <PayoutMessageDialog
          orderId={orderId}
          payout={payout}
          onClose={() => setMessaging(false)}
          onSent={(text) => {
            setMessaging(false)
            onResent(text)
          }}
        />
      ) : null}

      <dl className="grid gap-x-4 gap-y-0.5 text-sm sm:grid-cols-2">
        {payout.method === 'MANUAL' ? (
          <Fact label="Sent from">
            {payout.senderName}
            {payout.senderBank || payout.senderLast4
              ? ` (${[payout.senderBank, payout.senderLast4 ? `••••${payout.senderLast4}` : null].filter(Boolean).join(' ')})`
              : ''}
          </Fact>
        ) : (
          <Fact label="Gateway">{payout.gateway ?? 'Not reported yet'}</Fact>
        )}
        {payout.payeeName ? (
          <Fact label="Sent to">
            {payout.payeeName} ({payout.payeeBank} ••••{payout.payeeLast4})
          </Fact>
        ) : null}
        {Number(payout.duesDeducted) > 0 ? (
          <Fact label="COD dues deducted">{formatMoneyExact(payout.duesDeducted)}</Fact>
        ) : null}
        {when ? <Fact label="Paid on">{when}</Fact> : null}
        {payout.utr ? (
          <Fact label="UTR">
            <span className="font-mono text-xs">{payout.utr}</span>
          </Fact>
        ) : null}
        {payout.hubPayoutId ? (
          <Fact label="Hub payout">
            <span className="font-mono text-xs">{payout.hubPayoutId}</span>
          </Fact>
        ) : null}
        {payout.gatewayRef ? (
          <Fact label="Gateway ref">
            <span className="font-mono text-xs">{payout.gatewayRef}</span>
          </Fact>
        ) : null}
      </dl>

      {payout.failureReason ? (
        <p className="text-sm text-danger">
          <span className="font-medium">Reason:</span> {payout.failureReason}
        </p>
      ) : null}
      {payout.notes ? <p className="text-sm text-muted">Note: {payout.notes}</p> : null}
      {resendError ? <p className="text-sm text-danger">{resendError}</p> : null}
      <p className="text-xs text-muted">
        {payout.method === 'MANUAL' ? 'Recorded' : 'Triggered'} by {payout.createdByEmail ?? 'system'} ·{' '}
        {formatDateTime(payout.createdAt)}
      </p>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted hover:text-fg">
          Status history ({payout.events.length})
        </summary>
        <ol className="mt-2 space-y-2 border-l border-line pl-3">
          {payout.events.map((event) => (
            <li key={event.id}>
              <p className="text-fg">
                {event.fromStatus ? `${payoutStatusLabel(event.fromStatus)} → ` : ''}
                {payoutStatusLabel(event.toStatus)}
                <span className="text-muted"> · {SOURCE_LABEL[event.source]}</span>
              </p>
              <p className="text-xs text-muted">
                {formatDateTime(event.createdAt)}
                {event.actorEmail ? ` · ${event.actorEmail}` : ''}
                {event.hubEventId ? ` · ${event.hubEventId}` : ''}
              </p>
              {event.note ? <p className="text-xs text-muted">{event.note}</p> : null}
            </li>
          ))}
        </ol>
      </details>

      {payout.method === 'GATEWAY' ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted hover:text-fg">PaymentHub request and response</summary>
          <div className="mt-2 space-y-2">
            <Json label="Request" value={payout.hubRequest} />
            <Json label="Latest response" value={payout.hubResponse} />
          </div>
        </details>
      ) : null}
    </li>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-1.5">
      <dt className="shrink-0 text-muted">{label}:</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </div>
  )
}

function Json({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-surface-alt p-2 font-mono text-xs text-fg">
        {value === null || value === undefined ? 'None yet' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Record a manual payout
// ---------------------------------------------------------------------------

const MANUAL_STATUS_OPTIONS = [
  { value: 'SUCCEEDED', label: 'Sent' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'PENDING', label: 'Not sent yet' },
]
const MANUAL_STATUS_HINT: Record<ManualPayoutInput['status'], string> = {
  SUCCEEDED: 'The money has reached the seller.',
  PROCESSING: 'Sent, but the bank is still moving it.',
  PENDING: 'You will send it later — update the status then.',
}

function ManualPayoutDialog({
  orderId,
  summary,
  onClose,
  onSaved,
}: {
  orderId: string
  summary: Summary
  onClose: () => void
  onSaved: (payout: Payout) => void
}) {
  // One key per opening: a double click or a retry saves ONE payout.
  const [idempotencyKey] = useState(newKey)
  const hasDues = Number(summary.storeDues) > 0
  const [form, setForm] = useState({
    // The server's split: the seller's COD dues first, the rest sent.
    amount: summary.suggested.amount,
    duesDeducted: summary.suggested.duesDeducted,
    status: 'SUCCEEDED' as ManualPayoutInput['status'],
    senderName: '',
    senderBank: '',
    senderLast4: '',
    paidOn: todayInIndia(),
    paidTime: '',
    utr: '',
    notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }))

  const isAmount = (v: string) => /^\d{1,8}(\.\d{1,2})?$/.test(v.trim())
  const duesOk = form.duesDeducted.trim() === '' || isAmount(form.duesDeducted)
  // ₹0 sent is fine when the payout only settles dues; the server checks the totals.
  const amountOk = isAmount(form.amount) && (Number(form.amount) > 0 || Number(form.duesDeducted) > 0)
  const last4Ok = form.senderLast4 === '' || /^\d{4}$/.test(form.senderLast4)
  const canSave = amountOk && duesOk && last4Ok && form.senderName.trim().length >= 2 && form.paidOn !== ''

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!canSave || busy) return
    setBusy(true)
    setFormError(null)
    try {
      const payout = await adminApi.recordManualPayout(orderId, {
        amount: form.amount.trim(),
        duesDeducted: form.duesDeducted.trim() || '0',
        idempotencyKey,
        status: form.status,
        senderName: form.senderName.trim(),
        senderBank: form.senderBank,
        senderLast4: form.senderLast4,
        paidOn: form.paidOn,
        paidTime: form.paidTime,
        utr: form.utr,
        notes: form.notes,
      })
      onSaved(payout)
    } catch (err) {
      setFormError(errorText(err, 'Could not save the payout'))
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      title="Record manual payout"
      subtitle="For money you already sent (or are sending) from a bank account by hand."
      onClose={() => {
        if (!busy) onClose()
      }}
      footer={
        <>
          {formError ? <p className="mr-auto text-sm text-danger">{formError}</p> : null}
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="manual-payout" disabled={!canSave || busy}>
            {busy ? 'Saving…' : 'Save payout'}
          </Button>
        </>
      }
    >
      <form id="manual-payout" onSubmit={(e) => void submit(e)} className="space-y-4">
        {hasDues ? (
          <Alert tone="info" title={`The seller owes ${formatMoneyExact(summary.storeDues)} in COD platform fees`}>
            It is taken from this payout below. Clear the field to send the full amount instead.
          </Alert>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput
            label="Amount sent (₹)"
            inputMode="decimal"
            required
            value={form.amount}
            onChange={(e) => set('amount')(e.target.value)}
            hint={`Up to ${formatMoneyExact(summary.remaining)} is left to pay${hasDues ? ' (amount + dues)' : ''}.`}
            aria-invalid={!amountOk}
          />
          {hasDues ? (
            <TextInput
              label="COD dues deducted (₹)"
              inputMode="decimal"
              value={form.duesDeducted}
              onChange={(e) => set('duesDeducted')(e.target.value)}
              hint={`Kept by UnieMax to settle what the seller owes (up to ${formatMoneyExact(summary.storeDues)}).`}
              aria-invalid={!duesOk}
            />
          ) : null}
          <div>
            <SelectInput
              label="Status"
              value={form.status}
              onChange={(e) => set('status')(e.target.value)}
              options={MANUAL_STATUS_OPTIONS}
            />
            <p className="mt-1 text-xs text-muted">{MANUAL_STATUS_HINT[form.status]}</p>
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-fg">Sent from</legend>
          <TextInput
            label="Sender name"
            required
            value={form.senderName}
            onChange={(e) => set('senderName')(e.target.value)}
            hint="Whose savings account the money left from — yours or someone else's."
            autoComplete="off"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              label="Sender bank (optional)"
              value={form.senderBank}
              onChange={(e) => set('senderBank')(e.target.value)}
              placeholder="e.g. HDFC Bank"
              autoComplete="off"
            />
            <TextInput
              label="Account last 4 digits (optional)"
              inputMode="numeric"
              maxLength={4}
              value={form.senderLast4}
              onChange={(e) => set('senderLast4')(e.target.value.replace(/\D/g, ''))}
              hint={last4Ok ? 'Only the last 4 digits are kept.' : 'Enter exactly 4 digits.'}
              aria-invalid={!last4Ok}
              autoComplete="off"
            />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-fg">When and reference</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              label="Payment date"
              type="date"
              required
              max={todayInIndia()}
              value={form.paidOn}
              onChange={(e) => set('paidOn')(e.target.value)}
            />
            <TextInput
              label="Approx. time (optional)"
              type="time"
              value={form.paidTime}
              onChange={(e) => set('paidTime')(e.target.value)}
              hint="India time."
            />
          </div>
          <TextInput
            label="UTR / transaction reference (optional)"
            value={form.utr}
            onChange={(e) => set('utr')(e.target.value)}
            placeholder="From your bank app's transfer receipt"
            autoComplete="off"
          />
          <TextArea
            label="Notes (optional)"
            rows={2}
            value={form.notes}
            onChange={(e) => set('notes')(e.target.value)}
          />
        </fieldset>
      </form>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Pay via PaymentHub
// ---------------------------------------------------------------------------

function GatewayPayoutDialog({
  orderId,
  summary,
  onClose,
  onSent,
}: {
  orderId: string
  summary: Summary
  onClose: () => void
  onSent: (payout: Payout) => void
}) {
  const [idempotencyKey] = useState(newKey)
  const [amount, setAmount] = useState(summary.remaining)
  const [busy, setBusy] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const amountOk = /^\d{1,8}(\.\d{1,2})?$/.test(amount.trim()) && Number(amount) > 0

  async function send() {
    setBusy(true)
    setSendError(null)
    try {
      onSent(await adminApi.triggerGatewayPayout(orderId, { amount: amount.trim(), idempotencyKey }))
    } catch (err) {
      setSendError(errorText(err, 'Could not start the payout'))
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      title="Pay via PaymentHub"
      subtitle="PaymentHub sends the money to the seller's account through the payment gateway."
      onClose={() => {
        if (!busy) onClose()
      }}
      footer={
        <>
          {sendError ? <p className="mr-auto text-sm text-danger">{sendError}</p> : null}
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!amountOk || busy} onClick={() => void send()}>
            {busy ? 'Sending…' : `Send ${amountOk ? formatMoneyExact(amount) : ''}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <PayTo summary={summary} />
        <TextInput
          label="Amount (₹)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hint={`Up to ${formatMoneyExact(summary.remaining)} is left to pay.`}
          aria-invalid={!amountOk}
        />
        <p className="text-sm text-muted">
          Real money moves once you press Send. The status updates when PaymentHub reports back.
        </p>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Change a manual payout's status
// ---------------------------------------------------------------------------

const STATUS_HELP: Partial<Record<PayoutStatus, string>> = {
  PROCESSING: 'The bank is still moving the money.',
  SUCCEEDED: 'The seller has received the money.',
  FAILED: 'The money never reached the seller.',
  REVERSED: 'The money reached the seller and came back.',
  CANCELLED: 'Recorded by mistake — no money moved.',
}
const NEEDS_REASON: PayoutStatus[] = ['FAILED', 'REVERSED', 'CANCELLED']

function StatusDialog({
  orderId,
  payout,
  onClose,
  onSaved,
}: {
  orderId: string
  payout: Payout
  onClose: () => void
  onSaved: (payout: Payout) => void
}) {
  const [status, setStatus] = useState<PayoutStatus>(payout.nextStatuses[0]!)
  const [reason, setReason] = useState('')
  const [utr, setUtr] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const needsReason = NEEDS_REASON.includes(status)
  const canSave = !needsReason || reason.trim().length > 0

  async function save() {
    setBusy(true)
    setSaveError(null)
    try {
      onSaved(
        await adminApi.updatePayoutStatus(orderId, payout.id, {
          status,
          reason: reason.trim() || null,
          utr: utr.trim() || null,
        }),
      )
    } catch (err) {
      setSaveError(errorText(err, 'Could not change the status'))
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      title="Change payout status"
      subtitle={
        <>
          {formatMoneyExact(payout.amount)} · now <span className="font-medium text-fg">{payoutStatusLabel(payout.status)}</span>
        </>
      }
      onClose={() => {
        if (!busy) onClose()
      }}
      footer={
        <>
          {saveError ? <p className="mr-auto text-sm text-danger">{saveError}</p> : null}
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={status === 'CANCELLED' || status === 'FAILED' || status === 'REVERSED' ? 'danger' : 'primary'}
            disabled={!canSave || busy}
            onClick={() => void save()}
          >
            {busy ? 'Saving…' : `Mark ${payoutStatusLabel(status).toLowerCase()}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectInput
          label="New status"
          value={status}
          onChange={(e) => setStatus(e.target.value as PayoutStatus)}
          options={payout.nextStatuses.map((value) => ({ value, label: payoutStatusLabel(value) }))}
        />
        {STATUS_HELP[status] ? <p className="-mt-2 text-sm text-muted">{STATUS_HELP[status]}</p> : null}
        {status === 'SUCCEEDED' && !payout.utr ? (
          <TextInput
            label="UTR / transaction reference (optional)"
            value={utr}
            onChange={(e) => setUtr(e.target.value)}
            autoComplete="off"
          />
        ) : null}
        {needsReason ? (
          <TextArea
            label="Reason"
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            hint="Kept on the record for reconciliation."
          />
        ) : null}
      </div>
    </Dialog>
  )
}


// ---------------------------------------------------------------------------
// Send the "payout sent" message to the seller, by hand
// ---------------------------------------------------------------------------

const CHANNEL_NAME: Record<OrderMessageChannel, string> = { email: 'Email', whatsapp: 'WhatsApp' }
const CHANNEL_ORDER: OrderMessageChannel[] = ['email', 'whatsapp']

type Loaded = { preview: PayoutMessagePreview | null; error: string | null }
type Outcome = { ok: boolean; text: string }

/**
 * The seller's "your payout was sent" message — the automatic send's own
 * text and recipient, built by the server. Both channels load together; the
 * admin ticks Email and/or WhatsApp, checks the preview, and sends once.
 * A channel with no recipient can't be ticked. After a send, each channel
 * says whether it went; a failed one stays ticked to try again.
 */
function PayoutMessageDialog({
  orderId,
  payout,
  onClose,
  onSent,
}: {
  orderId: string
  payout: Payout
  onClose: () => void
  onSent: (text: string) => void
}) {
  const [loaded, setLoaded] = useState<Partial<Record<OrderMessageChannel, Loaded>>>({})
  const [ticked, setTicked] = useState<Record<OrderMessageChannel, boolean>>({ email: true, whatsapp: true })
  const [viewing, setViewing] = useState<OrderMessageChannel>('email')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Partial<Record<OrderMessageChannel, Outcome>>>({})

  useEffect(() => {
    let live = true
    for (const channel of CHANNEL_ORDER) {
      adminApi
        .previewPayoutMessage(orderId, payout.id, channel)
        .then((preview) => {
          if (live) setLoaded((s) => ({ ...s, [channel]: { preview, error: null } }))
        })
        .catch((err: unknown) => {
          if (live) setLoaded((s) => ({ ...s, [channel]: { preview: null, error: errorText(err, 'Could not load') } }))
        })
    }
    return () => {
      live = false
    }
  }, [orderId, payout.id])

  const recipient = (channel: OrderMessageChannel): string | null => {
    const preview = loaded[channel]?.preview
    const to = channel === 'email' ? preview?.email?.to : preview?.whatsapp?.to
    return to ? (channel === 'whatsapp' ? `+${to}` : to) : null
  }
  const usable = (channel: OrderMessageChannel) => recipient(channel) !== null
  const chosen = CHANNEL_ORDER.filter((c) => ticked[c] && usable(c) && !outcome[c]?.ok)
  const allLoaded = CHANNEL_ORDER.every((c) => loaded[c])

  async function send() {
    setBusy(true)
    const results: Partial<Record<OrderMessageChannel, Outcome>> = { ...outcome }
    for (const channel of chosen) {
      try {
        const sent = await adminApi.sendPayoutMessage(orderId, payout.id, channel)
        results[channel] = { ok: true, text: `Sent to ${channel === 'whatsapp' ? `+${sent.to}` : sent.to}` }
      } catch (err) {
        results[channel] = { ok: false, text: errorText(err, 'Could not send') }
      }
    }
    setOutcome(results)
    setBusy(false)
    const done = CHANNEL_ORDER.filter((c) => results[c]?.ok)
    // Everything ticked went → close with a summary; otherwise stay open on the failure.
    if (chosen.every((c) => results[c]?.ok)) {
      onSent(`Payout message sent to the seller by ${done.map((c) => CHANNEL_NAME[c]).join(' and ')}.`)
    }
  }

  const view = loaded[viewing]

  return (
    <Dialog
      open
      size="lg"
      title="Send payout message"
      subtitle={`To the seller · ${formatMoneyExact(payout.amount)} paid out`}
      onClose={() => {
        if (!busy) onClose()
      }}
      footer={
        <>
          <Button disabled={busy} onClick={onClose}>
            {Object.values(outcome).some((o) => o?.ok) ? 'Close' : 'Cancel'}
          </Button>
          <Button variant="primary" disabled={busy || !allLoaded || chosen.length === 0} onClick={() => void send()}>
            {busy
              ? 'Sending…'
              : chosen.length === 0
                ? 'Send'
                : `Send by ${chosen.map((c) => CHANNEL_NAME[c]).join(' + ')}`}
          </Button>
        </>
      }
    >
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold text-fg">Send by</legend>
        {CHANNEL_ORDER.map((channel) => {
          const state = loaded[channel]
          const to = recipient(channel)
          const result = outcome[channel]
          return (
            <label
              key={channel}
              className={`flex items-start gap-3 rounded-md border border-line px-3 py-2.5 ${
                to && !result?.ok ? 'cursor-pointer' : 'opacity-70'
              }`}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
                checked={ticked[channel] && Boolean(to) && !result?.ok}
                disabled={busy || !to || result?.ok}
                onChange={(e) => setTicked((t) => ({ ...t, [channel]: e.target.checked }))}
              />
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-medium text-fg">{CHANNEL_NAME[channel]}</span>
                <span className="block text-muted">
                  {!state
                    ? 'Loading…'
                    : state.error
                      ? state.error
                      : to
                        ? `To ${to}`
                        : channel === 'email'
                          ? 'The seller has no email address'
                          : 'No usable phone number, or WhatsApp is off'}
                </span>
                {channel === 'whatsapp' && state?.preview?.whatsapp && !state.preview.whatsapp.approved ? (
                  <span className="block text-warning">Template not approved in Meta yet — this will fail until it is.</span>
                ) : null}
                {result ? (
                  <span className={`block font-medium ${result.ok ? 'text-success' : 'text-danger'}`}>
                    {result.ok ? '✓ ' : ''}
                    {result.text}
                  </span>
                ) : null}
              </span>
            </label>
          )
        })}
      </fieldset>

      <div className="-mx-4 mt-4 mb-4 sm:-mx-5">
        <Tabs
          value={viewing}
          onChange={(c) => setViewing(c)}
          options={CHANNEL_ORDER.map((c) => ({ value: c, label: `Preview ${CHANNEL_NAME[c]}` }))}
        />
      </div>
      {!view ? (
        <Skeleton rows={6} />
      ) : view.error ? (
        <p className="text-sm text-danger">{view.error}</p>
      ) : view.preview?.email ? (
        <EmailPreview email={view.preview.email} />
      ) : view.preview?.whatsapp ? (
        <WhatsAppPreview whatsapp={view.preview.whatsapp} />
      ) : null}
    </Dialog>
  )
}
