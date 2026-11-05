import { useState } from 'react'
import { adminApi } from '../../features/adminApi'
import type { FeeBearer, FeeKind, FeeRule, FeeRules, RateNow } from '../../features/adminApi'
import { useAdminQuery } from '../../features/useAdminQuery'
import { Dialog } from '../../../shared/ui/Dialog'
import { Alert } from '../../../shared/ui/Alert'
import {
  Button,
  Card,
  CardHeader,
  Chip,
  ErrorState,
  PageHeader,
  SelectInput,
  Skeleton,
  TextInput,
} from '../../ui/primitives'
import { formatDate, formatDateTime } from '../../ui/format'

/**
 * Fee settings — the platform fee UnieMax takes on a seller's product price
 * and the payment gateway's fee on online payments.
 *
 * A change never edits a fee: it adds a new version with a start time, so
 * every order keeps the fee in force when it was placed (and old orders keep
 * theirs). Customers never see either fee. Today one rate applies to every
 * store; per-store and per-category rates plug into the same rules later.
 */

const KIND_COPY: Record<FeeKind, { title: string; base: string }> = {
  PLATFORM: {
    title: 'Platform fee',
    base: 'of the product price (never shipping). Sellers see it when they add a product; customers never do.',
  },
  GATEWAY: {
    title: 'Payment gateway fee',
    base: 'of what the customer pays online. Cash on delivery has none.',
  },
}

const BEARER_LABEL: Record<FeeBearer, string> = {
  SELLER: 'Taken from the seller',
  PLATFORM: 'Paid by UnieMax',
}

const pct = (value: string) => `${Number(value)}%`

export default function FeeSettingsPage() {
  const { data, loading, error, refresh } = useAdminQuery(() => adminApi.listFeeRules(), [])
  const [editing, setEditing] = useState<FeeKind | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  return (
    <>
      <PageHeader
        title="Fee settings"
        subtitle="What UnieMax takes on sellers' sales. A change applies to orders placed from its start time."
      />
      {error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : !data || loading ? (
        <Skeleton rows={8} />
      ) : (
        <div className="space-y-4">
          {saved ? <Alert tone="success">{saved}</Alert> : null}
          <div className="grid gap-4 md:grid-cols-2">
            <RateCard kind="PLATFORM" rate={data.current.platform} data={data} onChange={() => setEditing('PLATFORM')} primary />
            <RateCard kind="GATEWAY" rate={data.current.gateway} data={data} onChange={() => setEditing('GATEWAY')} />
          </div>
          <History rules={data.rules} />
        </div>
      )}

      {editing && data ? (
        <ChangeDialog
          kind={editing}
          current={editing === 'PLATFORM' ? data.current.platform : data.current.gateway}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null)
            setSaved(message)
            refresh()
          }}
        />
      ) : null}
    </>
  )
}

function RateCard({
  kind,
  rate,
  data,
  onChange,
  primary = false,
}: {
  kind: FeeKind
  rate: RateNow
  data: FeeRules
  onChange: () => void
  primary?: boolean
}) {
  const next = data.current.upcoming.find((rule) => rule.kind === kind)
  return (
    <Card>
      <CardHeader
        title={KIND_COPY[kind].title}
        action={
          <Button variant={primary ? 'primary' : 'secondary'} onClick={onChange}>
            Change
          </Button>
        }
      />
      <p className="font-figure text-4xl font-bold text-fg">{pct(rate.percent)}</p>
      <p className="mt-1 text-sm text-muted">{KIND_COPY[kind].base}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <Chip tone={rate.bearer === 'PLATFORM' ? 'info' : 'neutral'}>{BEARER_LABEL[rate.bearer]}</Chip>
        <span className="text-muted">
          {rate.effectiveFrom && new Date(rate.effectiveFrom).getFullYear() > 2020
            ? `Since ${formatDateTime(rate.effectiveFrom)}`
            : 'Starting rate'}
        </span>
      </div>
      {next ? (
        <p className="mt-3 rounded-md bg-surface-alt px-3 py-2 text-sm text-fg">
          Changes to <span className="font-semibold">{pct(next.percent)}</span> on {formatDateTime(next.effectiveFrom)}
        </p>
      ) : null}
    </Card>
  )
}

function History({ rules }: { rules: FeeRule[] }) {
  return (
    <Card>
      <CardHeader title="History" subtitle="Every version ever used. Orders keep the version in force when they were placed." />
      <ul className="divide-y divide-line">
        {rules.map((rule) => (
          <li key={rule.id} className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-sm font-medium text-fg">
                {KIND_COPY[rule.kind].title} · <span className="font-figure">{pct(rule.percent)}</span>
                <span className="font-normal text-muted"> · {BEARER_LABEL[rule.bearer]}</span>
              </p>
              <p className="text-xs text-muted">
                From {new Date(rule.effectiveFrom).getFullYear() > 2020 ? formatDateTime(rule.effectiveFrom) : 'the start'}
                {rule.createdByEmail ? ` · set by ${rule.createdByEmail} on ${formatDate(rule.createdAt)}` : ''}
              </p>
              {rule.note ? <p className="text-xs text-muted">Note: {rule.note}</p> : null}
            </div>
            {new Date(rule.effectiveFrom) > new Date() ? <Chip tone="warning">Scheduled</Chip> : null}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function ChangeDialog({
  kind,
  current,
  onClose,
  onSaved,
}: {
  kind: FeeKind
  current: RateNow
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [percent, setPercent] = useState(String(Number(current.percent)))
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [startsAt, setStartsAt] = useState('')
  const [bearer, setBearer] = useState<FeeBearer>(current.bearer)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const percentOk = /^\d{1,3}(\.\d{1,2})?$/.test(percent.trim()) && Number(percent) <= 100
  const whenOk = when === 'now' || (startsAt !== '' && new Date(startsAt) > new Date())
  const canSave = percentOk && whenOk

  async function save() {
    setBusy(true)
    setSaveError(null)
    try {
      await adminApi.createFeeRule({
        kind,
        percent: percent.trim(),
        effectiveFrom: when === 'now' ? null : new Date(startsAt).toISOString(),
        ...(kind === 'GATEWAY' ? { bearer } : {}),
        note: note.trim() || null,
      })
      onSaved(
        `${KIND_COPY[kind].title} set to ${pct(percent.trim())} ${when === 'now' ? 'from now' : `from ${formatDateTime(new Date(startsAt))}`}.`,
      )
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the fee')
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      title={`Change ${KIND_COPY[kind].title.toLowerCase()}`}
      subtitle={`Now ${pct(current.percent)}. Orders already placed keep their fee.`}
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
            {busy ? 'Saving…' : 'Save new fee'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextInput
          label="New fee (%)"
          inputMode="decimal"
          value={percent}
          onChange={(e) => setPercent(e.target.value.replace(/[^\d.]/g, ''))}
          hint={percentOk ? `${pct(percent || '0')} ${KIND_COPY[kind].base}` : 'Enter 0 to 100, at most 2 decimals (e.g. 2.5).'}
          aria-invalid={!percentOk}
        />
        <SelectInput
          label="Starts"
          value={when}
          onChange={(e) => setWhen(e.target.value as 'now' | 'later')}
          options={[
            { value: 'now', label: 'Now — orders placed from now on' },
            { value: 'later', label: 'On a date I choose' },
          ]}
        />
        {when === 'later' ? (
          <TextInput
            label="Start date and time"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            hint={whenOk ? 'India time.' : 'Pick a time in the future.'}
            aria-invalid={!whenOk}
          />
        ) : null}
        {kind === 'GATEWAY' ? (
          <SelectInput
            label="Who pays it"
            value={bearer}
            onChange={(e) => setBearer(e.target.value as FeeBearer)}
            options={[
              { value: 'PLATFORM', label: 'UnieMax pays it (not taken from the seller)' },
              { value: 'SELLER', label: 'Taken from the seller' },
            ]}
          />
        ) : null}
        <TextInput
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why it changed"
        />
      </div>
    </Dialog>
  )
}
