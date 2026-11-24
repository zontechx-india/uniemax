import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePrivatePageTitle } from '../../../shared/seo'
import { toApiError } from '../../../shared/auth/http'
import { Button, buttonClass } from '../../../shared/ui/Button'
import { ErrorNote } from '../../../shared/ui/form'
import { FIELD_LABEL, fieldClass } from '../../../shared/ui/field'
import { MediaImg } from '../../../shared/media/MediaImg'
import { PageSkeleton } from '../../../shared/ui/states'
import { useMarketSession } from '../../app/marketSession'
import { openAuthDialog, storeAuthRequest } from '../../features/auth/authDialogStore'
import { downloadFile, OFFLINE_MODE, pdfFileName, publicBillApi, spacedNumber } from '../../features/bills/billsApi'
import type { PublicBill } from '../../features/bills/billsApi'
import { storeVars } from '../../features/publicStore/storeTheme'
import { useStoreShell } from '../../features/publicStore/useStoreShells'
import { INDIAN_STATES } from '../../features/stores/storeProfile'
import { formatPrice, launchCashfreeCheckout } from '../../features/stores/storesApi'
import { ArrowLeftIcon, CheckIcon, DownloadIcon, LifebuoyIcon, LockIcon, MapPinIcon } from '../../layout/icons'
import { StoreLogo } from '../cart/StoreLogo'

/**
 * A seller's bill, opened from the link they shared (`/b/{token}`).
 * Public and `noindex` (a per-customer page — docs/SEO.md).
 *
 *   1. the bill — items with size, delivery, discount, total, the seller's note
 *   2. Pay → sign in in place (OTP, the store-branded auth dialog)
 *   3. where it goes (delivery bills) → the payment partner's page
 *   → back on `/order/{store}/{order}` like any checkout order
 *
 * Paid / expired / cancelled / not found each get their own page. The page
 * wears the shop's colour (storeVars), like checkout.
 */

const when = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export function BillPayPage({ token }: { token: string }) {
  usePrivatePageTitle('Your bill')
  const navigate = useNavigate()
  const { state: session } = useMarketSession()
  const [bill, setBill] = useState<PublicBill | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [step, setStep] = useState<'bill' | 'address'>('bill')
  const [form, setForm] = useState({ name: '', phone: '', address: '', pincode: '', state: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const shell = useStoreShell(bill?.store.slug ?? '')

  useEffect(() => {
    let live = true
    publicBillApi
      .get(token)
      .then((b) => live && setBill(b))
      .catch((err) => live && setLoadError(toApiError(err).message))
    return () => {
      live = false
    }
    // A sign-in can reveal the paid order to its owner — read again then.
  }, [token, session.status])

  // Pre-fill who it is for from the bill and the signed-in account.
  useEffect(() => {
    if (!bill) return
    const me = session.status === 'authed' ? session.user : null
    setForm((f) => ({
      ...f,
      name: f.name || me?.name || bill.customerName || '',
      phone: f.phone || (me?.phone ?? '').replace(/^\+91/, ''),
    }))
  }, [bill, session])

  const shellStyle = shell ? storeVars(shell.theme) : undefined
  const frame = (body: React.ReactNode, bar?: React.ReactNode) => (
    <div className="ws-form flex min-h-dvh flex-col bg-bg text-fg" style={shellStyle}>
      <header className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-md items-center gap-3 px-4">
          <StoreLogo shell={shell} name={bill?.store.name ?? ""} className="h-8 w-8" />
          <p className="min-w-0 flex-1 truncate text-base font-semibold">{bill?.store.name ?? 'Your bill'}</p>
        </div>
      </header>
      <main className={`mx-auto w-full max-w-md flex-1 px-4 pt-4 ${bar ? 'pb-32' : 'pb-10'}`}>{body}</main>
      {bar && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface">
          <div className="mx-auto flex max-w-md items-center gap-3 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{bar}</div>
        </div>
      )}
    </div>
  )

  if (loadError) {
    return frame(
      <div className="py-10 text-center">
        <h1 className="text-xl font-semibold">This bill does not exist</h1>
        <p className="mt-1 text-sm text-muted">{loadError}. Check the link, or ask the shop to send it again.</p>
      </div>,
    )
  }
  if (!bill) return frame(<PageSkeleton label="Loading your bill" />)

  const delivery = bill.fulfilment === 'DELIVERY'
  const isPaid = bill.state === 'PAID'
  /** The bill (or receipt, once paid) as a PDF — the masked copy, like this page. */
  const savePdf = async () => {
    setPdfBusy(true)
    setPdfError(null)
    try {
      downloadFile(await publicBillApi.pdf(token), pdfFileName(bill))
    } catch (err) {
      setPdfError(toApiError(err).message)
    } finally {
      setPdfBusy(false)
    }
  }
  const pdfButton = (
    <>
      <Button variant="secondary" size="md" full className="mt-4" loading={pdfBusy} onClick={savePdf}>
        <DownloadIcon className="h-4 w-4" />
        Download {isPaid ? 'receipt' : 'bill'} (PDF)
      </Button>
      {pdfError && (
        <div className="mt-2">
          <ErrorNote>{pdfError}</ErrorNote>
        </div>
      )}
    </>
  )
  const help = (
    <Link to={`/store/${bill.store.slug}/support`} className={buttonClass({ variant: 'secondary', size: 'md', full: true, className: 'mt-4' })}>
      <LifebuoyIcon className="h-4 w-4" />
      Contact {bill.store.name}
    </Link>
  )

  const paper = (
    <article className="ws-card overflow-hidden rounded-lg">
      <header className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">Bill for {bill.customerName ?? bill.customerPhone}</p>
          <p className="mt-0.5 font-figure text-xl font-semibold tracking-wide tabular-nums">{spacedNumber(bill.number)}</p>
        </div>
        <p className="shrink-0 text-right text-xs text-muted">
          {when(bill.createdAt)}
          {bill.state === 'OPEN' && (
            <>
              <br />
              Pay by {when(bill.expiresAt)}
            </>
          )}
        </p>
      </header>
      <ul className="divide-y divide-line border-t border-line px-4">
        {bill.items.map((i, idx) => (
          <li key={idx} className="flex gap-3 py-3">
            {i.imageUrl ? (
              <MediaImg src={i.imageUrl} sizes="56px" alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-md border border-line object-cover" />
            ) : (
              <span aria-hidden="true" className="h-14 w-14 shrink-0 rounded-md border border-line bg-surface-alt" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug font-medium break-words">{i.productName}</p>
              <p className="mt-0.5 text-sm text-muted">
                {i.variantName && <>{i.variantName} · </>}
                {i.quantity} × {formatPrice(i.unitPrice)}
              </p>
            </div>
            <span className="shrink-0 font-figure text-sm font-semibold tabular-nums">{formatPrice(i.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <dl className="space-y-1 border-t border-dashed border-line px-4 pt-3 pb-4 text-sm">
        <div className="flex justify-between text-muted"><dt>Items</dt><dd className="font-figure tabular-nums text-fg">{formatPrice(bill.subtotal)}</dd></div>
        <div className="flex justify-between text-muted"><dt>Delivery</dt><dd className="font-figure tabular-nums text-fg">{!delivery ? 'Store pickup' : Number(bill.shippingCharge) === 0 ? 'Free' : formatPrice(bill.shippingCharge)}</dd></div>
        {Number(bill.discount) > 0 && (
          <div className="flex justify-between text-muted"><dt>Discount from the shop</dt><dd className="font-figure tabular-nums text-fg">− {formatPrice(bill.discount)}</dd></div>
        )}
        <div className="flex justify-between pt-2 text-base font-semibold"><dt>{bill.state === 'PAID' ? 'Paid' : 'To pay'}</dt><dd className="font-figure tabular-nums">{formatPrice(bill.total)}</dd></div>
      </dl>
      {bill.note && (
        <p className="border-t border-line bg-surface-alt px-4 py-3 text-sm">
          <span className="text-muted">From {bill.store.name}:</span> “{bill.note}”
        </p>
      )}
    </article>
  )

  if (bill.state === 'PAID') {
    return frame(
      <>
        <section className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/12 text-success">
            <CheckIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">{bill.payWay === 'OFFLINE' ? 'Thank you — paid' : 'This bill is paid'}</h1>
            <p className="mt-0.5 text-sm text-muted">
              {formatPrice(bill.total)} to {bill.store.name}
              {bill.payWay === 'OFFLINE' && bill.offlineMode && <> by {OFFLINE_MODE[bill.offlineMode].toLowerCase()}</>}
              {bill.paidAt && <> · {when(bill.paidAt)}</>}
            </p>
            {bill.payWay === 'OFFLINE' && !bill.order && (
              <p className="mt-1 text-sm text-muted">Sign in with your number ({bill.customerPhone}) to keep it in your orders.</p>
            )}
          </div>
        </section>
        {bill.order && (
          <Link to={`/order/${bill.store.slug}/${bill.order.id}`} className={buttonClass({ size: 'lg', full: true, className: 'mb-4' })}>
            See order {spacedNumber(bill.order.orderNumber)}
          </Link>
        )}
        {paper}
        {pdfButton}
        {help}
      </>,
    )
  }
  if (bill.state === 'EXPIRED' || bill.state === 'CANCELLED') {
    return frame(
      <>
        <section className="mb-4">
          <h1 className="text-xl font-semibold">{bill.state === 'EXPIRED' ? 'This bill has expired' : 'The shop cancelled this bill'}</h1>
          <p className="mt-1 text-sm text-muted">
            {bill.state === 'EXPIRED' ? `It could be paid until ${when(bill.expiresAt)}.` : 'It can no longer be paid.'} Nothing was charged. Ask {bill.store.name} for a new bill if you still want it.
          </p>
        </section>
        {paper}
        {help}
      </>,
    )
  }

  const signedIn = session.status === 'authed'
  const ask = () => {
    const onSignedIn = () => setStep('address')
    openAuthDialog(shell ? storeAuthRequest(shell, { onSignedIn }) : { onSignedIn })
  }
  const start = () => {
    setPayError(null)
    if (!signedIn) return ask()
    setStep('address')
  }

  const pay = async () => {
    const e: Record<string, string> = {}
    if (form.name.trim().length < 2) e.name = 'Enter your name.'
    if (form.phone.replace(/\D/g, '').length < 10) e.phone = 'Enter your 10-digit mobile number.'
    if (delivery) {
      if (form.address.trim().length < 10) e.address = 'Enter your house, street and area.'
      if (!/^[1-9]\d{5}$/.test(form.pincode.trim())) e.pincode = 'Enter a 6-digit PIN code.'
      if (!form.state) e.state = 'Choose your state.'
    }
    setErrors(e)
    if (Object.keys(e).length) return
    if (!signedIn) return ask()
    setPaying(true)
    setPayError(null)
    try {
      const result = await publicBillApi.pay(token, {
        name: form.name.trim(),
        phone: form.phone,
        ...(delivery ? { address: form.address.trim(), pincode: form.pincode.trim(), state: form.state } : {}),
      })
      if (result.payment) {
        // The payment partner's page; it comes back to the order page.
        await launchCashfreeCheckout(result.payment)
      }
      navigate(`/order/${result.storeSlug}/${result.orderId}`, { replace: true })
    } catch (err) {
      const apiError = toApiError(err)
      setPaying(false)
      if (apiError.statusCode === 401) {
        setPayError('Your session ended — sign in again to pay.')
        return ask()
      }
      setPayError(apiError.message)
    }
  }

  const payBar = (label: string, onClick: () => void) => (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">To pay</p>
        <p className="font-figure text-lg font-semibold tabular-nums">{formatPrice(bill.total)}</p>
      </div>
      <Button size="lg" loading={paying} onClick={onClick}>
        {label}
      </Button>
    </>
  )

  if (step === 'address') {
    const field = (key: keyof typeof form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
      <label className="block">
        <span className={FIELD_LABEL}>{label}</span>
        <input
          {...props}
          value={form[key]}
          onChange={(ev) => {
            setForm((f) => ({ ...f, [key]: ev.target.value }))
            setErrors(({ [key]: _gone, ...rest }) => rest)
          }}
          aria-invalid={errors[key] ? true : undefined}
          className={fieldClass({ invalid: !!errors[key] })}
        />
        {errors[key] && <p role="alert" className="mt-1.5 text-sm font-medium text-danger">{errors[key]}</p>}
      </label>
    )
    return frame(
      <>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2 px-2!" onClick={() => setStep('bill')}>
          <ArrowLeftIcon className="h-4 w-4" />
          Back to the bill
        </Button>
        <h1 className="text-xl font-semibold">{delivery ? 'Where should it go?' : 'Your details'}</h1>
        <p className="mt-1 mb-4 text-sm text-muted">{delivery ? `${bill.store.name} sends it here.` : `${bill.store.name} keeps it for you to collect.`}</p>
        <div className="space-y-4 rounded-lg border border-line bg-surface p-4">
          {field('name', 'Full name', { autoComplete: 'name', maxLength: 80 })}
          {field('phone', 'Mobile number', { type: 'tel', inputMode: 'numeric', autoComplete: 'tel-national', maxLength: 14 })}
          {delivery && (
            <>
              <label className="block">
                <span className={FIELD_LABEL}>House, street and area</span>
                <textarea
                  value={form.address}
                  onChange={(ev) => {
                    setForm((f) => ({ ...f, address: ev.target.value }))
                    setErrors(({ address: _gone, ...rest }) => rest)
                  }}
                  rows={3}
                  maxLength={300}
                  autoComplete="street-address"
                  aria-invalid={errors.address ? true : undefined}
                  className={fieldClass({ multiline: true, invalid: !!errors.address })}
                />
                {errors.address && <p role="alert" className="mt-1.5 text-sm font-medium text-danger">{errors.address}</p>}
              </label>
              <div className="grid grid-cols-2 gap-3">
                {field('pincode', 'PIN code', { inputMode: 'numeric', autoComplete: 'postal-code', maxLength: 6 })}
                <label className="block">
                  <span className={FIELD_LABEL}>State</span>
                  <select
                    value={form.state}
                    onChange={(ev) => {
                      setForm((f) => ({ ...f, state: ev.target.value }))
                      setErrors(({ state: _gone, ...rest }) => rest)
                    }}
                    aria-invalid={errors.state ? true : undefined}
                    className={fieldClass({ invalid: !!errors.state })}
                  >
                    <option value="">Choose</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  {errors.state && <p role="alert" className="mt-1.5 text-sm font-medium text-danger">{errors.state}</p>}
                </label>
              </div>
            </>
          )}
        </div>
        {payError && (
          <div className="mt-3">
            <ErrorNote>{payError}</ErrorNote>
          </div>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <LockIcon className="h-3.5 w-3.5" />
          You pay on the payment partner’s page — UPI, card or net banking.
        </p>
      </>,
      payBar(`Pay ${formatPrice(bill.total)}`, pay),
    )
  }

  return frame(
    <>
      <section className="mb-4">
        <h1 className="text-xl font-semibold">Your bill from {bill.store.name}</h1>
        <p className="mt-1 text-sm text-muted">
          Check it, then pay.{delivery ? ' You add your delivery address next.' : ''}
        </p>
      </section>
      {paper}
      {delivery && (
        <p className="mt-4 flex items-start gap-2 text-sm text-muted">
          <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0" />
          Delivered to the address you give before paying.
        </p>
      )}
      {payError && (
        <div className="mt-3">
          <ErrorNote>{payError}</ErrorNote>
        </div>
      )}
      {pdfButton}
      {help}
    </>,
    payBar(signedIn ? `Pay ${formatPrice(bill.total)}` : 'Sign in to pay', start),
  )
}
