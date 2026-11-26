import { useState } from 'react'
import { adminApi } from '../../features/adminApi'
import { Dialog } from '../../../shared/ui/Dialog'
import { Button } from '../../ui/primitives'

/**
 * Turn a store's "allow advance payouts" switch on or off (pay a seller
 * before delivery — docs/seller-finance §9). The risk is said before the
 * admin confirms. Used by the order's Seller payout card and the store's
 * finance page.
 */
export function AdvanceSwitchDialog({
  storeId,
  allow,
  onClose,
  onSaved,
}: {
  storeId: string
  /** true = turn on, false = turn off. */
  allow: boolean
  onClose: () => void
  onSaved: (allowed: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setSaveError(null)
    try {
      const result = await adminApi.setAdvancePayouts(storeId, allow)
      onSaved(result.advancePayoutsAllowed)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not change the setting')
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      title={allow ? 'Allow advance payouts?' : 'Stop advance payouts?'}
      subtitle="For this store — every order of this seller, not just one."
      onClose={() => {
        if (!busy) onClose()
      }}
      footer={
        <>
          {saveError ? <p className="mr-auto text-sm text-danger">{saveError}</p> : null}
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : allow ? 'Allow advances' : 'Stop advances'}
          </Button>
        </>
      }
    >
      {allow ? (
        <div className="space-y-2 text-sm text-fg">
          <p>You will be able to pay this seller for online orders before they are delivered — the full amount or a part.</p>
          <p>
            It is UnieMax&apos;s risk: if an order is cancelled or refunded, the seller owes the advance back and it is taken
            from their next payouts. If they never sell again, you have to collect it yourself.
          </p>
        </div>
      ) : (
        <p className="text-sm text-fg">No new advances for this store. Advances already paid stay, and clear on delivery as usual.</p>
      )}
    </Dialog>
  )
}
