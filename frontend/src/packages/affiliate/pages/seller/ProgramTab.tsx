import { useEffect, useState } from 'react'
import { toApiError } from '../../../../shared/auth/http'
import { Button } from '../../../../shared/ui/Button'
import { ErrorNote, SuccessNote } from '../../../../shared/ui/form'
import { sellerAffiliateApi } from '../../api'
import type { CommissionType } from '../../api'
import { Field, StatTile, inputClass, money, useLoad } from '../../ui'
import { useSellerAffiliate } from './AffiliateLayout'

export function ProgramTab() {
  const { storeId } = useSellerAffiliate()
  const program = useLoad(() => sellerAffiliateApi.program(storeId), [storeId])
  const summary = useLoad(() => sellerAffiliateApi.summary(storeId), [storeId])

  const [form, setForm] = useState({
    commissionType: 'PERCENTAGE' as CommissionType,
    commissionRate: '10',
    attributionDays: '30',
    holdDays: '7',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!program.data) return
    setForm({
      commissionType: program.data.commissionType,
      commissionRate: String(program.data.commissionRate),
      attributionDays: String(program.data.attributionDays),
      holdDays: String(program.data.holdDays),
    })
  }, [program.data])

  const save = async (patch: Parameters<typeof sellerAffiliateApi.updateProgram>[1]) => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      program.setData(await sellerAffiliateApi.updateProgram(storeId, patch))
      setSaved(true)
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void save({
      commissionType: form.commissionType,
      commissionRate: Number(form.commissionRate),
      attributionDays: Number(form.attributionDays),
      holdDays: Number(form.holdDays),
    })
  }

  if (program.loading) return <p className="text-sm text-muted">Loading…</p>
  if (program.error) return <ErrorNote>{program.error}</ErrorNote>
  if (!program.data) return null
  const enabled = program.data.enabled

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-line p-4">
        <div>
          <p className="text-sm font-semibold text-fg">
            Programme is {enabled ? 'on' : 'off'}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {enabled
              ? 'Partners can create links and earn on orders.'
              : 'Turning it on lets you invite partners. Existing commissions are never removed by turning it off.'}
          </p>
        </div>
        <Button
          size="sm"
          variant={enabled ? 'ring' : 'rise'}
          loading={busy}
          onClick={() => save({ enabled: !enabled })}
        >
          {enabled ? 'Turn off' : 'Turn on'}
        </Button>
      </div>

      {summary.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Partners" value={summary.data.partners} />
          <StatTile label="Clicks" value={summary.data.clicks} />
          <StatTile label="Orders" value={summary.data.orders} hint={`${money(summary.data.sales)} in sales`} />
          <StatTile
            label="Commission owed"
            value={money(summary.data.pending + summary.data.approved)}
            hint={`${money(summary.data.paid)} paid so far`}
          />
        </div>
      )}

      <form onSubmit={submit} className="space-y-4 rounded-lg border border-line p-4">
        <h3 className="text-sm font-semibold text-fg">Default commission</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <select
              value={form.commissionType}
              onChange={(e) => setForm({ ...form, commissionType: e.target.value as CommissionType })}
              className={inputClass}
            >
              <option value="PERCENTAGE">Percentage of the sale</option>
              <option value="FIXED">Fixed amount per item</option>
            </select>
          </Field>
          <Field label={form.commissionType === 'PERCENTAGE' ? 'Rate (%)' : 'Amount (₹)'}>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={form.commissionRate}
              onChange={(e) => setForm({ ...form, commissionRate: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Attribution window (days)">
            <input
              type="number"
              min="1"
              max="180"
              required
              value={form.attributionDays}
              onChange={(e) => setForm({ ...form, attributionDays: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Hold after delivery (days)">
            <input
              type="number"
              min="0"
              max="90"
              required
              value={form.holdDays}
              onChange={(e) => setForm({ ...form, holdDays: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>
        <p className="text-xs text-muted">
          A click keeps earning for the attribution window. A commission is approved once the
          order is delivered and the hold period — your return window — has passed.
        </p>
        {error && <ErrorNote>{error}</ErrorNote>}
        {saved && <SuccessNote>Saved.</SuccessNote>}
        <Button type="submit" size="sm" loading={busy}>
          Save settings
        </Button>
      </form>
    </div>
  )
}
