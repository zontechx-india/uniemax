import { useState } from 'react'
import { adminAuth } from '../../shared/auth/authApi'
import type { Admin } from '../../shared/auth/authApi'
import { AppLogoLockup } from '../../shared/ui/AppLogo'
import { Icon } from '../layout/icons'
import { Button, PasswordInput, TextInput } from '../ui/primitives'

/**
 * Admin login — email + password against the real backend
 * (POST /api/v1/admin/auth/web/login → httpOnly cookie session).
 *
 * The console theme's login screen (ADMIN_UI_THEME.md §7.15): one 380px
 * card in the middle of the page — brand, title, two fields, one button.
 *
 * No self-service reset by design: admin accounts are provisioned/reset via
 * `npm run create-admin` on the backend.
 */
export function LoginPage({ onSignedIn }: { onSignedIn: (admin: Admin) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    <div className="login">
      <form className="login-card" onSubmit={signIn}>
        <div className="brandmark">
          <AppLogoLockup className="-mr-6 h-7" />
          <b>Admin</b>
        </div>
        <h1>Sign in</h1>
        <p className="muted">Use your UnieMax admin account.</p>

        <TextInput
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-3"
          autoFocus
        />
        <PasswordInput
          label="Password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-3"
        />

        {error ? (
          <div className="callout c-danger" role="alert">
            <Icon name="alertCircle" size={15} />
            <span className="min-w-0 flex-1">{error}</span>
          </div>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          size="md"
          className="mt-1 w-full"
          loading={busy}
          disabled={!email.trim() || !password}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="login-foot">
        Authorized UnieMax staff only. Locked out? Ask a super admin to reset your account.
      </p>
    </div>
  )
}
