import { BrowserRouter } from 'react-router-dom'
import { adminAuth } from '../shared/auth/authApi'
import { useSession } from '../shared/auth/useSession'
import { adminBasename } from '../shared/appOrigin'
import { ThemeProvider } from '../shared/theme/ThemeProvider'
import { AppLogoFull } from '../shared/ui/AppLogo'
import { AdminSessionProvider } from './app/adminSession'
import { AdminRouter } from './app/router'
import { LoginPage } from './pages/LoginPage'

/**
 * Admin session gate.
 *
 * On load it probes `GET /admin/auth/me` (rotating the refresh cookie once on
 * 401); while that's in flight a splash shows, then either the login page or
 * the console. Tokens live in httpOnly cookies — the console never holds a
 * credential in JS.
 *
 * Basename: on its own host (`admin.uniemax.com`) the console lives at `/`;
 * at the `/admin` path of the storefront host (local dev) it is `/admin`.
 * nginx returns `admin.html` for every console path (`try_files $uri
 * /admin.html`), which is what makes a deep link work. See `appOrigin.ts`.
 */
export function AdminApp() {
  const { state, signedIn, signOut } = useSession(adminAuth)

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <AppLogoFull className="w-40 animate-pulse" />
      </div>
    )
  }

  if (state.status === 'guest') {
    return <LoginPage onSignedIn={signedIn} />
  }

  return (
    <ThemeProvider>
      <BrowserRouter basename={adminBasename()}>
        <AdminSessionProvider admin={state.user} onSignedOut={() => void signOut()}>
          <AdminRouter />
        </AdminSessionProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
