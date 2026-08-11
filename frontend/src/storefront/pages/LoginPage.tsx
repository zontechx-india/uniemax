import { useState } from 'react'
import { customerAuth } from '../../shared/auth/authApi'
import type { Customer } from '../../shared/auth/authApi'
import { AppLogoLockup } from '../../shared/ui/AppLogo'
import {
  AuthLayout,
  Hero,
  AuthCard,
  Brand,
  TextField,
  PrimaryButton,
  SecondaryButton,
  ErrorNote,
  InfoNote,
  SuccessNote,
  SegmentedTabs,
  OrDivider,
  MailIcon,
  LockIcon,
  ShieldIcon,
  PhoneIcon,
  UserIcon,
  EyeIcon,
  GoogleIcon,
} from '../../shared/ui/form'

/**
 * Customer auth — wired to the real backend (web profile: httpOnly cookies).
 *
 * Three sign-in methods, matching what `package/auth` ships today:
 *   Email tab  → sign in / create account (+ forgot-password flow)
 *   Mobile tab → phone → OTP code (account created on first verify)
 *   Google     → dev simulation until GOOGLE_CLIENT_ID + the real GIS button land
 *
 * Verification-code delivery is dummy on the backend for now, so responses
 * include `devCode` (123456) outside production — surfaced in the UI hints.
 */

/**
 * Google Sign-In is hidden until the real integration is planned
 * (GOOGLE_CLIENT_ID + GIS button; backend endpoint already exists).
 * Flip to true to show the button again.
 */
const GOOGLE_SIGNIN_ENABLED = false

type View =
  | 'email' // sign in
  | 'register'
  | 'forgot' // request reset code
  | 'reset' // enter code + new password
  | 'phone' // request OTP
  | 'phone-verify'

export function LoginPage({ onSignedIn }: { onSignedIn: (customer: Customer) => void }) {
  const [view, setView] = useState<View>('email')
  const [notice, setNotice] = useState('') // cross-view success message

  const tab = view === 'phone' || view === 'phone-verify' ? 'phone' : 'email'
  // The tabs switch the SIGN-IN method. Register / forgot / reset are
  // email-only sub-flows (Mobile OTP is login-only), so the switcher is
  // not part of those views at all.
  const showMethodTabs = view === 'email' || view === 'phone' || view === 'phone-verify'

  return (
    <AuthLayout
      hero={<StorefrontHero />}
      footer={<p className="text-xs text-muted">© UnieMax · Terms · Privacy</p>}
    >
      {/* The lockup already sets the name, so there is no title line here. */}
      <Brand
        badge={<AppLogoLockup className="h-11" />}
        badgeClass=""
        subtitle="Sign in to continue shopping"
      />

      <AuthCard>
        {showMethodTabs && (
          <SegmentedTabs
            tabs={[
              { value: 'email', label: 'Email' },
              { value: 'phone', label: 'Mobile OTP' },
            ]}
            value={tab}
            onChange={(t) => {
              setNotice('')
              setView(t === 'phone' ? 'phone' : 'email')
            }}
          />
        )}

        {notice && (
          <div className="mb-4">
            <SuccessNote>{notice}</SuccessNote>
          </div>
        )}

        {view === 'email' && (
          <EmailSignIn
            onSignedIn={onSignedIn}
            onRegister={() => setView('register')}
            onForgot={() => {
              setNotice('')
              setView('forgot')
            }}
          />
        )}
        {view === 'register' && (
          <Register onSignedIn={onSignedIn} onBack={() => setView('email')} />
        )}
        {(view === 'forgot' || view === 'reset') && (
          <ForgotPassword
            step={view}
            onCodeSent={() => setView('reset')}
            onDone={() => {
              setNotice('Password reset — sign in with your new password.')
              setView('email')
            }}
            onBack={() => setView('email')}
          />
        )}
        {(view === 'phone' || view === 'phone-verify') && (
          <PhoneOtp
            step={view}
            onCodeSent={() => setView('phone-verify')}
            onBack={() => setView('phone')}
            onSignedIn={onSignedIn}
          />
        )}
      </AuthCard>

      <p className="mt-4 text-center text-sm text-muted">
        Browsing and checkout work without an account — sign in to see your orders.
      </p>
    </AuthLayout>
  )
}

/* ------------------------------------------------------------------ */
/* Email + password — sign in                                          */
/* ------------------------------------------------------------------ */

function EmailSignIn({
  onSignedIn,
  onRegister,
  onForgot,
}: {
  onSignedIn: (customer: Customer) => void
  onRegister: () => void
  onForgot: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { customer } = await customerAuth.login({ email, password })
      onSignedIn(customer)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <form className="space-y-4" onSubmit={submit}>
        <TextField
          label="Email"
          type="email"
          placeholder="you@example.com"
          icon={<MailIcon />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
        <div>
          <TextField
            label="Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            icon={<LockIcon />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            trailing={<PasswordToggle show={showPassword} onToggle={() => setShowPassword((s) => !s)} />}
          />
          <div className="mt-1.5 text-right">
            <button
              type="button"
              onClick={onForgot}
              className="text-xs font-medium text-brand hover:text-brand-hover"
            >
              Forgot password?
            </button>
          </div>
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <PrimaryButton type="submit" disabled={busy || !email.trim() || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </PrimaryButton>
      </form>

      {GOOGLE_SIGNIN_ENABLED && (
        <>
          <OrDivider />
          <GoogleSignIn onSignedIn={onSignedIn} />
        </>
      )}

      <p className="text-center text-sm text-muted">
        New here?{' '}
        <button
          type="button"
          onClick={onRegister}
          className="font-semibold text-brand hover:text-brand-hover"
        >
          Create an account
        </button>
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Email + password — create account (verify-first)                    */
/* ------------------------------------------------------------------ */

/**
 * Two steps: fill the form → we email a code → entering the code creates the
 * account (already verified) and signs in. No account exists until verified.
 */
function Register({
  onSignedIn,
  onBack,
}: {
  onSignedIn: (customer: Customer) => void
  onBack: () => void
}) {
  const [step, setStep] = useState<'form' | 'code'>('form')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const form = {
    email,
    password,
    ...(name.trim() ? { name: name.trim() } : {}),
  }

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault()
    setError('')
    setBusy(true)
    try {
      await customerAuth.registerRequest(form)
      setStep('code')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { customer } = await customerAuth.registerVerify({ ...form, code })
      onSignedIn(customer)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (step === 'form') {
    return (
      <form className="space-y-4" onSubmit={requestCode}>
        <div>
          <h2 className="text-base font-semibold text-fg">Create your account</h2>
          <p className="mt-0.5 text-xs text-muted">Sign up with your email address.</p>
        </div>
        <TextField
          label="Name"
          placeholder="Your name (optional)"
          icon={<UserIcon />}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <TextField
          label="Email"
          type="email"
          placeholder="you@example.com"
          icon={<MailIcon />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="At least 8 characters"
          icon={<LockIcon />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          trailing={<PasswordToggle show={showPassword} onToggle={() => setShowPassword((s) => !s)} />}
        />
        {error && <ErrorNote>{error}</ErrorNote>}
        <PrimaryButton type="submit" disabled={busy || !email.trim() || password.length < 8}>
          {busy ? 'Sending code…' : 'Continue'}
        </PrimaryButton>
        <p className="text-center text-xs text-muted">
          We&apos;ll email a code to verify it&apos;s yours — your account is
          created after verification.
        </p>
        <p className="text-center text-sm text-muted">
          Already have an account?{' '}
          <button
            type="button"
            onClick={onBack}
            className="font-semibold text-brand hover:text-brand-hover"
          >
            Sign in
          </button>
        </p>
      </form>
    )
  }

  return (
    <form className="space-y-4" onSubmit={verify}>
      <p className="text-sm text-muted">
        Enter the 6-digit code we emailed to{' '}
        <span className="font-medium text-fg">{email}</span> to verify
        your email and create your account. Check spam if you don&apos;t see it.
      </p>
      <TextField
        label="Verification code"
        inputMode="numeric"
        maxLength={6}
        placeholder="Enter 6-digit code"
        icon={<ShieldIcon />}
        value={code}
        onChange={(e) => {
          setError('')
          setCode(e.target.value.replace(/\D/g, ''))
        }}
        autoFocus
        className="tracking-[0.3em]"
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      <PrimaryButton type="submit" disabled={busy || code.length < 6}>
        {busy ? 'Creating account…' : 'Verify & create account'}
      </PrimaryButton>
      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          className="text-muted hover:text-fg"
          onClick={() => {
            setCode('')
            setStep('form')
          }}
        >
          ← Edit details
        </button>
        <button
          type="button"
          onClick={() => requestCode()}
          disabled={busy}
          className="font-medium text-brand hover:text-brand-hover disabled:text-muted"
        >
          Resend code
        </button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Forgot / reset password                                             */
/* ------------------------------------------------------------------ */

function ForgotPassword({
  step,
  onCodeSent,
  onDone,
  onBack,
}: {
  step: 'forgot' | 'reset'
  onCodeSent: () => void
  onDone: () => void
  onBack: () => void
}) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function requestCode(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await customerAuth.forgotPassword(email)
      onCodeSent()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await customerAuth.resetPassword({ email, code, newPassword })
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (step === 'forgot') {
    return (
      <form className="space-y-4" onSubmit={requestCode}>
        <p className="text-sm text-muted">
          Enter your account email and we&apos;ll send a reset code.
        </p>
        <TextField
          label="Email"
          type="email"
          placeholder="you@example.com"
          icon={<MailIcon />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
        {error && <ErrorNote>{error}</ErrorNote>}
        <PrimaryButton type="submit" disabled={busy || !email.trim()}>
          {busy ? 'Sending…' : 'Send reset code'}
        </PrimaryButton>
        <BackLink onClick={onBack}>← Back to sign in</BackLink>
      </form>
    )
  }

  return (
    <form className="space-y-4" onSubmit={reset}>
      <p className="text-sm text-muted">
        If an account exists for{' '}
        <span className="font-medium text-fg">{email}</span>, we&apos;ve
        emailed it a reset code. Enter it below with your new password.
      </p>
      <TextField
        label="Reset code"
        inputMode="numeric"
        maxLength={6}
        placeholder="6-digit code"
        icon={<ShieldIcon />}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        autoFocus
        className="tracking-[0.3em]"
      />
      <TextField
        label="New password"
        type="password"
        placeholder="At least 8 characters"
        icon={<LockIcon />}
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      <PrimaryButton type="submit" disabled={busy || code.length < 6 || newPassword.length < 8}>
        {busy ? 'Resetting…' : 'Reset password'}
      </PrimaryButton>
      <BackLink onClick={onBack}>← Back to sign in</BackLink>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Mobile number + OTP                                                 */
/* ------------------------------------------------------------------ */

function PhoneOtp({
  step,
  onCodeSent,
  onBack,
  onSignedIn,
}: {
  step: 'phone' | 'phone-verify'
  onCodeSent: () => void
  onBack: () => void
  onSignedIn: (customer: Customer) => void
}) {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault()
    setError('')
    setBusy(true)
    try {
      const sent = await customerAuth.requestOtp(phone.replace(/\s/g, ''))
      setDevCode(sent.devCode)
      onCodeSent()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { customer } = await customerAuth.verifyOtp({
        phone: phone.replace(/\s/g, ''),
        code,
      })
      onSignedIn(customer)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (step === 'phone') {
    return (
      <form className="space-y-4" onSubmit={requestCode}>
        <TextField
          label="Mobile number"
          inputMode="tel"
          placeholder="9876543210"
          icon={<PhoneIcon />}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoFocus
        />
        {error && <ErrorNote>{error}</ErrorNote>}
        <PrimaryButton type="submit" disabled={busy || phone.replace(/\D/g, '').length < 7}>
          {busy ? 'Sending…' : 'Send code'}
        </PrimaryButton>
        <p className="text-center text-xs text-muted">
          Works for numbers linked to an account. New here? Create an account
          with email first, then add your number from your profile.
        </p>
      </form>
    )
  }

  return (
    <form className="space-y-4" onSubmit={verify}>
      <p className="text-sm text-muted">
        Enter the code sent to{' '}
        <span className="font-medium text-fg">{phone}</span>
      </p>
      {devCode && <InfoNote>Dev mode — use code {devCode}</InfoNote>}
      <TextField
        label="One-time code"
        inputMode="numeric"
        maxLength={8}
        placeholder="Enter the code"
        icon={<ShieldIcon />}
        value={code}
        onChange={(e) => {
          setError('')
          setCode(e.target.value.replace(/\D/g, ''))
        }}
        autoFocus
        className="tracking-[0.3em]"
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      {/* Real SMS codes are 4 digits (Message Central default); the dev
          fallback/bypass sends 6 — so gate at the backend's minimum. */}
      <PrimaryButton type="submit" disabled={busy || code.length < 4}>
        {busy ? 'Verifying…' : 'Verify & sign in'}
      </PrimaryButton>
      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          className="text-muted hover:text-fg"
          onClick={() => {
            setCode('')
            onBack()
          }}
        >
          ← Change number
        </button>
        <button
          type="button"
          onClick={() => requestCode()}
          disabled={busy}
          className="font-medium text-brand hover:text-brand-hover disabled:text-muted"
        >
          Resend code
        </button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Google Sign-In (dev simulation until the real GIS button lands)     */
/* ------------------------------------------------------------------ */

/**
 * Backend Google verification is mocked (accepts an unverified token), so the
 * button opens a small dev panel instead of the Google popup. When
 * GOOGLE_CLIENT_ID is configured, replace this with the official
 * Google Identity Services button and pass its real `credential` (ID token)
 * to `customerAuth.google(...)` — nothing else changes.
 */
function GoogleSignIn({ onSignedIn }: { onSignedIn: (customer: Customer) => void }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      // Mock ID token the backend's mock verifier understands (dev only).
      const idToken = JSON.stringify({
        sub: `dev-google-${email.trim().toLowerCase()}`,
        email: email.trim().toLowerCase(),
        ...(name.trim() ? { name: name.trim() } : {}),
      })
      const { customer } = await customerAuth.google(idToken)
      onSignedIn(customer)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <SecondaryButton type="button" onClick={() => setOpen(true)}>
        <GoogleIcon />
        Continue with Google
      </SecondaryButton>
    )
  }

  return (
    <form className="space-y-3 rounded-md border border-dashed border-line bg-surface-alt p-4" onSubmit={submit}>
      <p className="text-xs text-muted">
        <span className="font-semibold text-fg">Dev simulation</span> — the real
        Google popup appears once <code>GOOGLE_CLIENT_ID</code> is configured.
      </p>
      <TextField
        label="Google account email"
        type="email"
        placeholder="you@gmail.com"
        icon={<MailIcon />}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoFocus
      />
      <TextField
        label="Display name"
        placeholder="Optional"
        icon={<UserIcon />}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      <PrimaryButton type="submit" disabled={busy || !email.trim()}>
        {busy ? 'Signing in…' : 'Sign in with Google (dev)'}
      </PrimaryButton>
      <BackLink onClick={() => setOpen(false)}>Cancel</BackLink>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Small shared bits                                                   */
/* ------------------------------------------------------------------ */

function PasswordToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={show ? 'Hide password' : 'Show password'}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-alt hover:text-fg"
    >
      <EyeIcon off={show} />
    </button>
  )
}

function BackLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <p className="text-center">
      <button
        type="button"
        onClick={onClick}
        className="text-xs text-muted hover:text-fg"
      >
        {children}
      </button>
    </p>
  )
}

/** Left marketing pane (lg+ only). */
function StorefrontHero() {
  return (
    <Hero
      image="/auth_hero_1.jpg"
      logo={
        <>
          <AppLogoLockup tone="on-dark" className="h-8" />
        </>
      }
    >
      <div>
        <h2 className="text-4xl font-bold leading-tight font-heading">
          Gear up.
          <br />
          <span className="text-brand-gradient-on-dark">Play your best.</span>
        </h2>
        <p className="mt-3 max-w-sm text-white/80">
          Premium cricket bats delivered to your door. Cash on delivery
          available.
        </p>
      </div>
    </Hero>
  )
}
