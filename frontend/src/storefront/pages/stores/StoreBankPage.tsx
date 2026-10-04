import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { ErrorNote, InfoNote, TextField } from '../../../shared/ui/form'
import { storeBankApi } from '../../features/stores/storesApi'
import type {
  BankAccountDetails,
  StoreBankAccount,
} from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import {
  BankIcon,
  CheckIcon,
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

/**
 * Bank Accounts section of Store Management — the seller's payout accounts.
 * A store can save up to 5; exactly one is **primary**, and that account
 * alone receives payouts from UnieMax when customers pay through the
 * platform. Every account carries a verification status: it starts
 * "Pending verification" and will be checked by a third-party validator or
 * manually by a UnieMax admin (admin panel is a future module — the status
 * fields are provisioned now). Editing a verified account's bank details
 * resets it to pending.
 *
 * **Adding an account is gated.** The business address and tax details are
 * no longer asked for at signup — they were the two steps sellers abandoned
 * the wizard on — so this is where they become mandatory: a payout account
 * is the first thing that needs to know who is being paid and where. The
 * condition is `store.readiness.gates.PAYOUT_SETUP`, the same evaluation
 * `POST /bank-accounts` enforces, so the button is hidden for exactly the
 * reasons a save would be rejected. Editing, re-prioritising and deleting
 * existing accounts are never gated.
 *
 * The form asks in the order a seller holds the information — the name on
 * the account, then the **IFSC**, which looks the branch up
 * (`lookupIfsc`, Razorpay's public IFSC directory) and fills the bank name
 * and branch for them — then the account number twice. Each technical field
 * has a one-line "where do I find this" hint and an ⓘ sheet.
 */

const MAX_ACCOUNTS = 5

export function StoreBankPage() {
  const { store } = useManagedStore()

  const [accounts, setAccounts] = useState<StoreBankAccount[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // 'new' → add form; an account id → that row's edit form.
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<StoreBankAccount | null>(
    null,
  )

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

  const run = async (action: () => Promise<void>): Promise<boolean> => {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      showToast('Saved')
      return true
    } catch (err) {
      setActionError(toApiError(err).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const create = (input: BankAccountDetails) =>
    run(async () => {
      const account = await storeBankApi.create(store.id, input)
      setAccounts((rows) => [
        ...(rows ?? []).map((row) =>
          account.isPrimary ? { ...row, isPrimary: false } : row,
        ),
        account,
      ])
      setEditing(null)
    })

  const update = (accountId: string, input: BankAccountDetails) =>
    run(async () => {
      const account = await storeBankApi.update(store.id, accountId, input)
      setAccounts((rows) =>
        (rows ?? []).map((row) => (row.id === account.id ? account : row)),
      )
      setEditing(null)
    })

  const setPrimary = (accountId: string) =>
    run(async () => {
      const account = await storeBankApi.setPrimary(store.id, accountId)
      setAccounts((rows) =>
        (rows ?? []).map((row) =>
          row.id === account.id ? account : { ...row, isPrimary: false },
        ),
      )
    })

  const remove = async () => {
    if (!confirmDelete) return
    const target = confirmDelete
    const ok = await run(async () => {
      await storeBankApi.remove(store.id, target.id)
      setAccounts((rows) => (rows ?? []).filter((row) => row.id !== target.id))
    })
    if (ok) setConfirmDelete(null)
  }

  const noPrimary =
    accounts !== null && accounts.length > 0 && !accounts.some((a) => a.isPrimary)

  const payoutGate = store.readiness.gates.PAYOUT_SETUP
  const addBlocked = !payoutGate.allowed

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

      {/* Adding is withheld; this says why, and where every missing piece
          is filled in. */}
      {addBlocked && accounts !== null && (
        <div className="rounded-glass bg-pending-soft p-4">
          <p className="text-[15px] font-semibold text-fg">First, add your business details</p>
          <p className="mt-0.5 text-hint text-muted">
            Before adding a bank account, add: {payoutGate.blockers.join(', ')}.
          </p>
          <Link to="../business" className={buttonClass({ size: 'md', className: 'mt-3' })}>
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
              />
            ),
          )}
        </ul>
      )}

      {editing === 'new' && (
        <AccountForm
          busy={busy}
          onCancel={() => setEditing(null)}
          onSubmit={(input) => void create(input)}
        />
      )}

      {actionError && <ErrorNote>{actionError}</ErrorNote>}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete this bank account?"
        description={
          confirmDelete?.isPrimary
            ? `This is your MAIN account (${confirmDelete.bankName} ····${confirmDelete.accountNumber.slice(-4)}). After deleting it, payments are on hold until you set another account as main.`
            : `${confirmDelete?.bankName ?? ''} ····${confirmDelete?.accountNumber.slice(-4) ?? ''} will be removed.`
        }
        confirmLabel="Delete"
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

const STATUS_META: Record<StoreBankAccount['verificationStatus'], { label: string; tone: StatusTone }> = {
  PENDING: { label: 'Being checked', tone: 'pending' },
  VERIFIED: { label: 'Verified', tone: 'success' },
  FAILED: { label: 'Check failed', tone: 'danger' },
}

function AccountRow({
  account,
  busy,
  onSetPrimary,
  onEdit,
  onDelete,
}: {
  account: StoreBankAccount
  busy: boolean
  onSetPrimary: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const status = STATUS_META[account.verificationStatus]
  return (
    <li>
      <ActionRow
        leading={
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <BankIcon className="h-6 w-6" />
          </span>
        }
        title={`${account.bankName} ····${account.accountNumber.slice(-4)}`}
        status={
          <>
            {account.isPrimary && (
              <StatusPill tone="brand" dot={false}>
                <CheckIcon className="h-3 w-3" />
                Main account
              </StatusPill>
            )}
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
          </>
        }
        meta={
          <>
            {account.accountHolderName} · {account.branch}
            <span className="block">
              IFSC {account.ifsc}
              {account.upiId && <> · UPI {account.upiId}</>}
            </span>
            {account.verificationStatus === 'FAILED' && account.verificationNote && (
              <span className="mt-1 block font-semibold text-danger">{account.verificationNote}</span>
            )}
          </>
        }
        primary={
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            className={buttonClass({ variant: 'ring', size: 'md', className: 'px-4' })}
          >
            <PencilIcon className="h-4 w-4" />
            Edit
          </button>
        }
        menu={[
          ...(!account.isPrimary
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
}

function AccountForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: StoreBankAccount
  busy: boolean
  onSubmit: (input: BankAccountDetails) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<AccountDraft>({
    accountHolderName: initial?.accountHolderName ?? '',
    accountNumber: initial?.accountNumber ?? '',
    confirmAccountNumber: initial?.accountNumber ?? '',
    ifsc: initial?.ifsc ?? '',
    bankName: initial?.bankName ?? '',
    branch: initial?.branch ?? '',
    upiId: initial?.upiId ?? '',
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

  const willResetVerification =
    initial !== undefined &&
    initial.verificationStatus === 'VERIFIED' &&
    (draft.accountHolderName.trim() !== initial.accountHolderName ||
      draft.accountNumber.trim() !== initial.accountNumber ||
      draft.ifsc.trim().toUpperCase() !== initial.ifsc ||
      draft.bankName.trim() !== initial.bankName ||
      draft.branch.trim() !== initial.branch ||
      (draft.upiId.trim() || null) !== initial.upiId)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!draft.accountHolderName.trim()) {
      return setProblem('Type the name on the bank account.')
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(draft.ifsc.trim().toUpperCase())) {
      return setProblem('The branch code (IFSC) has 11 letters and numbers, like SBIN0001234.')
    }
    if (!draft.bankName.trim()) return setProblem('Type the bank name.')
    if (!draft.branch.trim()) return setProblem('Type the branch name.')
    if (!/^\d{9,18}$/.test(draft.accountNumber.trim())) {
      return setProblem('The account number has 9 to 18 numbers.')
    }
    if (draft.confirmAccountNumber.trim() !== draft.accountNumber.trim()) {
      return setProblem('The two account numbers are not the same. Please check them.')
    }
    const upi = draft.upiId.trim()
    if (upi && !/^[\w.-]{2,}@[a-zA-Z]{2,64}$/.test(upi)) {
      return setProblem('A UPI ID looks like name@okaxis.')
    }
    setProblem(null)
    onSubmit({
      accountHolderName: draft.accountHolderName.trim(),
      accountNumber: draft.accountNumber.trim(),
      ifsc: draft.ifsc.trim().toUpperCase(),
      bankName: draft.bankName.trim(),
      branch: draft.branch.trim(),
      upiId: upi || null,
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
            hint="Printed on the first page of your passbook."
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
              hint="Only numbers — 9 to 18 of them."
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

          {willResetVerification && (
            <InfoNote>
              You changed the details of a verified account — after saving, it
              is checked again before money is sent to it.
            </InfoNote>
          )}
          {problem && <ErrorNote>{problem}</ErrorNote>}

          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className={buttonClass({ variant: 'ring', size: 'lg' })}
            >
              Cancel
            </button>
            <Button type="submit" size="lg" loading={busy} className="sm:px-8">
              {busy ? 'Saving…' : initial ? 'Save changes' : 'Add this account'}
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
