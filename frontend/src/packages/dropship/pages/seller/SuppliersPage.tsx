import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../../shared/auth/http'
import { Button, buttonClass } from '../../../../shared/ui/Button'
import { ConfirmDialog } from '../../../../shared/ui/ConfirmDialog'
import { Dialog } from '../../../../shared/ui/Dialog'
import { ErrorNote, InfoNote, TextField } from '../../../../shared/ui/form'
import { EmptyState, ErrorState, PageSkeleton } from '../../../../shared/ui/states'
import { BankPrompt } from '../BankPrompt'
import { MediaImg } from '../../../../shared/media/MediaImg'
import { useManagedStore } from '../../../../storefront/features/stores/useManagedStore'
import type { Store } from '../../../../storefront/features/stores/storesApi'
import { SuppliersTabs } from './SuppliersTabs'
import { TruckIcon, UsersIcon, BoxIcon } from '../../../../storefront/layout/icons'
import {
  BigSwitch,
  PageHeader,
  WhatsAppShareLink,
  showToast,
} from '../../../../storefront/pages/stores/ui'
import { sellerSuppliersApi } from '../../api'
import type { Invite, InviteSent, ReturnFeePayer, SellerSupplier } from '../../api'
import { refreshDropshipRole } from '../../role'
import {
  ChoiceCard,
  InviteStatusBadge,
  LinkStatusBadge,
  Question,
  TermLine,
  TermsLog,
  codText,
  dayText,
  money,
  returnsText,
  shortDate,
  statusByText,
  useLoad,
  whatsappHref,
} from '../../ui'

/**
 * Store management → Suppliers. The seller invites a supplier (WhatsApp,
 * email or a copied link), sees who joined, and manages each one's terms:
 * cash on delivery and who pays the returned-parcel fee (D-5, D-17), pause
 * and end (D-19). Rules: docs/dropshipping/suppliers/context.md.
 */
export function SuppliersPage() {
  const { store, onStoreChange } = useManagedStore()
  const overview = useLoad(() => sellerSuppliersApi.overview(store.id), [store.id])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [sent, setSent] = useState<InviteSent | null>(null)
  const [termsFor, setTermsFor] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<Invite | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const data = overview.data
  const supplier = data?.suppliers.find((s) => s.linkId === termsFor) ?? null

  const resend = async (invite: Invite) => {
    setBusy(invite.id)
    try {
      setSent(await sellerSuppliersApi.resend(store.id, invite.id))
      overview.reload()
    } catch (err) {
      showToast(toApiError(err).message, 'danger')
    } finally {
      setBusy(null)
    }
  }

  const decide = async (supplier: SellerSupplier, status: 'ACTIVE' | 'ENDED') => {
    setBusy(supplier.linkId)
    try {
      await sellerSuppliersApi.update(store.id, supplier.linkId, { status })
      showToast(status === 'ACTIVE' ? `${supplier.store?.name ?? 'Supplier'} approved` : 'Request declined')
      refreshDropshipRole(store.slug)
      overview.reload()
    } catch (err) {
      showToast(toApiError(err).message, 'danger')
    } finally {
      setBusy(null)
    }
  }

  const revoke = async () => {
    if (!revoking) return
    setBusy(revoking.id)
    try {
      await sellerSuppliersApi.revoke(store.id, revoking.id)
      showToast('Invite cancelled — the link no longer works')
      overview.reload()
    } catch (err) {
      showToast(toApiError(err).message, 'danger')
    } finally {
      setBusy(null)
      setRevoking(null)
    }
  }

  const inviteButton = <Button onClick={() => setInviteOpen(true)}>Invite a supplier</Button>

  return (
    <div className="space-y-6">
      <PageHeader
        icon={UsersIcon}
        title="Suppliers"
        description="Sell products your suppliers ship straight to your customers. You set the price; you keep the difference."
        action={data && (data.suppliers.length > 0 || data.invites.length > 0) ? inviteButton : undefined}
      />
      <SuppliersTabs />
      <BankPrompt audience="seller" />

      {overview.loading && !data && <PageSkeleton label="Loading your suppliers" />}
      {overview.error && <ErrorState message={overview.error} onRetry={overview.reload} />}

      {data && data.suppliers.length === 0 && data.invites.length === 0 && (
        <EmptyState
          icon={UsersIcon}
          title="Invite your first supplier"
          description="Send your supplier a link on WhatsApp. They join, choose the products they'll supply and set a price for you."
          steps={[
            { icon: UsersIcon, label: 'Invite your supplier' },
            { icon: BoxIcon, label: 'They offer products' },
            { icon: TruckIcon, label: 'They ship your orders' },
          ]}
          action={inviteButton}
        />
      )}

      {data && data.suppliers.length > 0 && (
        <section aria-labelledby="your-suppliers">
          <h3 id="your-suppliers" className="mb-3 text-base font-semibold text-fg">
            Your suppliers
          </h3>
          <ul className="space-y-3">
            {data.suppliers.map((s) => (
              <SupplierRow
                key={s.linkId}
                supplier={s}
                busy={busy === s.linkId}
                onOpen={() => setTermsFor(s.linkId)}
                onDecide={(status) => decide(s, status)}
              />
            ))}
          </ul>
        </section>
      )}

      {data && data.invites.length > 0 && (
        <section aria-labelledby="invited">
          <h3 id="invited" className="mb-3 text-base font-semibold text-fg">
            Invited
          </h3>
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {data.invites.map((invite) => (
              <li key={invite.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-fg">{invite.name}</span>
                    <InviteStatusBadge status={invite.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {[invite.phone, invite.email].filter(Boolean).join(' · ')} ·{' '}
                    {invite.status === 'EXPIRED' ? 'Expired' : 'Link works until'}{' '}
                    {shortDate(invite.expiresAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={busy === invite.id}
                    onClick={() => resend(invite)}
                    className="flex-1 sm:flex-none"
                  >
                    {invite.status === 'EXPIRED' ? 'Send a new link' : 'Send again'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRevoking(invite)}
                    className="flex-1 sm:flex-none"
                  >
                    Cancel invite
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Sending again makes a new link — the old one stops working.
          </p>
        </section>
      )}

      <InviteSheet
        open={inviteOpen}
        store={store}
        onClose={() => setInviteOpen(false)}
        onSent={(result, codTurnedOn) => {
          setInviteOpen(false)
          setSent(result)
          if (codTurnedOn) onStoreChange({ ...store, payments: { ...store.payments, acceptCod: true } })
          refreshDropshipRole(store.slug)
          overview.reload()
        }}
      />

      <ShareSheet sent={sent} onClose={() => setSent(null)} />

      {supplier && (
        <TermsSheet
          store={store}
          supplier={supplier}
          onClose={() => setTermsFor(null)}
          onChanged={(codTurnedOn) => {
            if (codTurnedOn) onStoreChange({ ...store, payments: { ...store.payments, acceptCod: true } })
            overview.reload()
          }}
        />
      )}

      <ConfirmDialog
        open={revoking !== null}
        title="Cancel this invite?"
        description={`The link you sent ${revoking?.name ?? ''} will stop working. You can invite them again later.`}
        confirmLabel="Cancel invite"
        cancelLabel="Keep it"
        busy={busy === revoking?.id}
        onConfirm={revoke}
        onCancel={() => setRevoking(null)}
      />
    </div>
  )
}

function SupplierRow({
  supplier,
  busy,
  onOpen,
  onDecide,
}: {
  supplier: SellerSupplier
  busy: boolean
  onOpen: () => void
  onDecide: (status: 'ACTIVE' | 'ENDED') => void
}) {
  const name = supplier.store?.name ?? 'Supplier'
  const by = statusByText(supplier.statusBy, 'SELLER', name)
  const invited = supplier.invitedAs
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-alt text-muted">
          {supplier.store?.logoUrl ? (
            <MediaImg src={supplier.store.logoUrl} sizes="44px" alt="" className="h-full w-full object-cover" />
          ) : (
            <TruckIcon className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-fg">{name}</span>
            <LinkStatusBadge status={supplier.status} />
            {supplier.supplierStatus === 'SUSPENDED' && (
              <span className="text-xs font-medium text-danger">Paused by UnieMax</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {supplier.store?.phone && <>{supplier.store.phone} · </>}
            {supplier.status !== 'ACTIVE' && by ? `${supplier.status === 'PAUSED' ? 'Paused' : 'Ended'} ${by} · ` : ''}
            {codText(supplier.codAllowed)} · Ships within {dayText(supplier.profile.shipWithinDays)}
          </p>
          {supplier.status === 'PENDING' && invited && (
            <p className="mt-2 text-sm text-fg">
              You invited {invited.name} ({[invited.phone, invited.email].filter(Boolean).join(' · ')}), but {name} opened
              the link. Is this who you meant?
            </p>
          )}
        </div>
      </div>
      {supplier.status === 'PENDING' ? (
        <div className="flex gap-2">
          <Button size="sm" loading={busy} onClick={() => onDecide('ACTIVE')}>
            Yes, approve
          </Button>
          <Button variant="danger" size="sm" disabled={busy} onClick={() => onDecide('ENDED')}>
            No, decline
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Link to={`${supplier.linkId}/account`} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            Account
          </Link>
          <Button variant="secondary" size="sm" onClick={onOpen} className="sm:w-auto">
            Terms
          </Button>
        </div>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Invite
// ---------------------------------------------------------------------------

function InviteSheet({
  open,
  store,
  onClose,
  onSent,
}: {
  open: boolean
  store: Store
  onClose: () => void
  onSent: (result: InviteSent, codTurnedOn: boolean) => void
}) {
  const [step, setStep] = useState<'who' | 'terms'>('who')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [cod, setCod] = useState<boolean | null>(null)
  const [feePayer, setFeePayer] = useState<ReturnFeePayer | null>(null)
  const [storeCod, setStoreCod] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const needsStoreCod = cod === true && !store.payments.acceptCod

  const reset = () => {
    setStep('who')
    setName('')
    setPhone('')
    setEmail('')
    setCod(null)
    setFeePayer(null)
    setStoreCod(false)
    setErrors({})
    setError(null)
  }

  const continueToTerms = () => {
    const found: Record<string, string> = {}
    if (!name.trim()) found.name = "Enter the supplier's name"
    if (!phone.trim() && !email.trim()) found.phone = 'Enter a phone number or an email'
    if (phone.trim() && !/^\+?[0-9]{7,15}$/.test(phone.replace(/\s/g, ''))) found.phone = 'Enter a valid phone number'
    setErrors(found)
    if (Object.keys(found).length === 0) setStep('terms')
  }

  const submit = async () => {
    const next: Record<string, string> = {}
    if (cod === null) next.cod = 'Choose an answer'
    if (feePayer === null) next.feePayer = 'Choose an answer'
    if (needsStoreCod && !storeCod) {
      next.cod = 'Turn on cash on delivery for your shop below, or choose online payment only'
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setBusy(true)
    setError(null)
    try {
      const result = await sellerSuppliersApi.invite(store.id, {
        name: name.trim(),
        ...(phone.trim() ? { phone: phone.replace(/\s/g, '') } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
        codAllowed: cod!,
        returnFeePayer: feePayer!,
        ...(needsStoreCod ? { turnOnStoreCod: true } : {}),
      })
      onSent(result, needsStoreCod)
      reset()
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      title="Invite a supplier"
      subtitle={
        step === 'who'
          ? 'They get a link to join and offer you their products.'
          : `Two questions about ${name.trim()}'s products.`
      }
      onClose={onClose}
      footer={
        step === 'who' ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={continueToTerms}>Next</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setStep('who')}>
              Back
            </Button>
            <Button loading={busy} onClick={submit}>
              Create invite link
            </Button>
          </>
        )
      }
    >
      <div className="space-y-5">
        {step === 'who' && (
          <>
          <TextField
            label="Supplier's name *"
            placeholder="Sri Textiles"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            error={errors.name}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="WhatsApp number"
              placeholder="98765 43210"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              error={errors.phone}
            />
            <TextField
              label="Email (optional)"
              type="email"
              placeholder="supplier@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              hint="We'll email the link too."
            />
          </div>
          </>
        )}

        {step === 'terms' && (
          <>
          <Question
            legend="Can customers pay cash on delivery for this supplier's products?"
            error={errors.cod}
          >
            <ChoiceCard
              name="invite-cod"
              checked={cod === true}
              onSelect={() => setCod(true)}
              title="Yes"
              note="The supplier collects the cash through their courier."
            />
            <ChoiceCard
              name="invite-cod"
              checked={cod === false}
              onSelect={() => setCod(false)}
              title="No — online payment only"
            />
          </Question>
  
          {needsStoreCod && (
            <div className="rounded-md border border-line bg-surface-alt p-3">
              <p className="text-sm text-fg">Your shop doesn't accept cash on delivery yet.</p>
              <div className="mt-2">
                <BigSwitch
                  checked={storeCod}
                  onChange={setStoreCod}
                  label="Accept cash on delivery in my shop"
                  onText="Cash on delivery on"
                  offText="Cash on delivery off"
                />
              </div>
            </div>
          )}
  
          <Question
            legend="If a parcel comes back undelivered, who pays the supplier's shipping fee?"
            error={errors.feePayer}
          >
            <ChoiceCard
              name="invite-fee"
              checked={feePayer === 'SELLER'}
              onSelect={() => setFeePayer('SELLER')}
              title="I pay it"
            />
            <ChoiceCard
              name="invite-fee"
              checked={feePayer === 'SUPPLIER'}
              onSelect={() => setFeePayer('SUPPLIER')}
              title="The supplier bears it"
            />
          </Question>
          <p className="text-xs text-muted">You can change both answers later.</p>
          </>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Dialog>
  )
}

function ShareSheet({ sent, onClose }: { sent: InviteSent | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  if (!sent) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sent.inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('Copy failed — press and hold the link to copy it', 'danger')
    }
  }

  return (
    <Dialog
      open
      title={`Send the link to ${sent.invite.name}`}
      subtitle={`It works once, until ${shortDate(sent.invite.expiresAt)}.`}
      onClose={onClose}
    >
      <div className="space-y-3 pb-1">
        <WhatsAppShareLink href={whatsappHref(sent.shareText, sent.invite.phone)} />
        <Button variant="secondary" full onClick={copy}>
          {copied ? 'Link copied' : 'Copy link'}
        </Button>
        <p className="break-all rounded-md bg-surface-alt px-3 py-2 text-xs text-muted">
          {sent.inviteUrl}
        </p>
        {sent.emailed && sent.invite.email && (
          <InfoNote>We've also emailed it to {sent.invite.email}.</InfoNote>
        )}
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

function TermsSheet({
  store,
  supplier,
  onClose,
  onChanged,
}: {
  store: Store
  supplier: SellerSupplier
  onClose: () => void
  onChanged: (codTurnedOn: boolean) => void
}) {
  const name = supplier.store?.name ?? 'your supplier'
  const terms = useLoad(
    () => sellerSuppliersApi.terms(store.id, supplier.linkId),
    [store.id, supplier.linkId, supplier.codAllowed, supplier.returnFeePayer, supplier.status],
  )
  const [cod, setCod] = useState(supplier.codAllowed)
  const [feePayer, setFeePayer] = useState(supplier.returnFeePayer)
  const [storeCod, setStoreCod] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ended = supplier.status === 'ENDED'
  const dirty = cod !== supplier.codAllowed || feePayer !== supplier.returnFeePayer
  const needsStoreCod = cod && !supplier.codAllowed && !store.payments.acceptCod

  const save = async (patch: Parameters<typeof sellerSuppliersApi.update>[2], key: string) => {
    setBusy(key)
    setError(null)
    try {
      await sellerSuppliersApi.update(store.id, supplier.linkId, patch)
      onChanged(Boolean(patch.turnOnStoreCod))
      if (key === 'terms') showToast(`${name} has been told. Applies to orders placed from now on.`)
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(null)
      setConfirmEnd(false)
    }
  }

  const saveTerms = () => {
    if (needsStoreCod && !storeCod) {
      setError('Turn on cash on delivery for your shop, or keep online payment only')
      return
    }
    void save(
      {
        ...(cod !== supplier.codAllowed ? { codAllowed: cod } : {}),
        ...(feePayer !== supplier.returnFeePayer ? { returnFeePayer: feePayer } : {}),
        ...(needsStoreCod ? { turnOnStoreCod: true } : {}),
      },
      'terms',
    )
  }

  const current = terms.data?.current

  return (
    <Dialog
      open
      title={name}
      subtitle={
        <span className="inline-flex items-center gap-2">
          <LinkStatusBadge status={supplier.status} /> Your supplier since {shortDate(supplier.since)}
        </span>
      }
      onClose={onClose}
      footer={
        !ended && dirty ? (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setCod(supplier.codAllowed)
                setFeePayer(supplier.returnFeePayer)
              }}
            >
              Undo
            </Button>
            <Button loading={busy === 'terms'} onClick={saveTerms}>
              Save terms
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold text-fg">Your terms</h3>
          <p className="mb-3 text-xs text-muted">Changes apply to orders placed from now on.</p>
          <div className="space-y-4">
            <Question legend="Cash on delivery for this supplier's products">
              <ChoiceCard name="terms-cod" checked={cod} onSelect={() => setCod(true)} title="Allowed" disabled={ended} />
              <ChoiceCard name="terms-cod" checked={!cod} onSelect={() => setCod(false)} title="Online payment only" disabled={ended} />
            </Question>
            {needsStoreCod && (
              <div className="rounded-md border border-line bg-surface-alt p-3">
                <p className="text-sm text-fg">Your shop doesn't accept cash on delivery yet.</p>
                <div className="mt-2">
                  <BigSwitch
                    checked={storeCod}
                    onChange={setStoreCod}
                    label="Accept cash on delivery in my shop"
                    onText="Cash on delivery on"
                    offText="Cash on delivery off"
                  />
                </div>
              </div>
            )}
            <Question legend="If a parcel comes back, the supplier's shipping fee is paid by">
              <ChoiceCard name="terms-fee" checked={feePayer === 'SELLER'} onSelect={() => setFeePayer('SELLER')} title="You" disabled={ended} />
              <ChoiceCard name="terms-fee" checked={feePayer === 'SUPPLIER'} onSelect={() => setFeePayer('SUPPLIER')} title={name} disabled={ended} />
            </Question>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-fg">{name}'s terms</h3>
          <dl className="divide-y divide-line">
            <TermLine label="Shipping fee per order" value={money(current?.shippingFee ?? supplier.profile.shippingFee)} />
            <TermLine label="Ships within" value={dayText(current?.shipWithinDays ?? supplier.profile.shipWithinDays)} />
            <TermLine label="Returns" value={returnsText(current?.returnDays ?? supplier.profile.returnDays)} />
          </dl>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold text-fg">Changes</h3>
          {terms.loading && !terms.data && <p className="text-sm text-muted">Loading…</p>}
          {terms.error && <ErrorNote>{terms.error}</ErrorNote>}
          {terms.data && <TermsLog log={terms.data.log} viewer="seller" />}
        </section>

        {error && <ErrorNote>{error}</ErrorNote>}

        {!ended && (
          <section className="space-y-2 border-t border-line pt-4">
            {supplier.status === 'ACTIVE' && (
              <Button variant="secondary" full loading={busy === 'pause'} onClick={() => save({ status: 'PAUSED' }, 'pause')}>
                Pause — no new orders for now
              </Button>
            )}
            {supplier.status === 'PAUSED' && (
              <Button variant="secondary" full loading={busy === 'resume'} onClick={() => save({ status: 'ACTIVE' }, 'resume')}>
                Resume working together
              </Button>
            )}
            <Button variant="danger" full onClick={() => setConfirmEnd(true)}>
              Stop working with {name}
            </Button>
          </section>
        )}
        {ended && (
          <InfoNote>
            You no longer work with {name}. To work together again, send a new invite.
          </InfoNote>
        )}
      </div>

      <ConfirmDialog
        open={confirmEnd}
        title={`Stop working with ${name}?`}
        description="No new orders go to them. Orders already placed still complete, and your account with them stays. This can't be undone — you'd need a new invite."
        confirmLabel="Stop working together"
        busy={busy === 'end'}
        onConfirm={() => save({ status: 'ENDED' }, 'end')}
        onCancel={() => setConfirmEnd(false)}
      />
    </Dialog>
  )
}
