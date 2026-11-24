import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useGoBack } from '../../../../shared/useGoBack'
import { toApiError } from '../../../../shared/auth/http'
import { Button, buttonClass } from '../../../../shared/ui/Button'
import { ConfirmDialog } from '../../../../shared/ui/ConfirmDialog'
import { ErrorNote, InfoNote } from '../../../../shared/ui/form'
import { billMessage, billsApi, spacedNumber, whatsappUrl } from '../../../features/bills/billsApi'
import type { Bill, ShareVia } from '../../../features/bills/billsApi'
import { useManagedStore } from '../../../features/stores/useManagedStore'
import { ArrowLeftIcon, ArrowRightIcon, BoxIcon, ChatIcon, ClipboardIcon, LinkIcon, MapPinIcon, ReceiptIcon, UserIcon } from '../../../layout/icons'
import { EmptyState } from '../ui/EmptyState'
import { PanelCard } from '../ui/PanelCard'
import { showToast } from '../ui/Toast'
import { BILL_STAGE, BillStatePill, draftFromBill, QuietTag, rupees, saveDraft, Thumb } from './billUi'

/**
 * One bill. While it waits: the exact message, "Send on WhatsApp" (opens the
 * SELLER's WhatsApp on the customer's chat, text filled in — they press send),
 * Copy link, and a timeline (made → shared → opened → paid). Paid: a link to
 * its order. Closed: "Make a new bill like this".
 */

const SHARE_VIA: Record<ShareVia, string> = { WHATSAPP: 'WhatsApp', COPY: 'Copied link', SHARE: 'Share menu' }
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export function StoreBillPage() {
  const { store } = useManagedStore()
  const { billId = '' } = useParams()
  const navigate = useNavigate()
  const goBack = useGoBack(`/mystores/${store.slug}/bills`)
  const [bill, setBill] = useState<Bill | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [askCancel, setAskCancel] = useState(false)

  useEffect(() => {
    let live = true
    setBill(null)
    billsApi
      .get(store.id, billId)
      .then((b) => live && setBill(b))
      .catch((err) => live && setError(toApiError(err).message))
    return () => {
      live = false
    }
  }, [store.id, billId])

  const back = (
    <Button variant="ghost" size="md" className="-ml-2 px-2" onClick={goBack}>
      <ArrowLeftIcon className="h-5 w-5" />
      Bills
    </Button>
  )
  if (error && !bill) {
    return (
      <div className="ws-form space-y-4">
        {back}
        <div className="ws-card rounded-lg">
          <EmptyState icon={ReceiptIcon} title="Bill not found" description={error} />
        </div>
      </div>
    )
  }
  if (!bill) {
    return (
      <div className="ws-form space-y-4" aria-busy="true">
        {back}
        <div className="ws-card h-32 animate-pulse rounded-lg" />
        <div className="ws-card h-48 animate-pulse rounded-lg" />
      </div>
    )
  }

  const open = bill.state === 'OPEN'
  const message = billMessage(bill, rupees)

  /** Record what the seller did (WhatsApp itself is opened by the link they tapped). */
  const share = async (via: ShareVia) => {
    if (via === 'COPY') {
      try {
        await navigator.clipboard.writeText(bill.link)
        showToast('Link copied — paste it in any chat')
      } catch {
        showToast('Could not copy — press and hold the link to copy it', 'danger')
      }
    }
    try {
      setBill(await billsApi.share(store.id, bill.id, via))
    } catch {
      /* the share happened anyway; only the record failed */
    }
  }

  const cancel = async () => {
    setBusy(true)
    try {
      setBill(await billsApi.cancel(store.id, bill.id))
      setAskCancel(false)
      showToast('Bill cancelled — the link no longer takes payment')
    } catch (err) {
      setError(toApiError(err).message)
      setAskCancel(false)
    } finally {
      setBusy(false)
    }
  }

  const again = () => {
    saveDraft(store.id, draftFromBill(bill))
    navigate(`/mystores/${store.slug}/bills/new`)
  }

  const step = (label: string, at: string | null, sub?: string, last = false, bad = false) => (
    <li className={`relative flex gap-3 ${last ? '' : 'pb-4'}`}>
      {!last && <span aria-hidden="true" className={`absolute top-5 left-[9px] h-[calc(100%-12px)] w-px ${at ? 'bg-fg/30' : 'bg-line'}`} />}
      <span className={`relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${at ? (bad ? 'bg-muted' : 'bg-fg') : 'border-2 border-line bg-surface'}`} />
      <div className="min-w-0">
        <p className={`text-base font-medium ${at ? 'text-fg' : 'text-muted'}`}>{label}</p>
        {(at || sub) && <p className="text-sm text-muted">{[at && when(at), sub].filter(Boolean).join(' · ')}</p>}
      </div>
    </li>
  )

  return (
    <div className="ws-form space-y-4">
      {back}
      <section className="ws-card rounded-lg p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <BillStatePill state={bill.state} />
          {open && <QuietTag>{BILL_STAGE[bill.stage]}</QuietTag>}
        </div>
        <h2 className="mt-3 font-figure text-3xl leading-tight font-semibold tabular-nums text-fg">{rupees(bill.total)}</h2>
        <p className="mt-1 text-base text-fg">
          {bill.customerName ?? bill.customerPhone} · {bill.itemCount} item{bill.itemCount === 1 ? '' : 's'}
        </p>
        <p className="mt-0.5 text-sm text-muted">
          Bill <span className="font-figure tabular-nums">{spacedNumber(bill.number)}</span> · made {when(bill.createdAt)}
          {open && ` · open till ${when(bill.expiresAt)}`}
        </p>
      </section>
      {error && <ErrorNote>{error}</ErrorNote>}
      {bill.order && <InfoNote>Paid online — this bill is now order {bill.order.orderNumber}. Pack and send it from the order.</InfoNote>}
      {bill.state === 'EXPIRED' && <InfoNote>Not paid in time, so the link no longer takes payment. Nothing was charged and no stock was held.</InfoNote>}

      {open && (
        <PanelCard
          icon={ChatIcon}
          title={bill.sharedAt ? 'The message you shared' : `Send the bill to ${bill.customerName ?? 'your customer'}`}
          description="It goes from your own WhatsApp, so they see a number they know."
        >
          <div className="rounded-lg bg-surface-alt p-3">
            <p className="max-w-[94%] rounded-lg rounded-tl-sm border border-line bg-surface px-3 py-2 text-sm leading-relaxed break-words text-fg">{message}</p>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-md border border-line px-3 py-2">
            <LinkIcon className="h-4 w-4 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate text-sm text-fg">{bill.link.replace(/^https?:\/\//, '')}</span>
          </div>
        </PanelCard>
      )}

      <PanelCard icon={UserIcon} title={bill.customerName ?? 'Customer'}>
        <div className="space-y-3">
          <p className="text-base text-fg">{bill.customerPhone}</p>
          <div className="border-t border-line pt-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-fg">
              <MapPinIcon className="h-4 w-4 text-muted" />
              {bill.fulfilment === 'PICKUP' ? 'Store pickup' : 'Send to'}
            </p>
            <p className="mt-1 text-base text-muted">
              {bill.fulfilment === 'PICKUP' ? 'They collect it from your shop.' : 'The customer adds their address when they pay.'}
            </p>
          </div>
        </div>
      </PanelCard>

      <PanelCard icon={BoxIcon} title={`On the bill (${bill.items.length})`} padded={false}>
        <ul className="divide-y divide-line px-4 sm:px-5">
          {bill.items.map((i) => (
            <li key={`${i.productId}:${i.variantId ?? ''}`} className="flex items-center gap-3 py-3">
              <Thumb src={i.imageUrl} size="h-12 w-12" px="48px" />
              <div className="min-w-0 flex-1">
                <p className="text-base leading-snug font-medium break-words text-fg">{i.productName}</p>
                <p className="mt-0.5 text-sm text-muted">
                  {i.variantName && <span className="font-medium text-fg">{i.variantName} · </span>}
                  <span className="font-semibold text-fg">{i.quantity}</span> × {rupees(i.unitPrice)}
                </p>
              </div>
              <span className="shrink-0 font-figure text-base font-semibold tabular-nums text-fg">{rupees(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-1.5 border-t border-line px-4 py-3 text-base sm:px-5">
          <div className="flex justify-between"><dt className="text-muted">Items</dt><dd className="font-figure tabular-nums">{rupees(bill.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="font-figure tabular-nums">{bill.fulfilment === 'PICKUP' ? 'Pickup' : Number(bill.shippingCharge) === 0 ? 'Free' : rupees(bill.shippingCharge)}</dd></div>
          {Number(bill.discount) > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">Discount{bill.discountType === 'PERCENT' && bill.discountValue ? ` (${Number(bill.discountValue)}%)` : ''}</dt>
              <dd className="font-figure tabular-nums">− {rupees(bill.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Total</dt><dd className="font-figure tabular-nums">{rupees(bill.total)}</dd></div>
        </dl>
        {bill.note && <p className="border-t border-line px-4 py-3 text-sm text-muted sm:px-5">Note to the customer: <span className="text-fg">“{bill.note}”</span></p>}
      </PanelCard>

      <PanelCard title="What has happened">
        <ol>
          {step('Bill made', bill.createdAt)}
          {step('Shared with the customer', bill.sharedAt, bill.shares[0] ? SHARE_VIA[bill.shares[0].via] : open ? 'Send it from the button below' : undefined)}
          {step('Customer opened it', bill.openedAt)}
          {bill.state === 'CANCELLED'
            ? step('Cancelled', bill.cancelledAt, undefined, true, true)
            : bill.state === 'EXPIRED'
              ? step('Link expired', bill.expiresAt, undefined, true, true)
              : step('Paid online', bill.paidAt, open ? `Open till ${when(bill.expiresAt)}` : undefined, true)}
        </ol>
      </PanelCard>

      {open && (
        <div className="flex justify-center">
          <Button variant="ghost" size="md" className="text-danger" onClick={() => setAskCancel(true)}>
            Cancel this bill
          </Button>
        </div>
      )}

      <div className="sticky bottom-[calc(var(--seller-dock,0px)+0.75rem)] z-20">
        <div className="ws-bar flex items-center gap-2 rounded-lg p-2 sm:p-3">
          {bill.order ? (
            <Link to={`/mystores/${store.slug}/orders/${bill.order.id}`} className={buttonClass({ size: 'lg', className: 'min-w-0 flex-1' })}>
              Open order {bill.order.orderNumber}
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          ) : open ? (
            <>
              {/* wa.me opens the SELLER's WhatsApp on the customer's chat, the text filled in. */}
              <a
                href={whatsappUrl(bill.customerPhone, message)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => void share('WHATSAPP')}
                className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-md bg-whatsapp px-4 text-base font-semibold whitespace-nowrap text-whatsapp-contrast transition-[filter] duration-150 hover:brightness-95"
              >
                <ChatIcon className="h-5 w-5" />
                {bill.sharedAt ? 'Send again' : 'Send on WhatsApp'}
              </a>
              <Button variant="secondary" size="lg" className="px-3.5" onClick={() => share('COPY')} aria-label="Copy the link" title="Copy the link">
                <ClipboardIcon className="h-5 w-5" />
                <span className="hidden sm:inline">Copy link</span>
              </Button>
            </>
          ) : (
            <Button size="lg" className="min-w-0 flex-1" onClick={again}>
              Make a new bill like this
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={askCancel}
        title="Cancel this bill?"
        description="The link stops taking payment. The customer is not told — tell them yourself if needed."
        confirmLabel="Cancel bill"
        cancelLabel="Keep it"
        busy={busy}
        onConfirm={cancel}
        onCancel={() => setAskCancel(false)}
      />
    </div>
  )
}
