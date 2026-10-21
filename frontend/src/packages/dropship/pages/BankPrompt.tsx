import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { Button } from '../../../shared/ui/Button'
import { Dialog } from '../../../shared/ui/Dialog'
import { ErrorNote } from '../../../shared/ui/form'
import { storeBankApi } from '../../../storefront/features/stores/storesApi'
import type { BankAccountDetails } from '../../../storefront/features/stores/storesApi'
import { useManagedStore } from '../../../storefront/features/stores/useManagedStore'
import { AccountForm } from '../../../storefront/pages/stores/StoreBankPage'
import { showToast } from '../../../storefront/pages/stores/ui'
import { refreshDropshipRole, useDropshipRole } from '../role'

/**
 * Asks, in place, for the bank account a store needs to be paid out to through
 * UnieMax (Easy Split, PS-1): the supplier for prepaid orders, the seller for
 * its share. Shown only while payouts are on and this store has no payout
 * account; it disappears the moment one is added. The form is the store's own
 * bank form, so nothing is retyped elsewhere.
 */
export function BankPrompt({ audience }: { audience: 'supplier' | 'seller' }) {
  const { store } = useManagedStore()
  const role = useDropshipRole(store.slug)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!role || role.split === 'off' || !role.payout || role.payout.active) return null

  const add = async (input: BankAccountDetails) => {
    setBusy(true)
    setError(null)
    try {
      await storeBankApi.create(store.id, input)
      refreshDropshipRole(store.slug)
      setOpen(false)
      showToast(role.split === 'sandbox' ? 'Bank account added (sandbox: no money moves)' : 'Bank account added')
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className="rounded-lg border border-line bg-surface p-4">
        <p className="text-sm font-semibold text-fg">
          {audience === 'supplier'
            ? 'Add your bank account to be paid by UnieMax for prepaid orders.'
            : 'Add your bank account so UnieMax can pay you out on prepaid supplier orders.'}
        </p>
        <p className="mt-1 text-sm text-muted">
          Without one, those orders are paid directly between you and {audience === 'supplier' ? 'the seller' : 'your supplier'}.
          {role.split === 'sandbox' ? ' Payouts are in sandbox for now: no money moves.' : ''}
        </p>
        <Button className="mt-3" size="sm" onClick={() => setOpen(true)}>
          Add bank account
        </Button>
      </section>

      <Dialog open={open} title="Add your bank account" subtitle="This is where your payouts go." onClose={() => !busy && setOpen(false)}>
        <div className="space-y-3">
          {error && (
            <ErrorNote>
              {error}{' '}
              <Link to="../business" className="font-semibold underline">
                Open business details
              </Link>
            </ErrorNote>
          )}
          <AccountForm busy={busy} onSubmit={(input) => void add(input)} onCancel={() => setOpen(false)} />
        </div>
      </Dialog>
    </>
  )
}
