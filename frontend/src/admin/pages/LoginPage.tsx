import { useState } from 'react'
import { adminAuth } from '../../shared/auth/authApi'
import type { Admin } from '../../shared/auth/authApi'
import { AppLogoLockup } from '../../shared/ui/AppLogo'
import {
  AuthLayout,
  Hero,
  AuthCard,
  Brand,
  TextField,
  PrimaryButton,
  ErrorNote,
  MailIcon,
  LockIcon,
  EyeIcon,
} from '../../shared/ui/form'

/**
 * Admin login — email + password against the real backend
 * (POST /api/v1/admin/auth/web/login → httpOnly cookie session).
 *
 * No self-service reset by design: admin accounts are provisioned/reset via
 * `npm run create-admin` on the backend.
 */
export function LoginPage({ onSignedIn }: { onSignedIn: (admin: Admin) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { admin } = await adminAuth.login({ email, password })
      onSignedIn(admin)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      hero={<AdminHero />}
      footer={
        <p className="text-xs text-muted">
          Authorized personnel only · admin.shop.example.com
        </p>
      }
    >
      <Brand
        badge={<AppLogoLockup className="h-11" />}
        badgeClass=""
        title="Admin Console"
        subtitle="Sign in to manage your store"
      />

      <AuthCard>
        <form className="space-y-4" onSubmit={signIn}>
          <TextField
            label="Email"
            type="email"
            placeholder="admin@store.com"
            icon={<MailIcon />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          <TextField
            label="Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            icon={<LockIcon />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-alt hover:text-fg"
              >
                <EyeIcon off={showPassword} />
              </button>
            }
          />
          {error && <ErrorNote>{error}</ErrorNote>}
          <PrimaryButton type="submit" disabled={busy || !email.trim() || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </PrimaryButton>
          <p className="text-center text-xs text-muted">
            Locked out? Ask the store owner to reset your account.
          </p>
        </form>
      </AuthCard>
    </AuthLayout>
  )
}

/** Left marketing pane (lg+ only). */
function AdminHero() {
  return (
    <Hero
      image="/auth_hero_1.jpg"
      logo={
        <>
          <AppLogoLockup tone="on-dark" className="h-8" /> Admin
        </>
      }
    >
      <div>
        <h2 className="text-4xl font-bold leading-tight font-heading">
          Run your store
          <br />
          <span className="text-brand-gradient-on-dark">from one place.</span>
        </h2>
        <p className="mt-3 max-w-sm text-white/80">
          Products, orders, inventory, and shipping — all in one console.
        </p>
      </div>
    </Hero>
  )
}
