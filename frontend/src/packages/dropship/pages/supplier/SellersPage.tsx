import { useState } from 'react'
import { toApiError } from '../../../../shared/auth/http'
import { MediaImg } from '../../../../shared/media/MediaImg'
import { Button } from '../../../../shared/ui/Button'
import { ConfirmDialog } from '../../../../shared/ui/ConfirmDialog'
import { Dialog } from '../../../../shared/ui/Dialog'
import { ErrorNote, InfoNote } from '../../../../shared/ui/form'
import { EmptyState, ErrorState, PageSkeleton } from '../../../../shared/ui/states'
import { useManagedStore } from '../../../../storefront/features/stores/useManagedStore'
import { BagIcon, StoreIcon } from '../../../../storefront/layout/icons'
import { PageHeader, showToast } from '../../../../storefront/pages/stores/ui'
import { supplierApi } from '../../api'
import type { LinkStatus, SupplierSeller } from '../../api'
import {
  LinkStatusBadge,
  TermLine,
  TermsLog,
  codText,
  dayText,
  feePayerText,
  money,
  returnsText,
  shortDate,
  statusByText,
  useLoad,
} from '../../ui'

/**
 * The supplier's Sellers page: every seller it supplies, each with the terms
 * that seller set and the change log, and Pause / End from this side too (D-19).
 */
export function SellersPage() {
  const { store } = useManagedStore()
  const sellers = useLoad(() => supplierApi.sellers(store.id), [store.id])
  const [openId, setOpenId] = useState<string | null>(null)
  const open = sellers.data?.find((s) => s.linkId === openId) ?? null

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BagIcon}
        title="Sellers"
        description="The shops that sell your products. Each sets its own terms with you."
      />
      {sellers.loading && !sellers.data && <PageSkeleton label="Loading your sellers" />}
      {sellers.error && <ErrorState message={sellers.error} onRetry={sellers.reload} />}
      {sellers.data && sellers.data.length === 0 && (
        <EmptyState
          icon={BagIcon}
          title="No sellers yet"
          description="A seller invites you with a link. Once you join, they appear here."
        />
      )}
      {sellers.data && sellers.data.length > 0 && (
        <ul className="space-y-3">
          {sellers.data.map((s) => {
            const name = s.store?.name ?? 'Seller'
            const by = statusByText(s.statusBy, 'SUPPLIER', name)
            return (
              <li key={s.linkId} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-alt text-muted">
                    {s.store?.logoUrl ? (
                      <MediaImg src={s.store.logoUrl} sizes="44px" alt="" className="h-full w-full object-cover" />
                    ) : (
                      <StoreIcon className="h-5 w-5" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-fg">{name}</span>
                      <LinkStatusBadge status={s.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {s.status !== 'ACTIVE' && by ? `${s.status === 'PAUSED' ? 'Paused' : 'Ended'} ${by} · ` : ''}
                      {codText(s.codAllowed)} · Since {shortDate(s.since)}
                    </p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setOpenId(s.linkId)}>
                  Terms
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {open && (
        <SellerSheet
          storeId={store.id}
          seller={open}
          onClose={() => setOpenId(null)}
          onChanged={(list) => sellers.setData(list)}
        />
      )}
    </div>
  )
}

function SellerSheet({
  storeId,
  seller,
  onClose,
  onChanged,
}: {
  storeId: string
  seller: SupplierSeller
  onClose: () => void
  onChanged: (list: SupplierSeller[]) => void
}) {
  const name = seller.store?.name ?? 'this seller'
  const terms = useLoad(() => supplierApi.terms(storeId, seller.linkId), [storeId, seller.linkId, seller.status])
  const [busy, setBusy] = useState<LinkStatus | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ended = seller.status === 'ENDED'

  const move = async (status: LinkStatus) => {
    setBusy(status)
    setError(null)
    try {
      onChanged(await supplierApi.updateSeller(storeId, seller.linkId, status))
      showToast(`${name} has been told`)
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(null)
      setConfirmEnd(false)
    }
  }

  const current = terms.data?.current
  return (
    <Dialog open title={name} subtitle={<LinkStatusBadge status={seller.status} />} onClose={onClose}>
      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold text-fg">Terms</h3>
          <dl className="divide-y divide-line">
            <TermLine label="Cash on delivery" value={codText(seller.codAllowed)} />
            <TermLine label="If a parcel comes back, your shipping fee is paid by" value={feePayerText(seller.returnFeePayer, 'supplier', name)} />
            {current && (
              <>
                <TermLine label="Your shipping fee per order" value={money(current.shippingFee)} />
                <TermLine label="You ship within" value={dayText(current.shipWithinDays)} />
                <TermLine label="Returns" value={returnsText(current.returnDays)} />
              </>
            )}
          </dl>
          <p className="mt-1 text-xs text-muted">
            {name} sets cash on delivery and the returned-parcel fee. Change your own terms in
            Supplier settings.
          </p>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold text-fg">Changes</h3>
          {terms.loading && !terms.data && <p className="text-sm text-muted">Loading…</p>}
          {terms.error && <ErrorNote>{terms.error}</ErrorNote>}
          {terms.data && <TermsLog log={terms.data.log} viewer="supplier" />}
        </section>

        {error && <ErrorNote>{error}</ErrorNote>}

        {!ended ? (
          <section className="space-y-2 border-t border-line pt-4">
            <p className="text-xs text-muted">Don't agree with a change? You can pause or stop supplying {name}.</p>
            {seller.status === 'ACTIVE' ? (
              <Button variant="secondary" full loading={busy === 'PAUSED'} onClick={() => move('PAUSED')}>
                Pause — no new orders for now
              </Button>
            ) : (
              <Button variant="secondary" full loading={busy === 'ACTIVE'} onClick={() => move('ACTIVE')}>
                Resume supplying
              </Button>
            )}
            <Button variant="danger" full onClick={() => setConfirmEnd(true)}>
              Stop supplying {name}
            </Button>
          </section>
        ) : (
          <InfoNote>You no longer supply {name}.</InfoNote>
        )}
      </div>
      <ConfirmDialog
        open={confirmEnd}
        title={`Stop supplying ${name}?`}
        description="They can't place new orders with you. Orders already placed still need shipping, and your account with them stays. This can't be undone."
        confirmLabel="Stop supplying"
        busy={busy === 'ENDED'}
        onConfirm={() => move('ENDED')}
        onCancel={() => setConfirmEnd(false)}
      />
    </Dialog>
  )
}
