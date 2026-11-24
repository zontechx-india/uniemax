import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useGoBack } from '../../../../shared/useGoBack'
import { toApiError } from '../../../../shared/auth/http'
import { Button, buttonClass } from '../../../../shared/ui/Button'
import { ConfirmDialog } from '../../../../shared/ui/ConfirmDialog'
import { ErrorNote, InfoNote } from '../../../../shared/ui/form'
import { billMessage, billsApi, downloadFile, OFFLINE_MODE, pdfFileName, shareOrDownload, spacedNumber, whatsappUrl } from '../../../features/bills/billsApi'
import type { Bill, ShareVia } from '../../../features/bills/billsApi'
import { useManagedStore } from '../../../features/stores/useManagedStore'
import { ArrowLeftIcon, ArrowRightIcon, ChatIcon, ClipboardIcon, DownloadIcon, ReceiptIcon, ShareIcon } from '../../../layout/icons'
import { EmptyState } from '../ui/EmptyState'
import { PanelCard } from '../ui/PanelCard'
import { showToast } from '../ui/Toast'
import { BillStatus, draftFromBill, rupees, saveDraft, spacedPhone, Thumb } from './billUi'

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

  // Fetch the PDF ahead (bill while open, receipt once paid): a share sheet
  // must open straight from the tap, and Safari refuses one after a slow wait.
  const [pdf, setPdf] = useState<Blob | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const pdfState = bill?.state
  useEffect(() => {
    setPdf(null)
    if (pdfState !== 'OPEN' && pdfState !== 'PAID') return
    let live = true
    billsApi
      .pdf(store.id, billId)
      .then((blob) => live && setPdf(blob))
      .catch(() => {
        /* made again on tap, which shows the error */
      })
    return () => {
      live = false
    }
  }, [store.id, billId, pdfState])

  const back = (
    <Button variant="ghost" size="md" className="-ml-2 px-2!" onClick={goBack}>
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
  // Paid to the seller directly: the bill is a receipt — still sent on WhatsApp.
  const offline = bill.payWay === 'OFFLINE'
  const paidTo = offline ? `Paid to you${bill.offlineMode ? ` · ${OFFLINE_MODE[bill.offlineMode]}` : ''}` : 'Paid online'
  const canSend = open || (offline && bill.state === 'PAID')
  const message = billMessage(bill, rupees)
  const docName = bill.state === 'PAID' ? 'Receipt' : 'Bill'

  /** The PDF (already fetched, so the share sheet opens straight from the tap). */
  const pdfNow = async () => pdf ?? (await billsApi.pdf(store.id, bill.id))
  const sharePdf = async () => {
    setPdfBusy(true)
    try {
      const blob = await pdfNow()
      setPdf(blob)
      const result = await shareOrDownload(blob, pdfFileName(bill), message)
      if (result === 'shared') void share('SHARE')
      if (result === 'downloaded') showToast(`${docName} saved as a PDF`)
    } catch (err) {
      showToast(toApiError(err).message, 'danger')
    } finally {
      setPdfBusy(false)
    }
  }
  const savePdf = async () => {
    setPdfBusy(true)
    try {
      const blob = await pdfNow()
      setPdf(blob)
      downloadFile(blob, pdfFileName(bill))
    } catch (err) {
      showToast(toApiError(err).message, 'danger')
    } finally {
      setPdfBusy(false)
    }
  }
  const pdfButtons = (
    <div className="mt-3 flex gap-2">
      <Button variant="secondary" size="md" className="min-w-0 flex-1" loading={pdfBusy} onClick={sharePdf}>
        <ShareIcon className="h-4 w-4" />
        Share {docName.toLowerCase()} PDF
      </Button>
      <Button variant="ghost" size="md" disabled={pdfBusy} onClick={savePdf} aria-label={`Download the ${docName.toLowerCase()} PDF`} title="Download PDF">
        <DownloadIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Download</span>
      </Button>
    </div>
  )

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
      <section className="ws-card rounded-lg">
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {docName} <span className="font-figure tabular-nums">{spacedNumber(bill.number)}</span>
            </p>
            <BillStatus bill={bill} />
          </div>
          <p className="mt-2 font-figure text-3xl leading-tight font-semibold tabular-nums text-fg">{rupees(bill.total)}</p>
          <p className="mt-1 text-base text-fg">
            {bill.customerName ?? spacedPhone(bill.customerPhone)}
            <span className="text-muted">
              {' '}
              · {bill.itemCount} item{bill.itemCount === 1 ? '' : 's'}
            </span>
          </p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-line px-4 py-3 text-sm sm:px-5">
          {bill.customerName && (
            <>
              <dt className="text-muted">Phone</dt>
              <dd className="text-fg">{spacedPhone(bill.customerPhone)}</dd>
            </>
          )}
          <dt className="text-muted">Made</dt>
          <dd className="text-fg">{when(bill.createdAt)}</dd>
          {open && (
            <>
              <dt className="text-muted">Open till</dt>
              <dd className="text-fg">{when(bill.expiresAt)}</dd>
            </>
          )}
          {bill.state === 'PAID' && (
            <>
              <dt className="text-muted">Paid</dt>
              <dd className="text-fg">
                {offline ? `To you${bill.offlineMode ? ` · ${OFFLINE_MODE[bill.offlineMode]}` : ''}` : 'Online'}
                {bill.offlineRef && <span className="text-muted"> · Ref {bill.offlineRef}</span>}
              </dd>
            </>
          )}
          <dt className="text-muted">{bill.fulfilment === 'PICKUP' && !bill.handedOver ? 'Pickup' : 'Delivery'}</dt>
          <dd className="break-words text-fg">
            {bill.handedOver
              ? 'Taken in the shop'
              : bill.address
                ? `${bill.address.address}, ${bill.address.state} ${bill.address.pincode}`
                : bill.fulfilment === 'PICKUP'
                  ? 'They collect it from your shop'
                  : 'They add the address when they pay'}
          </dd>
        </dl>
      </section>
      {error && <ErrorNote>{error}</ErrorNote>}
      {bill.order && (
        <InfoNote>
          {offline
            ? bill.handedOver
              ? `Saved as order ${bill.order.orderNumber}, delivered — they took it in the shop.`
              : `Saved as order ${bill.order.orderNumber}. Pack and send it from the order.`
            : `Paid online — this bill is now order ${bill.order.orderNumber}. Pack and send it from the order.`}
          {bill.order.paidByName && ` Paid by ${bill.order.paidByName}${bill.order.paidByPhone ? ` (${bill.order.paidByPhone})` : ''}; the order is in ${bill.customerName ?? 'the customer'}'s history.`}
        </InfoNote>
      )}
      {bill.state === 'EXPIRED' && <InfoNote>Not paid in time, so the link no longer takes payment. Nothing was charged and no stock was held.</InfoNote>}

      {canSend && (
        <PanelCard title={bill.sharedAt ? 'Message sent' : `Send the ${offline ? 'receipt' : 'bill'}`} description="Goes from your own WhatsApp.">
          <p className="rounded-md bg-surface-alt px-3 py-2.5 text-sm leading-relaxed break-words text-fg">{message}</p>
          {pdfButtons}
        </PanelCard>
      )}
      {!canSend && bill.state === 'PAID' && (
        <PanelCard title="Receipt PDF" description="Send it to your customer or keep it for your records.">
          {pdfButtons}
        </PanelCard>
      )}

      <PanelCard title={`Items (${bill.items.length})`} padded={false}>
        <ul className="divide-y divide-line px-4 sm:px-5">
          {bill.items.map((i) => (
            <li key={`${i.productId}:${i.variantId ?? ''}`} className="flex items-center gap-3 py-3">
              <Thumb src={i.imageUrl} size="h-11 w-11" px="44px" />
              <div className="min-w-0 flex-1">
                <p className="text-base leading-snug font-medium break-words text-fg">{i.productName}</p>
                <p className="mt-0.5 text-sm text-muted">
                  {i.variantName && <>{i.variantName} · </>}
                  {i.quantity} × {rupees(i.unitPrice)}
                </p>
              </div>
              <span className="shrink-0 font-figure text-base font-semibold tabular-nums text-fg">{rupees(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-1.5 border-t border-line px-4 py-3 text-sm sm:px-5">
          <div className="flex justify-between"><dt className="text-muted">Items</dt><dd className="font-figure tabular-nums text-fg">{rupees(bill.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="font-figure tabular-nums text-fg">{bill.fulfilment === 'PICKUP' ? 'Pickup' : Number(bill.shippingCharge) === 0 ? 'Free' : rupees(bill.shippingCharge)}</dd></div>
          {Number(bill.discount) > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">Discount{bill.discountType === 'PERCENT' && bill.discountValue ? ` (${Number(bill.discountValue)}%)` : ''}</dt>
              <dd className="font-figure tabular-nums text-fg">− {rupees(bill.discount)}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-line pt-2 text-base font-semibold text-fg"><dt>Total</dt><dd className="font-figure tabular-nums">{rupees(bill.total)}</dd></div>
        </dl>
        {bill.note && (
          <p className="border-t border-line px-4 py-3 text-sm text-muted sm:px-5">
            Note: <span className="text-fg">{bill.note}</span>
          </p>
        )}
      </PanelCard>

      <PanelCard title="Activity">
        {offline ? (
          <ol>
            {step('Bill made', bill.createdAt)}
            {step(paidTo, bill.paidAt, bill.offlineRef ? `Ref ${bill.offlineRef}` : undefined)}
            {step('Receipt sent', bill.sharedAt, bill.shares[0] ? SHARE_VIA[bill.shares[0].via] : 'Send it from the button below')}
            {step('Customer opened it', bill.openedAt, undefined, true)}
          </ol>
        ) : (
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
        )}
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
          {offline && bill.order ? (
            <>
              <a
                href={whatsappUrl(bill.customerPhone, message)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => void share('WHATSAPP')}
                className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-md bg-whatsapp px-4 text-base font-semibold whitespace-nowrap text-whatsapp-contrast transition-[filter] duration-150 hover:brightness-95"
              >
                <ChatIcon className="h-5 w-5" />
                {bill.sharedAt ? 'Send again' : 'Send receipt'}
              </a>
              <Link to={`/mystores/${store.slug}/orders/${bill.order.id}`} className={buttonClass({ variant: 'secondary', size: 'lg', className: 'px-3.5' })}>
                Order
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </>
          ) : bill.order ? (
            <Link to={`/mystores/${store.slug}/orders/${bill.order.id}`} className={buttonClass({ variant: 'ink', size: 'lg', className: 'min-w-0 flex-1' })}>
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
            <Button variant="ink" size="lg" className="min-w-0 flex-1" onClick={again}>
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
