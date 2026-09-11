import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { ErrorNote, InfoNote, SuccessNote, TextField } from '../../../shared/ui/form'
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
  TrashIcon,
} from '../../layout/icons'

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
  const [saved, setSaved] = useState(false)
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
    setSaved(false)
    try {
      await action()
      setSaved(true)
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
    <div>
      <h2 className="font-body text-xl font-semibold tracking-normal text-fg">
        Bank Accounts
      </h2>
      <p className="mt-1 text-sm text-muted">
        Where UnieMax sends your payouts when customers pay through the
        platform. Only the <span className="font-semibold text-fg">primary</span>{' '}
        account receives payouts. New and edited accounts are verified before
        payouts are released.
      </p>

      <div className="mt-5 max-w-2xl space-y-3">
        {accounts === null && !loadError && (
          <p className="py-8 text-center text-sm text-muted">
            Loading bank accounts…
          </p>
        )}
        {loadError && <ErrorNote>{loadError}</ErrorNote>}

        {accounts !== null && accounts.length === 0 && editing !== 'new' && (
          <div className="flex flex-col items-center rounded-lg border border-line px-6 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-brand/10 text-brand">
              <BankIcon className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-semibold text-fg">
              No bank account yet
            </p>
            <p className="mt-1 max-w-sm text-sm text-muted">
              {addBlocked
                ? 'Complete your business address and tax details first, then add the account UnieMax should pay you into.'
                : 'Add your payout account so UnieMax can transfer your sales earnings to you.'}
            </p>
          </div>
        )}

        {/* The Add button below is withheld; this says why, and links to the
            one page where every missing piece is filled in. */}
        {addBlocked && accounts !== null && (
          <InfoNote>
            Before you can add a bank account, add:{' '}
            {payoutGate.blockers.join(', ')}. You'll find these under{' '}
            <Link
              to="../business"
              className="font-semibold text-brand hover:underline"
            >
              Business Details
            </Link>
            .
          </InfoNote>
        )}

        {noPrimary && (
          <InfoNote>
            No primary account selected — payouts are on hold until you mark
            one account as primary.
          </InfoNote>
        )}

        <ul className="space-y-2">
          {(accounts ?? []).map((account) =>
            editing === account.id ? (
              <li key={account.id}>
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

        {editing === 'new' ? (
          <AccountForm
            busy={busy}
            onCancel={() => setEditing(null)}
            onSubmit={(input) => void create(input)}
          />
        ) : (
          accounts !== null &&
          !addBlocked &&
          accounts.length < MAX_ACCOUNTS && (
            <button
              type="button"
              onClick={() => setEditing('new')}
              disabled={busy}
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-line bg-surface px-4 text-sm font-semibold text-fg transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-muted"
            >
              <PlusIcon className="h-4 w-4" />
              Add Bank Account
            </button>
          )
        )}

        {actionError && <ErrorNote>{actionError}</ErrorNote>}
        {saved && !editing && <SuccessNote>Bank accounts updated.</SuccessNote>}
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete this bank account?"
        description={
          confirmDelete?.isPrimary
            ? `This is your PRIMARY payout account (${confirmDelete.bankName} ····${confirmDelete.accountNumber.slice(-4)}). After deleting it, payouts stay on hold until you mark another account as primary.`
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

const STATUS_META = {
  PENDING: { label: 'Pending verification', className: 'bg-warning/10 text-warning' },
  VERIFIED: { label: 'Verified', className: 'bg-success/10 text-success' },
  FAILED: { label: 'Verification failed', className: 'bg-danger/10 text-danger' },
} as const

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
    <li className="rounded-lg border border-line p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
          <BankIcon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
            {account.bankName}
            <span className="font-normal text-muted">
              ····{account.accountNumber.slice(-4)}
            </span>
            {account.isPrimary && (
              <span className="inline-flex items-center gap-1 rounded-pill bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
                <CheckIcon className="h-3 w-3" />
                Primary
              </span>
            )}
            <span
              className={`rounded-pill px-2 py-0.5 text-[11px] font-semibold ${status.className}`}
            >
              {status.label}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {account.accountHolderName} · {account.ifsc} · {account.branch}
            {account.upiId && <> · UPI: {account.upiId}</>}
          </p>
          {account.verificationStatus === 'FAILED' && account.verificationNote && (
            <p className="mt-1 text-xs font-semibold text-danger">
              {account.verificationNote}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!account.isPrimary && (
            <button
              type="button"
              onClick={onSetPrimary}
              disabled={busy}
              className="rounded-md px-2 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-alt hover:text-fg disabled:cursor-not-allowed"
            >
              Set primary
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            aria-label="Edit bank account"
            className="rounded-md p-1.5 text-muted transition hover:bg-surface-alt hover:text-fg disabled:cursor-not-allowed"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            aria-label="Delete bank account"
            className="rounded-md p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
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
      return setProblem('Account holder name is required.')
    }
    if (!/^\d{9,18}$/.test(draft.accountNumber.trim())) {
      return setProblem('Account number must be 9–18 digits.')
    }
    if (draft.confirmAccountNumber.trim() !== draft.accountNumber.trim()) {
      return setProblem('Account numbers do not match.')
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(draft.ifsc.trim().toUpperCase())) {
      return setProblem('IFSC must look like HDFC0001234 (11 characters).')
    }
    if (!draft.bankName.trim()) return setProblem('Bank name is required.')
    if (!draft.branch.trim()) return setProblem('Branch is required.')
    const upi = draft.upiId.trim()
    if (upi && !/^[\w.-]{2,}@[a-zA-Z]{2,64}$/.test(upi)) {
      return setProblem('UPI ID must look like name@bank.')
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

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-4 rounded-md border border-accent/40 bg-surface-alt/50 p-4"
    >
      <TextField
        label="Account holder name"
        value={draft.accountHolderName}
        onChange={(e) => set('accountHolderName', e.target.value)}
        placeholder="As per your bank records"
        maxLength={100}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Account number"
          value={draft.accountNumber}
          onChange={(e) => set('accountNumber', e.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          maxLength={18}
        />
        <TextField
          label="Confirm account number"
          value={draft.confirmAccountNumber}
          onChange={(e) =>
            set('confirmAccountNumber', e.target.value.replace(/\D/g, ''))
          }
          inputMode="numeric"
          maxLength={18}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="IFSC"
          value={draft.ifsc}
          onChange={(e) => set('ifsc', e.target.value.toUpperCase())}
          placeholder="HDFC0001234"
          maxLength={11}
          className="uppercase"
        />
        <TextField
          label="Bank name"
          value={draft.bankName}
          onChange={(e) => set('bankName', e.target.value)}
          placeholder="HDFC Bank"
          maxLength={100}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Branch"
          value={draft.branch}
          onChange={(e) => set('branch', e.target.value)}
          placeholder="MG Road, Kochi"
          maxLength={100}
        />
        <TextField
          label="UPI ID (optional)"
          value={draft.upiId}
          onChange={(e) => set('upiId', e.target.value)}
          placeholder="name@okhdfcbank"
          maxLength={256}
        />
      </div>

      {willResetVerification && (
        <InfoNote>
          You changed the bank details of a verified account — saving will set
          it back to "Pending verification" until it is re-verified.
        </InfoNote>
      )}
      {problem && <ErrorNote>{problem}</ErrorNote>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="h-10 rounded-md bg-brand-gradient px-5 text-sm font-semibold text-brand-contrast shadow-floating transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
        >
          {busy ? 'Saving…' : initial ? 'Save Changes' : 'Add Account'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="h-10 rounded-md border border-line bg-surface px-4 text-sm font-semibold text-fg transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
