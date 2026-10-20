import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { AppLogoLockup } from '../../../shared/ui/AppLogo'
import { Button, buttonClass } from '../../../shared/ui/Button'
import { ErrorNote, InfoNote, Select, TextField } from '../../../shared/ui/form'
import { useMarketSession } from '../../../storefront/app/marketSession'
import { openAuthDialog } from '../../../storefront/features/auth/authDialogStore'
import { AddressFields, validateAddress } from '../../../storefront/features/stores/AddressFields'
import type { AddressErrors } from '../../../storefront/features/stores/AddressFields'
import { EMPTY_ADDRESS } from '../../../storefront/features/stores/storeProfile'
import type { StoreAddress } from '../../../storefront/features/stores/storeProfile'
import { inviteApi } from '../api'
import type { InvitePreview, JoinResult, JoinStore } from '../api'
import { refreshDropshipRole } from '../role'
import { ChoiceCard, Question, dayText, money, returnsText, shortDate, useLoad } from '../ui'

const NEW = 'new'

/**
 * /supplier-invite/:token — where a seller's invite lands. Public, so the
 * supplier reads who is inviting and on what terms before signing in; the
 * sign-in dialog opens in place. Then the join sheet: an existing store or a
 * short form, and the supplier's own terms, none pre-selected
 * (docs/dropshipping/suppliers/context.md → "The supplier joins").
 */
export function JoinPage() {
  const { token = '' } = useParams()
  const { state } = useMarketSession()
  const invite = useLoad(() => inviteApi.preview(token), [token])
  const [joined, setJoined] = useState<JoinResult | null>(null)
  const data = invite.data
  const authed = state.status === 'authed'

  return (
    <div className="flex min-h-screen justify-center bg-bg px-4 py-8 sm:items-center sm:py-10">
      <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-5 sm:p-8">
        <Link to="/" className="inline-flex">
          <AppLogoLockup className="h-8" />
        </Link>

        {invite.loading && <p className="mt-6 text-sm text-muted">Loading your invite…</p>}
        {invite.error && (
          <div className="mt-6">
            <ErrorNote>{invite.error}</ErrorNote>
          </div>
        )}

        {data && joined && <Joined seller={data.sellerName} result={joined} />}

        {data && !joined && (
          <>
            <h1 className="mt-6 text-xl font-semibold text-fg">
              Join {data.sellerName} as a supplier
            </h1>
            <p className="mt-2 text-sm text-muted">
              {data.sellerName} sells your products in their online store. You ship the orders
              straight to their customers.
            </p>
            <dl className="mt-4 divide-y divide-line rounded-md border border-line px-3">
              <Row label="Cash on delivery" value={data.codAllowed ? 'Yes — you collect the cash through your courier' : 'No — online payment only'} />
              <Row
                label="If a parcel comes back, your shipping fee is paid by"
                value={data.returnFeePayer === 'SELLER' ? data.sellerName : 'You'}
              />
            </dl>

            {data.status !== 'SENT' ? (
              <p className="mt-6 rounded-md bg-surface-alt p-3 text-sm text-muted">
                {data.status === 'ACCEPTED' && 'This invite has already been used.'}
                {data.status === 'EXPIRED' && `This invite has expired — ask ${data.sellerName} to send it again.`}
                {data.status === 'REVOKED' && `${data.sellerName} cancelled this invite.`}
              </p>
            ) : authed ? (
              <JoinForm token={token} invite={data} onJoined={setJoined} />
            ) : (
              <div className="mt-6 space-y-3">
                <Button full onClick={() => openAuthDialog()}>
                  Sign in to join
                </Button>
                <p className="text-center text-xs text-muted">
                  New to UnieMax? Signing in with your phone creates your account. This link
                  works until {shortDate(data.expiresAt)}.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm font-medium text-fg">{value}</dd>
    </div>
  )
}

function JoinForm({
  token,
  invite,
  onJoined,
}: {
  token: string
  invite: InvitePreview
  onJoined: (result: JoinResult) => void
}) {
  const stores = useLoad(() => inviteApi.stores(token), [token])
  const [choice, setChoice] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState<StoreAddress>(EMPTY_ADDRESS)
  const [addressErrors, setAddressErrors] = useState<AddressErrors>({})
  const [fee, setFee] = useState('')
  const [shipWithin, setShipWithin] = useState('')
  const [returns, setReturns] = useState<boolean | null>(null)
  const [returnDays, setReturnDays] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const usable = (stores.data ?? []).filter((s) => !s.isSeller)
  // With no store of their own, the short form is the only way in.
  useEffect(() => {
    if (stores.data && usable.length === 0) setChoice(NEW)
  }, [stores.data, usable.length])

  const chosen: JoinStore | undefined = usable.find((s) => s.id === choice)
  const isNew = choice === NEW
  const askTerms = isNew || (chosen != null && chosen.supplier == null)

  const submit = async () => {
    const next: Record<string, string> = {}
    if (!choice) next.choice = 'Choose a store or create a supplier account'
    let addrErrors: AddressErrors = {}
    if (isNew) {
      if (!name.trim()) next.name = 'Enter your business name'
      if (!/^\+?[0-9]{7,15}$/.test(phone.replace(/\s/g, ''))) next.phone = 'Enter a valid phone number'
      addrErrors = validateAddress(address)
    }
    if (askTerms) {
      if (!/^\d+(\.\d{1,2})?$/.test(fee.trim())) next.fee = 'Enter your fee in rupees — 0 if you charge none'
      if (!shipWithin) next.shipWithin = 'Choose how soon you ship'
      if (returns === null) next.returns = 'Choose an answer'
      if (returns && !(Number(returnDays) >= 1 && Number(returnDays) <= invite.returnDaysMax)) {
        next.returnDays = `Enter 1 to ${invite.returnDaysMax} days`
      }
    }
    setErrors(next)
    setAddressErrors(addrErrors)
    if (Object.keys(next).length > 0 || Object.keys(addrErrors).length > 0) return

    setBusy(true)
    setError(null)
    try {
      const result = await inviteApi.accept(token, {
        ...(isNew
          ? { newStore: { name: name.trim(), phone: phone.replace(/\s/g, ''), address } }
          : { storeId: choice! }),
        ...(askTerms
          ? {
              shippingFee: Number(fee),
              shipWithinDays: Number(shipWithin),
              returnDays: returns ? Number(returnDays) : 0,
            }
          : {}),
      })
      if (result.storeSlug) refreshDropshipRole(result.storeSlug)
      onJoined(result)
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  if (stores.loading && !stores.data) return <p className="mt-6 text-sm text-muted">Loading…</p>
  if (stores.error) return <div className="mt-6"><ErrorNote>{stores.error}</ErrorNote></div>

  return (
    <div className="mt-6 space-y-6">
      {usable.length > 0 && (
        <Question legend="Which store will supply?" error={errors.choice}>
          {usable.map((s) => (
            <ChoiceCard
              key={s.id}
              name="join-store"
              checked={choice === s.id}
              onSelect={() => setChoice(s.id)}
              disabled={!s.hasAddress}
              title={`Use ${s.name}`}
              note={
                !s.hasAddress
                  ? 'Add its business address first (Business details), or create a supplier account'
                  : s.supplier
                    ? `Already supplies: ${money(s.supplier.shippingFee)} fee · ships within ${dayText(s.supplier.shipWithinDays)} · ${returnsText(s.supplier.returnDays).toLowerCase()}`
                    : undefined
              }
            />
          ))}
          <ChoiceCard
            name="join-store"
            checked={isNew}
            onSelect={() => setChoice(NEW)}
            title="Create a supplier account"
            note="A separate account just for supplying sellers."
          />
        </Question>
      )}

      {isNew && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-fg">Your business</h2>
          <TextField
            label="Business name *"
            placeholder="Sri Textiles"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            error={errors.name}
          />
          <TextField
            label="Business phone *"
            inputMode="tel"
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={errors.phone}
          />
          <div>
            <p className="mb-2 text-sm font-semibold text-fg">Pickup address</p>
            <AddressFields value={address} onChange={setAddress} errors={addressErrors} idPrefix="join" />
          </div>
        </section>
      )}

      {askTerms && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-fg">Your terms for sellers</h2>
          <TextField
            label="Shipping fee per order (₹) *"
            inputMode="decimal"
            placeholder="e.g. 60"
            value={fee}
            onChange={(e) => setFee(e.target.value.replace(/[^\d.]/g, ''))}
            hint="What you charge the seller for shipping one order. 0 if none."
            error={errors.fee}
          />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-fg">Ship within *</span>
            <Select
              className="h-field"
              value={shipWithin}
              onChange={(e) => setShipWithin(e.target.value)}
              aria-invalid={errors.shipWithin ? true : undefined}
            >
              <option value="" disabled>
                Choose
              </option>
              {Array.from({ length: invite.shipWithinDaysMax }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {dayText(n)} of the order
                </option>
              ))}
            </Select>
            {errors.shipWithin && (
              <span role="alert" className="mt-1.5 block text-xs text-danger">
                {errors.shipWithin}
              </span>
            )}
          </label>
          <Question legend="Do you accept returns?" error={errors.returns}>
            <ChoiceCard name="join-returns" checked={returns === false} onSelect={() => setReturns(false)} title="No" />
            <ChoiceCard name="join-returns" checked={returns === true} onSelect={() => setReturns(true)} title="Yes" />
          </Question>
          {returns && (
            <TextField
              label="Returns accepted within (days) *"
              inputMode="numeric"
              placeholder="7"
              value={returnDays}
              onChange={(e) => setReturnDays(e.target.value.replace(/\D/g, '').slice(0, 2))}
              error={errors.returnDays}
            />
          )}
        </section>
      )}

      {chosen?.supplier && (
        <InfoNote>
          {chosen.name} already supplies other sellers, so it keeps its current terms. You can
          change them in its supplier settings.
        </InfoNote>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}
      <Button full size="lg" loading={busy} onClick={submit}>
        Join {invite.sellerName}
      </Button>
      <p className="text-center text-xs text-muted">
        No bank account needed now — you and {invite.sellerName} settle payments directly.
      </p>
    </div>
  )
}

function Joined({ seller, result }: { seller: string; result: JoinResult }) {
  const slug = result.storeSlug
  return (
    <div className="mt-6 space-y-4">
      <h1 className="text-xl font-semibold text-fg">You now supply {seller}</h1>
      <p className="text-sm text-muted">
        Next, choose the products you'll supply and set a price for sellers. {seller} sees them
        as soon as you offer them.
      </p>
      {slug && (
        <div className="space-y-2">
          {result.supplyOnly ? (
            <Link to={`/mystores/${slug}/products`} className={buttonClass({ variant: 'primary', full: true })}>
              Add the products you'll supply
            </Link>
          ) : (
            <Link to={`/mystores/${slug}/supply`} className={buttonClass({ variant: 'primary', full: true })}>
              Choose products to offer
            </Link>
          )}
          <Link to={`/mystores/${slug}/sellers`} className={buttonClass({ variant: 'ghost', full: true })}>
            See your sellers
          </Link>
        </div>
      )}
    </div>
  )
}
