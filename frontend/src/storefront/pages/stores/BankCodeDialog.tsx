import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { toApiError } from '../../../shared/auth/http'
import { Button } from '../../../shared/ui/Button'
import { Dialog } from '../../../shared/ui/Dialog'
import { ErrorNote, TextField } from '../../../shared/ui/form'
import { storeBankApi } from '../../features/stores/storesApi'
import type { BankCodeSent } from '../../features/stores/storesApi'

/**
 * The confirmation code every payout-bank change needs (all but the very
 * first account). Changing bank details is the classic way to steal a
 * seller's payouts, so the person acting must still hold the account's
 * phone (or email) — the code goes there, never to anything typed here.
 *
 * `run(action, { needsCode })` calls `action` with the code. When the page
 * can't know whether a code is needed (the dropship prompt), it first tries
 * without one; the server's `428` opens the dialog.
 */

/** Thrown into the caller when the seller closes the dialog. */
export class CodeCancelled extends Error {
  constructor() {
    super('cancelled')
  }
}

interface Pending {
  action: (otp: string) => Promise<void>
  resolve: () => void
  reject: (err: unknown) => void
}

export function useBankCode(storeId: string) {
  const [sent, setSent] = useState<BankCodeSent | null>(null)
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const pending = useRef<Pending | null>(null)

  const send = async () => {
    setProblem(null)
    setBusy(true)
    try {
      const result = await storeBankApi.requestCode(storeId)
      setSent(result)
      if (result.devCode) setCode(result.devCode)
    } catch (err) {
      setProblem(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  const ask = (action: (otp: string) => Promise<void>) =>
    new Promise<void>((resolve, reject) => {
      pending.current = { action, resolve, reject }
      setCode('')
      setSent(null)
      setOpen(true)
      void send()
    })

  const run = async (
    action: (otp?: string) => Promise<void>,
    opts: { needsCode: boolean },
  ): Promise<void> => {
    if (opts.needsCode) return ask(action)
    try {
      await action(undefined)
    } catch (err) {
      if (toApiError(err).statusCode !== 428) throw err
      return ask(action)
    }
  }

  const confirm = async (e: FormEvent) => {
    e.preventDefault()
    const current = pending.current
    if (!current) return
    if (!/^\d{4,8}$/.test(code.trim())) return setProblem('Type the code we sent you.')
    setBusy(true)
    setProblem(null)
    try {
      await current.action(code.trim())
      setOpen(false)
      pending.current = null
      current.resolve()
    } catch (err) {
      const apiError = toApiError(err)
      // A wrong or expired code (403): let them type it again or ask for a new one.
      if (apiError.statusCode === 403) {
        setProblem(apiError.message)
      } else {
        setOpen(false)
        pending.current = null
        current.reject(err)
      }
    } finally {
      setBusy(false)
    }
  }

  const cancel = () => {
    if (busy) return
    setOpen(false)
    pending.current?.reject(new CodeCancelled())
    pending.current = null
  }

  const dialog = (
    <Dialog
      open={open}
      title="Confirm it's you"
      subtitle="Bank changes need a code, so nobody else can move your money."
      onClose={cancel}
    >
      <form onSubmit={confirm} noValidate className="space-y-4">
        <p className="text-sm text-muted">
          {sent
            ? `We sent a ${sent.expiresInMinutes}-minute code by ${sent.channel === 'SMS' ? 'SMS' : 'email'} to ${sent.destination}.`
            : 'Sending your code…'}
        </p>
        <TextField
          label="Code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          disabled={busy}
        />
        {problem && <ErrorNote>{problem}</ErrorNote>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" size="md" onClick={() => void send()} disabled={busy}>
            Send a new code
          </Button>
          <Button type="submit" size="md" loading={busy}>
            {busy ? 'Checking with your bank…' : 'Confirm'}
          </Button>
        </div>
      </form>
    </Dialog>
  )

  return { run, dialog }
}
