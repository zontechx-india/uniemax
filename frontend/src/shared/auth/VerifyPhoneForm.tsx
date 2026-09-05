import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { customerAuth } from './authApi'
import type { Customer } from './authApi'
import {
  ErrorNote,
  InfoNote,
  PhoneIcon,
  PrimaryButton,
  ShieldIcon,
  TextField,
} from '../ui/form'

/**
 * Add a verified mobile number to the signed-in account: enter a number, get
 * an SMS code, confirm it. Calls back with the updated `Customer`, whose
 * `phone` / `phoneVerifiedAt` are then set.
 *
 * This is shared because a phone number is only ever allowed to enter the
 * platform ONE way. The backend refuses a number already linked to another
 * account (409) and stamps `phoneVerifiedAt` only after the code is
 * confirmed, so everywhere a verified number is needed — the profile page,
 * store onboarding — comes through here. A second "just type your number"
 * field elsewhere would quietly reintroduce unverified contact details, which
 * is the failure this exists to prevent.
 *
 * It renders no `<form>` and no surrounding chrome deliberately: it is often
 * embedded inside a host form (a wizard step), and nested forms are invalid
 * HTML that browsers silently drop. Enter is handled on the inputs instead,
 * so it still behaves like a form to the person using it.
 */
export function VerifyPhoneForm({
  onVerified,
  onCancel,
  autoFocus = true,
  submitLabel = 'Verify & link number',
}: {
  onVerified: (customer: Customer) => void
  /** Omit to render no cancel affordance (a step with nothing to go back to). */
  onCancel?: () => void
  autoFocus?: boolean
  submitLabel?: string
}) {
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Matches the backend's loose E.164 rule (optional +, 7–15 digits).
  const cleaned = phone.replace(/[\s-]/g, '')
  const phoneValid = /^\+?[0-9]{7,15}$/.test(cleaned)
  // Real SMS codes are 4 digits (Message Central default); the dev
  // fallback/bypass sends 6 — so gate at the backend's minimum.
  const codeValid = code.length >= 4

  async function requestCode() {
    if (busy || !phoneValid) return
    setError('')
    setBusy(true)
    try {
      const sent = await customerAuth.linkRequest({ phone: cleaned })
      setDevCode(sent.devCode)
      setCode('')
      setStep('code')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function verify() {
    if (busy || !codeValid) return
    setError('')
    setBusy(true)
    try {
      onVerified(await customerAuth.linkVerify({ phone: cleaned, code }))
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  /** Enter submits the current sub-step without submitting any host form. */
  const enterRuns = (action: () => void) => (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    action()
  }

  if (step === 'phone') {
    return (
      <div className="max-w-sm space-y-3">
        <TextField
          label="Mobile number"
          inputMode="tel"
          placeholder="9876543210"
          icon={<PhoneIcon />}
          value={phone}
          onChange={(e) => {
            setError('')
            setPhone(e.target.value)
          }}
          onKeyDown={enterRuns(requestCode)}
          autoFocus={autoFocus}
        />
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex items-center gap-3">
          <PrimaryButton
            type="button"
            onClick={requestCode}
            disabled={busy || !phoneValid}
          >
            {busy ? 'Sending…' : 'Send verification code'}
          </PrimaryButton>
          {onCancel && (
            <button
              type="button"
              onClick={() => {
                setError('')
                onCancel()
              }}
              className="text-xs text-muted hover:text-fg"
            >
              Cancel
            </button>
          )}
        </div>
        <p className="text-xs text-muted">
          We&apos;ll text a code to this number to confirm it&apos;s yours. A
          number can be linked to only one UnieMax account.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-sm space-y-3">
      <p className="text-sm text-muted">
        Enter the code sent to{' '}
        <span className="font-medium text-fg">{cleaned}</span>
      </p>
      {devCode && <InfoNote>Dev mode — use code {devCode}</InfoNote>}
      <TextField
        label="Verification code"
        inputMode="numeric"
        maxLength={8}
        placeholder="Enter the code"
        icon={<ShieldIcon />}
        value={code}
        onChange={(e) => {
          setError('')
          setCode(e.target.value.replace(/\D/g, ''))
        }}
        onKeyDown={enterRuns(verify)}
        autoFocus
        className="tracking-[0.3em]"
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      <PrimaryButton type="button" onClick={verify} disabled={busy || !codeValid}>
        {busy ? 'Verifying…' : submitLabel}
      </PrimaryButton>
      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          className="text-muted hover:text-fg"
          onClick={() => {
            setError('')
            setCode('')
            setStep('phone')
          }}
        >
          ← Change number
        </button>
        <button
          type="button"
          onClick={requestCode}
          disabled={busy}
          className="font-medium text-brand hover:text-brand-hover disabled:text-muted"
        >
          Resend code
        </button>
      </div>
    </div>
  )
}
