import { useState } from 'react'
import { toApiError } from '../../../../shared/auth/http'
import { Button } from '../../../../shared/ui/Button'
import { ErrorNote, Select, TextField } from '../../../../shared/ui/form'
import { ErrorState, PageSkeleton } from '../../../../shared/ui/states'
import { BankPrompt } from '../BankPrompt'
import { useManagedStore } from '../../../../storefront/features/stores/useManagedStore'
import { SlidersIcon } from '../../../../storefront/layout/icons'
import { PageHeader, showToast } from '../../../../storefront/pages/stores/ui'
import { supplierApi } from '../../api'
import type { SupplierProfile } from '../../api'
import { ChoiceCard, Question, dayText, useLoad } from '../../ui'

const SHIP_WITHIN_MAX = 7

/**
 * Supplier settings: the terms this supplier gives every seller — shipping
 * fee, ship within, returns. Each change is logged and every seller is told
 * it applies to orders placed from now on (D-18).
 */
export function SupplierSettingsPage() {
  const { store } = useManagedStore()
  const profile = useLoad(() => supplierApi.profile(store.id), [store.id])

  return (
    <div className="space-y-6">
      <PageHeader
        icon={SlidersIcon}
        title="Supplier settings"
        description="The terms you give every seller. Changes apply to orders placed from now on, and your sellers are told."
      />
      <BankPrompt audience="supplier" />
      {profile.loading && !profile.data && <PageSkeleton label="Loading your settings" />}
      {profile.error && <ErrorState message={profile.error} onRetry={profile.reload} />}
      {profile.data && (
        <SettingsForm
          key={`${profile.data.shippingFee}-${profile.data.shipWithinDays}-${profile.data.returnDays}`}
          storeId={store.id}
          profile={profile.data}
          onSaved={(p) => profile.setData(p)}
        />
      )}
    </div>
  )
}

function SettingsForm({
  storeId,
  profile,
  onSaved,
}: {
  storeId: string
  profile: SupplierProfile
  onSaved: (p: SupplierProfile) => void
}) {
  const [fee, setFee] = useState(String(profile.shippingFee))
  const [shipWithin, setShipWithin] = useState(String(profile.shipWithinDays))
  const [returns, setReturns] = useState(profile.returnDays > 0)
  const [returnDays, setReturnDays] = useState(profile.returnDays > 0 ? String(profile.returnDays) : '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const next = {
    shippingFee: Number(fee),
    shipWithinDays: Number(shipWithin),
    returnDays: returns ? Number(returnDays) : 0,
  }
  const dirty =
    next.shippingFee !== profile.shippingFee ||
    next.shipWithinDays !== profile.shipWithinDays ||
    next.returnDays !== profile.returnDays

  const save = async () => {
    const e: Record<string, string> = {}
    if (!/^\d+(\.\d{1,2})?$/.test(fee.trim())) e.fee = 'Enter your fee in rupees — 0 if you charge none'
    if (returns && !(next.returnDays >= 1 && next.returnDays <= 30)) e.returnDays = 'Enter 1 to 30 days'
    setErrors(e)
    if (Object.keys(e).length > 0) return
    setBusy(true)
    setError(null)
    try {
      onSaved(await supplierApi.updateProfile(storeId, next))
      showToast('Saved — your sellers have been told')
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-lg space-y-5">
      <TextField
        label="Shipping fee per order (₹)"
        inputMode="decimal"
        value={fee}
        onChange={(e) => setFee(e.target.value.replace(/[^\d.]/g, ''))}
        hint="What you charge the seller for shipping one order. 0 if none."
        error={errors.fee}
      />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-fg">Ship within</span>
        <Select className="h-field" value={shipWithin} onChange={(e) => setShipWithin(e.target.value)}>
          {Array.from({ length: SHIP_WITHIN_MAX }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {dayText(n)} of the order
            </option>
          ))}
        </Select>
      </label>
      <Question legend="Do you accept returns?">
        <ChoiceCard name="settings-returns" checked={!returns} onSelect={() => setReturns(false)} title="No" />
        <ChoiceCard name="settings-returns" checked={returns} onSelect={() => setReturns(true)} title="Yes" />
      </Question>
      {returns && (
        <TextField
          label="Returns accepted within (days)"
          inputMode="numeric"
          value={returnDays}
          onChange={(e) => setReturnDays(e.target.value.replace(/\D/g, '').slice(0, 2))}
          error={errors.returnDays}
        />
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button disabled={!dirty} loading={busy} onClick={save}>
        Save and tell my sellers
      </Button>
    </div>
  )
}
