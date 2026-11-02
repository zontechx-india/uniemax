import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { ErrorNote, InfoNote, TextField } from '../../../shared/ui/form'
import {
  AddressFields,
  validateAddress,
} from '../../features/stores/AddressFields'
import type { AddressErrors } from '../../features/stores/AddressFields'
import { EMPTY_ADDRESS } from '../../features/stores/storeProfile'
import type { StoreAddress } from '../../features/stores/storeProfile'
import { storeBankApi, storesApi } from '../../features/stores/storesApi'
import type {
  BankAccountDetails,
  BankCheckOutcome,
  BankCheckStatus,
  BankHistoryEvent,
  BankSaveResult,
  Store,
  StoreBankAccount,
} from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import {
  BankIcon,
  CardIcon,
  CheckIcon,
  ClockIcon,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
  ShieldCheckIcon,
  StarIcon,
  TrashIcon,
} from '../../layout/icons'
import { Button, buttonClass } from '../../../shared/ui/Button'
import { ActionRow } from './ui/ActionRow'
import { EmptyState } from './ui/EmptyState'
import { GlassCard } from './ui/GlassCard'
import { HelpHint } from './ui/HelpHint'
import { PageHeader } from './ui/PageHeader'
import { StatusPill } from './ui/StatusPill'
import type { StatusTone } from './ui/StatusPill'
import { showToast } from './ui/Toast'
import { useGateBlockers } from './GateBlockers'
import { CodeCancelled, useBankCode } from './BankCodeDialog'

/**
 * Bank Accounts section of Store Management — the seller's payout accounts.
 * A store can save up to 5; exactly one is **primary**, and that account
 * alone receives payouts from UnieMax when customers pay through the
 * platform. Dropship suppliers use this same page and form.
 *
 * **Saving checks the account with the bank** (PaymentHub). The answer comes
 * back with the save, up to a minute later: Verified (with the name the bank
 * holds), Under review, Could not verify (edit and save again), Bank didn't
 * answer (check again later) or Unavailable (our side — never "invalid").
 *
 * **Every change but the first account needs a code** (`BankCodeDialog`),
 * sent to the seller's verified phone, else email — and they are emailed
 * after it. Changing a VERIFIED account does not touch it: the new details
 * wait beside it ("New details: under review") and payouts keep going to
 * the verified ones until the new details are verified. The full account
 * number is never shown again after saving — only the last 4 digits.
 *
 * **Adding an account needs the business address** — asked for **right
 * here**, as step 1 of adding the account, so a seller who came to add a
 * bank account is never sent to another page. The condition is
 * `store.readiness.gates.PAYOUT_SETUP`, the same evaluation
 * `POST /bank-accounts` enforces.
 *
 * The form asks in the order a seller holds the information — the name on
 * the account, then the **IFSC**, which looks the branch up
 * (`lookupIfsc`, Razorpay's public IFSC directory) and fills the bank name
 * and branch for them — then the account number twice.
 */

const MAX_ACCOUNTS = 5

/** The one payout requirement this page collects itself. */
const ADDRESS_KEY = 'address.business'

/** What a check's answer means, in the seller's words. */
function checkMessage(check: BankCheckOutcome | null): { text: string; tone: 'ok' | 'info' | 'error' } | null {
  if (!check) return null
  if (check.error && check.error.reason !== 'UNAVAILABLE') return { text: check.error.message, tone: 'error' }
  switch (check.status) {
    case 'VALID':
      return { text: 'Bank account verified.', tone: 'ok' }
    case 'NEEDS_REVIEW':
      return { text: 'We are checking your bank details. We will tell you when it is done.', tone: 'info' }
    case 'INVALID':
      return { text: "We couldn't verify this account. Check the account number and IFSC.", tone: 'error' }
    case 'RETRY_LATER':
      return { text: "Your bank didn't answer. Try again in a few minutes.", tone: 'info' }
    case 'UNAVAILABLE':
      return { text: 'Verification is unavailable right now. Your details are saved — try again later.', tone: 'info' }
    default:
      return null
  }
}

export function StoreBankPage() {
  const { store, onStoreChange, refreshStore } = useManagedStore()

  const [accounts, setAccounts] = useState<StoreBankAccount[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // 'new' → add form; an account id → that row's edit form.
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [result, setResult] = useState<ReturnType<typeof checkMessage>>(null)
  const [confirmDelete, setConfirmDelete] = useState<StoreBankAccount | null>(
    null,
  )
  const [history, setHistory] = useState<BankHistoryEvent[] | null>(null)
  const bankCode = useBankCode(store.id)

  useEffect(() => {
    let cancelled = false
    setAccounts(null)
    setLoadError(null)
    storeBankApi
      .list(store.id)
      .then((rows) => {
        if (!cancelled) setAccounts(rows)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(toApiError(err).message)
      })
    return () => {
      cancelled = true
    }
  }, [store.id])

  const loadHistory = () => {
    storeBankApi
      .history(store.id)
      .then(setHistory)
      .catch((err) => setActionError(toApiError(err).message))
  }

  const run = async (action: () => Promise<void>): Promise<boolean> => {
    setBusy(true)
    setActionError(null)
    setResult(null)
    try {
      await action()
      return true
    } catch (err) {
      if (!(err instanceof CodeCancelled)) setActionError(toApiError(err).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  /** Put the saved account in the list and say what the bank check found. */
  const applySaved = (saved: BankSaveResult) => {
    setAccounts((rows) => {
      const list = rows ?? []
      const merged = list.some((row) => row.id === saved.account.id)
        ? list.map((row) => (row.id === saved.account.id ? saved.account : row))
        : [...list, saved.account]
      // Only one main account: the saved one wins.
      return saved.account.isPrimary
        ? merged.map((row) => (row.id === saved.account.id ? row : { ...row, isPrimary: false }))
        : merged
    })
    const message = checkMessage(saved.check)
    setResult(message)
    showToast(message?.tone === 'ok' ? 'Saved and verified' : 'Saved')
    if (history) loadHistory()
  }

  // The store's readiness counts the main account (online payment needs
  // one), so every change that can move it re-fetches the store.
  const create = (input: BankAccountDetails) =>
    run(() =>
      bankCode.run(
        async (otp) => {
          const saved = await storeBankApi.create(store.id, { ...input, ...(otp ? { otp } : {}) })
          applySaved(saved)
          setEditing(null)
          refreshStore?.()
        },
        // The first account needs no code; any later one does.
        { needsCode: (accounts ?? []).length > 0 },
      ),
    )

  const update = (accountId: string, input: Partial<BankAccountDetails>) =>
    run(() =>
      bankCode.run(
        async (otp) => {
          const saved = await storeBankApi.update(store.id, accountId, { ...input, otp: otp ?? '' })
          applySaved(saved)
          setEditing(null)
        },
        { needsCode: true },
      ),
    )

  const setPrimary = (accountId: string) =>
    run(() =>
      bankCode.run(
        async (otp) => {
          applySaved(await storeBankApi.setPrimary(store.id, accountId, otp ?? ''))
          refreshStore?.()
        },
        { needsCode: true },
      ),
    )

  const recheck = (accountId: string) =>
    run(async () => {
      applySaved(await storeBankApi.recheck(store.id, accountId))
      refreshStore?.()
    })

  const discard = (accountId: string) =>
    run(async () => {
      const account = await storeBankApi.discardChange(store.id, accountId)
      setAccounts((rows) => (rows ?? []).map((row) => (row.id === account.id ? account : row)))
      showToast('New details removed')
      if (history) loadHistory()
    })

  const remove = async () => {
    if (!confirmDelete) return
    const target = confirmDelete
    const ok = await run(async () => {
      await storeBankApi.remove(store.id, target.id)
      setAccounts((rows) => (rows ?? []).filter((row) => row.id !== target.id))
      showToast('Deleted')
      refreshStore?.()
      if (history) loadHistory()
    })
    if (ok) setConfirmDelete(null)
  }

  const noPrimary =
    accounts !== null && accounts.length > 0 && !accounts.some((a) => a.isPrimary)
  const hasPrimary = (accounts ?? []).some((a) => a.isPrimary)

  // The address is asked for in the add flow itself (`AddressStep`); only a
  // requirement this page cannot ask for withholds adding and links out.
  const payoutBlockers = useGateBlockers(store, 'PAYOUT_SETUP')
  const needsAddress = payoutBlockers.some((b) => b.key === ADDRESS_KEY)
  const elsewhere = payoutBlockers.filter((b) => b.key !== ADDRESS_KEY)
  const addBlocked = elsewhere.length > 0

  return (
    <div className="space-y-4">
      <PageHeader
        icon={BankIcon}
        title="Bank account"
        description="Where UnieMax sends your money when customers pay online. Only your main account gets the money."
        action={
          accounts !== null &&
          accounts.length > 0 &&
          editing !== 'new' &&
          !addBlocked &&
          accounts.length < MAX_ACCOUNTS ? (
            <button
              type="button"
              onClick={() => setEditing('new')}
              disabled={busy}
              className={buttonClass({ size: 'lg' })}
            >
              <PlusIcon className="h-5 w-5" />
              Add another account
            </button>
          ) : undefined
        }
      />

      {accounts === null && !loadError && (
        <div aria-busy="true" aria-label="Loading bank accounts" className="glass-card h-28 animate-pulse rounded-glass" />
      )}
      {loadError && <ErrorNote>{loadError}</ErrorNote>}

      {/* Adding is withheld by something this page cannot ask for; this says
          what, and links to where it is filled in. */}
      {addBlocked && accounts !== null && (
        <div className="rounded-glass bg-pending-soft p-4">
          <p className="text-base font-semibold text-fg">First, add your business details</p>
          <p className="mt-0.5 text-hint text-muted">
            Before adding a bank account, add: {elsewhere.map((b) => b.label).join(', ')}.
          </p>
          <Link
            to={elsewhere[0]?.to ?? '../business'}
            className={buttonClass({ size: 'md', className: 'mt-3' })}
          >
            <ShieldCheckIcon className="h-4 w-4" />
            Go to Business details
          </Link>
        </div>
      )}

      {accounts !== null && accounts.length === 0 && editing !== 'new' && (
        <GlassCard>
          <EmptyState
            icon={BankIcon}
            title="No bank account yet"
            description={
              addBlocked
                ? 'Add your business details first, then add the account UnieMax should pay you into.'
                : 'Add your bank account so UnieMax can send you the money from online orders.'
            }
            action={
              !addBlocked ? (
                <button
                  type="button"
                  onClick={() => setEditing('new')}
                  disabled={busy}
                  className={buttonClass({ size: 'lg' })}
                >
                  <PlusIcon className="h-5 w-5" />
                  Add bank account
                </button>
              ) : undefined
            }
          />
        </GlassCard>
      )}

      {noPrimary && (
        <InfoNote>
          No main account is chosen — payments are on hold until you set one
          account as your main account.
        </InfoNote>
      )}

      {/* The step after this one: a seller who added an account to take
          online payments is one tap from the switch, not left to find it. */}
      {hasPrimary && !store.payments.acceptOnlinePayment && editing === null && (
        <div className="flex flex-col gap-3 rounded-xl bg-brand-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-fg">
            <span className="font-semibold">Your main account is ready.</span>{' '}
            Turn on online payments so customers can pay by UPI or card.
          </p>
          <Link
            to="../payments"
            className={buttonClass({
              variant: 'secondary',
              size: 'md',
              className: 'shrink-0 self-start sm:self-auto',
            })}
          >
            <CardIcon className="h-4 w-4" />
            Go to Payments
          </Link>
        </div>
      )}

      {result &&
        (result.tone === 'error' ? (
          <ErrorNote>{result.text}</ErrorNote>
        ) : (
          <InfoNote>{result.text}</InfoNote>
        ))}

      {(accounts ?? []).length > 0 && (
        <ul className="glass-card divide-y divide-line overflow-hidden rounded-glass">
          {(accounts ?? []).map((account) =>
            editing === account.id ? (
              <li key={account.id} className="p-3 sm:p-4">
                <AccountForm
                  initial={account}
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSubmit={(input) => void update(account.id, input)}
                />
              </li>
            ) : (
              <AccountRow
                key={account.id}
                account={account}
                busy={busy}
                onSetPrimary={() => void setPrimary(account.id)}
                onEdit={() => setEditing(account.id)}
                onDelete={() => setConfirmDelete(account)}
                onRecheck={() => void recheck(account.id)}
                onDiscard={() => void discard(account.id)}
              />
            ),
          )}
        </ul>
      )}

      {/* No address yet → it is step 1 of adding the account; saving it
          lifts the gate and this swaps to the account form by itself. */}
      {editing === 'new' &&
        (needsAddress ? (
          <AddressStep
            store={store}
            onSaved={onStoreChange}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <AccountForm
            busy={busy}
            onCancel={() => setEditing(null)}
            onSubmit={(input) => void create(input as BankAccountDetails)}
          />
        ))}

      {actionError && <ErrorNote>{actionError}</ErrorNote>}

      {(accounts ?? []).length > 0 && (
        <BankHistory history={history} onOpen={loadHistory} />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete this bank account?"
        description={
          confirmDelete?.isPrimary
            ? `This is your MAIN account (${confirmDelete.bankName} ····${confirmDelete.accountNumberLast4}). After deleting it, payments are on hold until you set another account as main.`
            : `${confirmDelete?.bankName ?? ''} ····${confirmDelete?.accountNumberLast4 ?? ''} will be removed.`
        }
        confirmLabel="Delete"
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(null)}
      />

      {bankCode.dialog}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

interface CheckView {
  label: string
  tone: StatusTone
  /** One line under the details. */
  note: string | null
  /** "Check again" makes sense (no answer yet / bank or service didn't answer). */
  canRecheck: boolean
}

/** A check status the seller reads (never the admin-only reason code). */
function pendingView(status: BankCheckStatus | null): CheckView {
  switch (status) {
    case 'NEEDS_REVIEW':
      return { label: 'Under review', tone: 'pending', note: 'We are checking your bank details.', canRecheck: false }
    case 'RETRY_LATER':
      return { label: "Bank didn't answer", tone: 'pending', note: 'Try again in a few minutes.', canRecheck: true }
    case 'UNAVAILABLE':
      return { label: 'Unavailable', tone: 'neutral', note: 'Verification is unavailable right now. Try again later.', canRecheck: true }
    case 'INVALID':
      return { label: 'Could not verify', tone: 'danger', note: 'Check the account number and IFSC, then save again.', canRecheck: false }
    case 'VALID':
      return { label: 'Verified', tone: 'success', note: null, canRecheck: false }
    default:
      return { label: 'Not checked yet', tone: 'pending', note: null, canRecheck: true }
  }
}

function accountView(account: StoreBankAccount): CheckView {
  if (account.verificationStatus === 'VERIFIED') {
    return {
      label: 'Verified',
      tone: 'success',
      note: account.checkRegisteredName ? `Name at bank: ${account.checkRegisteredName}` : null,
      canRecheck: false,
    }
  }
  if (account.verificationStatus === 'FAILED') {
    return {
      label: 'Could not verify',
      tone: 'danger',
      note: account.verificationNote ?? 'Check the account number and IFSC, then save again.',
      canRecheck: false,
    }
  }
  return pendingView(account.checkStatus)
}

function AccountRow({
  account,
  busy,
  onSetPrimary,
  onEdit,
  onDelete,
  onRecheck,
  onDiscard,
}: {
  account: StoreBankAccount
  busy: boolean
  onSetPrimary: () => void
  onEdit: () => void
  onDelete: () => void
  onRecheck: () => void
  onDiscard: () => void
}) {
  const view = accountView(account)
  const change = account.pendingChange
  const changeView = change ? pendingView(change.checkStatus) : null
  return (
    <li>
      <ActionRow
        leading={
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <BankIcon className="h-6 w-6" />
          </span>
        }
        title={`${account.bankName} ····${account.accountNumberLast4}`}
        status={
          <>
            {account.isPrimary && (
              <StatusPill tone="brand" dot={false}>
                <CheckIcon className="h-3 w-3" />
                Main account
              </StatusPill>
            )}
            <StatusPill tone={view.tone}>{view.label}</StatusPill>
          </>
        }
        meta={
          <>
            {account.accountHolderName} · {account.branch}
            <span className="block">
              IFSC {account.ifsc}
              {account.upiId && <> · UPI {account.upiId}</>}
            </span>
            {view.note && (
              <span className={`mt-1 block ${view.tone === 'danger' ? 'font-semibold text-danger' : ''}`}>
                {view.note}
              </span>
            )}
            {account.promoteWhenVerified && (
              <span className="mt-1 block">Becomes your main account once it is verified.</span>
            )}
            {change && changeView && (
              <span className="mt-2 block rounded-lg bg-pending-soft p-2 text-fg">
                <span className="block font-semibold">
                  New details: {change.bankName} ····{change.accountNumberLast4} — {changeView.label}
                </span>
                <span className="block text-muted">
                  {changeView.note ? `${changeView.note} ` : ''}
                  Payouts still go to ····{account.accountNumberLast4} until the new details are verified.
                </span>
              </span>
            )}
          </>
        }
        primary={
          (change ? changeView?.canRecheck : view.canRecheck) ? (
            <Button variant="secondary" size="md" className="px-4" onClick={onRecheck} disabled={busy}>
              <ClockIcon className="h-4 w-4" />
              {busy ? 'Checking…' : 'Check again'}
            </Button>
          ) : (
            <button
              type="button"
              onClick={onEdit}
              disabled={busy}
              className={buttonClass({ variant: 'secondary', size: 'md', className: 'px-4' })}
            >
              <PencilIcon className="h-4 w-4" />
              Edit
            </button>
          )
        }
        menu={[
          ...((change ? changeView?.canRecheck : view.canRecheck)
            ? [{ label: 'Edit details', icon: PencilIcon, disabled: busy, onSelect: onEdit }]
            : []),
          ...(change
            ? [
                {
                  label: 'Remove the new details',
                  icon: TrashIcon,
                  note: `Keep ····${account.accountNumberLast4}`,
                  disabled: busy,
                  onSelect: onDiscard,
                },
              ]
            : []),
          ...(!account.isPrimary && !account.promoteWhenVerified
            ? [
                {
                  label: 'Make this my main account',
                  icon: StarIcon,
                  note: 'Your money is sent to this account',
                  disabled: busy,
                  onSelect: onSetPrimary,
                },
              ]
            : []),
          {
            label: 'Delete account',
            icon: TrashIcon,
            danger: true,
            disabled: busy,
            onSelect: onDelete,
          },
        ]}
      />
    </li>
  )
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

const HISTORY_LABEL: Record<BankHistoryEvent['action'], string> = {
  ACCOUNT_ADDED: 'Account added',
  DETAILS_CHANGED: 'Details changed',
  CHANGE_REQUESTED: 'New details sent for checking',
  CHANGE_APPLIED: 'New details verified and now in use',
  CHANGE_DISCARDED: 'New details removed',
  PRIMARY_CHANGED: 'Made the main account',
  PRIMARY_QUEUED: 'Will be the main account once verified',
  ACCOUNT_DELETED: 'Account deleted',
  CHECK_RESULT: 'Bank check',
  MANUAL_VERIFIED: 'Verified by UnieMax',
  MANUAL_FAILED: 'Marked failed by UnieMax',
  MANUAL_RESET: 'Verification reset by UnieMax',
}

const ACTOR_LABEL: Record<BankHistoryEvent['actor'], string> = {
  SELLER: 'You',
  ADMIN: 'UnieMax',
  SYSTEM: 'Automatic',
}

/** Who changed which account and when — opened on demand. */
function BankHistory({ history, onOpen }: { history: BankHistoryEvent[] | null; onOpen: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <GlassCard icon={ClockIcon} title="Change history" description="Every change to your bank accounts, newest first.">
      {!open ? (
        <Button
          variant="secondary"
          size="md"
          onClick={() => {
            setOpen(true)
            onOpen()
          }}
        >
          Show history
        </Button>
      ) : history === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : history.length === 0 ? (
        <p className="text-sm text-muted">No changes yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {history.map((event) => (
            <li key={event.id} className="py-2 text-sm">
              <span className="font-semibold text-fg">
                {HISTORY_LABEL[event.action]}
                {event.action === 'CHECK_RESULT' && event.checkStatus
                  ? `: ${pendingView(event.checkStatus).label}`
                  : ''}
              </span>
              <span className="block text-muted">
                {event.details ? `${event.details.bankName} ····${event.details.last4} · ` : ''}
                {ACTOR_LABEL[event.actor]} · {new Date(event.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  )
}

// ---------------------------------------------------------------------------
// Step 1 of adding, when the store has no business address yet
// ---------------------------------------------------------------------------

/**
 * The business address, asked for in place: it is the one detail the server
 * needs before a payout account, and sending the seller to Business details
 * for it — then expecting them to find their way back — is the detour this
 * page exists to avoid. It saves to the same profile field that page edits.
 */
function AddressStep({
  store,
  onSaved,
  onCancel,
}: {
  store: Store
  onSaved: (store: Store) => void
  onCancel: () => void
}) {
  const [address, setAddress] = useState<StoreAddress>(EMPTY_ADDRESS)
  const [errors, setErrors] = useState<AddressErrors>({})
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const found = validateAddress(address)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      return setProblem('Please complete the highlighted fields.')
    }
    setProblem(null)
    setBusy(true)
    try {
      // The fresh store lifts the gate, which swaps this step for the
      // account form — no extra navigation.
      onSaved(await storesApi.updateProfile(store.id, { address }))
      showToast('Address saved')
    } catch (err) {
      setProblem(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <GlassCard
        icon={MapPinIcon}
        title="Your business address"
        description="Needed once, before your first bank account."
        aside={
          <StatusPill tone="brand" dot={false}>
            Step 1 of 2
          </StatusPill>
        }
      >
        <div className="space-y-4">
          <AddressFields
            value={address}
            onChange={setAddress}
            errors={errors}
            disabled={busy}
            idPrefix="payout-address"
          />
          {problem && <ErrorNote>{problem}</ErrorNote>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="secondary" size="lg" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" size="lg" loading={busy} className="sm:px-8">
              {busy ? 'Saving…' : 'Save and continue'}
            </Button>
          </div>
        </div>
      </GlassCard>
    </form>
  )
}


// ---------------------------------------------------------------------------
// Add / edit form
// ---------------------------------------------------------------------------

interface AccountDraft {
  accountHolderName: string
  accountNumber: string
  confirmAccountNumber: string
  ifsc: string
  bankName: string
  branch: string
  upiId: string
  phone: string
}

/** The bank check's name rule — so the seller fixes it before a paid check. */
const HOLDER_NAME = /^[A-Za-z0-9 .\-/&]+$/

/**
 * Also used in place by the dropship package's bank prompt (a supplier adds
 * its payout account without leaving its page). Editing never shows the full
 * account number: both number fields start empty, and empty means "keep
 * ····1234" — the submitted patch then leaves it out.
 */
export function AccountForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: StoreBankAccount
  busy: boolean
  onSubmit: (input: Partial<BankAccountDetails>) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<AccountDraft>({
    accountHolderName: initial?.accountHolderName ?? '',
    accountNumber: '',
    confirmAccountNumber: '',
    ifsc: initial?.ifsc ?? '',
    bankName: initial?.bankName ?? '',
    branch: initial?.branch ?? '',
    upiId: initial?.upiId ?? '',
    phone: initial?.phone ?? '',
  })
  const [problem, setProblem] = useState<string | null>(null)
  // What the last lookup filled in, so a newer lookup may replace it — but
  // never anything the seller typed themselves.
  const autoFilled = useRef<{ bank: string; branch: string }>({ bank: '', branch: '' })
  const ifscLookup = useIfscLookup(draft.ifsc, (found) => {
    const previous = autoFilled.current
    autoFilled.current = found
    setDraft((d) => ({
      ...d,
      bankName: !d.bankName.trim() || previous.bank === d.bankName ? found.bank : d.bankName,
      branch: !d.branch.trim() || previous.branch === d.branch ? found.branch : d.branch,
    }))
  })

  const set = <K extends keyof AccountDraft>(key: K, value: AccountDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const keepNumber = initial !== undefined && draft.accountNumber === '' && draft.confirmAccountNumber === ''

  const changesVerified =
    initial !== undefined &&
    initial.verificationStatus === 'VERIFIED' &&
    (draft.accountHolderName.trim() !== initial.accountHolderName ||
      !keepNumber ||
      draft.ifsc.trim().toUpperCase() !== initial.ifsc ||
      draft.bankName.trim() !== initial.bankName ||
      draft.branch.trim() !== initial.branch ||
      (draft.upiId.trim() || null) !== initial.upiId ||
      (draft.phone.replace(/\s/g, '') || null) !== initial.phone)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const name = draft.accountHolderName.trim()
    if (!name) return setProblem('Type the name on the bank account.')
    if (!HOLDER_NAME.test(name)) {
      return setProblem('Type the name in English letters, as printed on your passbook. Only . - / & are allowed besides letters and numbers.')
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(draft.ifsc.trim().toUpperCase())) {
      return setProblem('The branch code (IFSC) has 11 letters and numbers, like SBIN0001234. The fifth one is always a zero.')
    }
    if (!draft.bankName.trim()) return setProblem('Type the bank name.')
    if (!draft.branch.trim()) return setProblem('Type the branch name.')
    if (!keepNumber) {
      if (!/^\d{9,18}$/.test(draft.accountNumber.trim())) {
        return setProblem('The account number has 9 to 18 numbers.')
      }
      if (draft.confirmAccountNumber.trim() !== draft.accountNumber.trim()) {
        return setProblem('The two account numbers are not the same. Please check them.')
      }
    }
    const upi = draft.upiId.trim()
    if (upi && !/^[\w.-]{2,}@[a-zA-Z]{2,64}$/.test(upi)) {
      return setProblem('A UPI ID looks like name@okaxis.')
    }
    const phone = draft.phone.replace(/\s/g, '')
    if (phone && !/^\+?\d{8,13}$/.test(phone)) {
      return setProblem('The phone number has 10 numbers, like 9876543210.')
    }
    setProblem(null)
    onSubmit({
      accountHolderName: name,
      ...(keepNumber ? {} : { accountNumber: draft.accountNumber.trim() }),
      ifsc: draft.ifsc.trim().toUpperCase(),
      bankName: draft.bankName.trim(),
      branch: draft.branch.trim(),
      upiId: upi || null,
      phone: phone || null,
    })
  }

  const mismatch =
    draft.confirmAccountNumber !== '' &&
    draft.accountNumber !== '' &&
    !draft.accountNumber.startsWith(draft.confirmAccountNumber)

  return (
    <form onSubmit={submit} noValidate>
      <GlassCard
        icon={BankIcon}
        title={initial ? 'Change bank account' : 'Add bank account'}
        description="Copy the details from your passbook or cheque book."
      >
        <div className="space-y-4">
          <TextField
            label="Name on the bank account"
            value={draft.accountHolderName}
            onChange={(e) => set('accountHolderName', e.target.value)}
            placeholder="Exactly as the bank has it"
            hint="As printed on the first page of your passbook or on your cheque, in English."
            maxLength={100}
            autoComplete="name"
          />

          <TextField
            label={
              <>
                Bank branch code (IFSC){' '}
                <HelpHint topic="Bank branch code (IFSC)">
                  <p>
                    IFSC is an 11-letter code for your bank branch, like{' '}
                    <span className="font-semibold">SBIN0001234</span>. The
                    fifth letter is always a zero.
                  </p>
                  <p>
                    You can find it on your cheque book (near your account
                    number), on the first page of your passbook, or in your
                    bank’s mobile app.
                  </p>
                  <p>Type it here and we fill in the bank and branch for you.</p>
                </HelpHint>
              </>
            }
            value={draft.ifsc}
            onChange={(e) => set('ifsc', e.target.value.toUpperCase().replace(/\s/g, ''))}
            placeholder="SBIN0001234"
            maxLength={11}
            autoCapitalize="characters"
            className="uppercase"
            hint={
              ifscLookup.state === 'found'
                ? `✓ ${ifscLookup.bank}, ${ifscLookup.branch}`
                : ifscLookup.state === 'loading'
                  ? 'Finding your branch…'
                  : ifscLookup.state === 'notFound'
                    ? 'We could not find this code — check it, or type the bank and branch yourself.'
                    : '11 letters and numbers, printed on your cheque book or passbook.'
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Bank name"
              value={draft.bankName}
              onChange={(e) => set('bankName', e.target.value)}
              placeholder="State Bank of India"
              maxLength={100}
            />
            <TextField
              label="Branch"
              value={draft.branch}
              onChange={(e) => set('branch', e.target.value)}
              placeholder="MG Road, Kochi"
              maxLength={100}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Account number"
              value={draft.accountNumber}
              onChange={(e) => set('accountNumber', e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              maxLength={18}
              placeholder={initial ? `····${initial.accountNumberLast4}` : undefined}
              hint={initial ? `Leave empty to keep ····${initial.accountNumberLast4}.` : 'Only numbers — 9 to 18 of them.'}
            />
            <TextField
              label="Type the account number again"
              value={draft.confirmAccountNumber}
              onChange={(e) => set('confirmAccountNumber', e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              maxLength={18}
              error={mismatch ? 'This is not the same as the number above.' : undefined}
              hint={
                draft.confirmAccountNumber && draft.confirmAccountNumber === draft.accountNumber
                  ? '✓ Both numbers match.'
                  : 'So we know it is typed right.'
              }
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={
                <>
                  UPI ID (optional){' '}
                  <HelpHint topic="UPI ID">
                    <p>
                      Your UPI ID is the address you receive money on in apps
                      like Google Pay, PhonePe or Paytm. It looks like{' '}
                      <span className="font-semibold">name@okaxis</span>.
                    </p>
                    <p>Open your UPI app and look at your profile to find it. You can skip this.</p>
                  </HelpHint>
                </>
              }
              value={draft.upiId}
              onChange={(e) => set('upiId', e.target.value)}
              placeholder="name@okaxis"
              maxLength={256}
              autoCapitalize="none"
            />
            <TextField
              label="Phone linked to the account (optional)"
              value={draft.phone}
              onChange={(e) => set('phone', e.target.value.replace(/[^\d+ ]/g, ''))}
              inputMode="tel"
              maxLength={16}
              placeholder="9876543210"
              hint="Helps the bank check. You can skip this."
            />
          </div>

          {changesVerified && (
            <InfoNote>
              This account is verified. Your new details are checked with the
              bank first — until they are verified, payouts keep going to
              ····{initial?.accountNumberLast4}.
            </InfoNote>
          )}
          {!initial || initial.verificationStatus !== 'VERIFIED' ? (
            <p className="text-sm text-muted">
              When you save, we check this account with your bank. It can take up to a minute.
            </p>
          ) : null}
          {problem && <ErrorNote>{problem}</ErrorNote>}

          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className={buttonClass({ variant: 'secondary', size: 'lg' })}
            >
              Cancel
            </button>
            <Button type="submit" size="lg" loading={busy} className="sm:px-8">
              {busy ? 'Checking with your bank…' : initial ? 'Save changes' : 'Add this account'}
            </Button>
          </div>
        </div>
      </GlassCard>
    </form>
  )
}

/**
 * IFSC → bank and branch, from Razorpay's public IFSC directory
 * (ifsc.razorpay.com — open data, CORS-enabled, no key). An IFSC is a public
 * branch code, so nothing private leaves the browser. Fires once the code
 * has the valid 11-character shape; a failure just leaves the fields for
 * the seller to type — the lookup only ever helps.
 */
type IfscState =
  | { state: 'idle' | 'loading' | 'notFound' }
  | { state: 'found'; bank: string; branch: string }

function useIfscLookup(
  ifsc: string,
  onFound: (found: { bank: string; branch: string }) => void,
): IfscState {
  const [result, setResult] = useState<IfscState>({ state: 'idle' })
  const onFoundRef = useRef(onFound)
  useEffect(() => {
    onFoundRef.current = onFound
  })

  const code = ifsc.trim().toUpperCase()
  const valid = /^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)

  useEffect(() => {
    if (!valid) return
    let cancelled = false
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setResult({ state: 'loading' })
      fetch(`https://ifsc.razorpay.com/${code}`, { signal: controller.signal })
        .then((res) => (res.ok ? (res.json() as Promise<{ BANK?: string; BRANCH?: string; CITY?: string }>) : null))
        .then((data) => {
          if (cancelled) return
          if (!data?.BANK) return setResult({ state: 'notFound' })
          const branch = [data.BRANCH, data.CITY]
            .filter(Boolean)
            .map((part) => titleCase(part!))
            .filter((part, i, all) => all.indexOf(part) === i)
            .join(', ')
          const found = { bank: data.BANK, branch }
          setResult({ state: 'found', ...found })
          onFoundRef.current(found)
        })
        .catch(() => {
          if (!cancelled) setResult({ state: 'idle' })
        })
    }, 300)
    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [code, valid])

  return valid ? result : { state: 'idle' }
}

/** "MG ROAD" → "Mg Road" reads as a place, not a shout. */
function titleCase(text: string): string {
  return text.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase())
}
