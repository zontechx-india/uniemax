// Login screens — one screen name ('login'), drawn for the app that loads it.
//
//   Seller  storefront/pages/LoginPage.tsx + CustomerAuthPanel (Email | Mobile OTP)
//           Test OTP: 123456 for any 10-digit number. Email: any email + password.
//   Admin   admin/pages/LoginPage.tsx (email + password). Any password works.
//
// Signing in sets Store.ui.session (per app) and returns to the screen you
// were heading to.

const FIELD =
  'h-field w-full rounded-md border border-line bg-input px-4 text-base text-fg outline-none transition-colors ' +
  'placeholder:text-muted hover:border-fg/30 focus:border-accent disabled:cursor-not-allowed disabled:opacity-60'
const FIELD_LABEL = 'mb-1.5 block text-sm font-medium text-fg'

/** shared/ui/form.tsx TextField, with an optional leading icon. */
const textField = ({ label, name, type = 'text', value = '', placeholder = '', ico, cls = '', extra = '' }) => html`
  <label class="block">
    <span class="${FIELD_LABEL}">${label}</span>
    <div class="group relative">
      ${ico ? html`<span class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted transition-colors group-focus-within:text-fg">${Icon(ico, 'h-[18px] w-[18px]')}</span>` : ''}
      <input id="login-${name}" name="${name}" type="${type}" value="${value}" placeholder="${placeholder}" class="${FIELD} ${ico ? 'pl-11' : ''} ${cls}" ${raw(extra)} />
    </div>
  </label>`

function sellerLogin() {
  const l = Store.ui.login
  const busy = Store.ui.busy.login
  const error = Store.ui.errors.login
  const submit = (label, busyLabel, disabled = false) =>
    html`<button type="submit" ${busy || disabled ? 'disabled' : ''} class="${btn({ size: 'lg', full: true })}">${busy ? spinner() : ''}${busy ? busyLabel : label}</button>`

  let body
  if (l.tab === 'email') {
    body = html`<form class="space-y-4" data-submit="emailSignIn">
      ${textField({ label: 'Email', name: 'email', type: 'email', placeholder: 'you@example.com', value: DEMO_LOGIN.sellerEmail })}
      ${textField({ label: 'Password', name: 'password', type: 'password', placeholder: '••••••••' })}
      ${UI.errorNote(error)}
      ${submit('Sign in', 'Signing in…')}
      <p class="text-center text-xs text-muted">Prototype: any password works.</p>
    </form>`
  } else if (l.step === 'phone') {
    body = html`<form class="space-y-4" data-submit="sendCode">
      ${textField({ label: 'Mobile number', name: 'phone', placeholder: '9876543210', ico: 'phone', value: l.phone, extra: 'inputmode="tel" autofocus' })}
      ${UI.errorNote(error)}
      ${submit('Send code', 'Sending…')}
      <p class="text-center text-xs text-muted">Works for numbers linked to an account. New here? Create an account with email first, then add your number from your profile.</p>
    </form>`
  } else {
    body = html`<form class="space-y-4" data-submit="verifyCode">
      <p class="text-sm text-muted">Enter the code sent to <span class="font-medium text-fg">${l.phone}</span></p>
      ${UI.infoNote(`Dev mode — use code ${DEMO_LOGIN.otp}`)}
      ${textField({ label: 'One-time code', name: 'code', placeholder: 'Enter the code', ico: 'shieldCheck', cls: 'tracking-[0.3em]', extra: 'inputmode="numeric" maxlength="8" autofocus' })}
      ${UI.errorNote(error)}
      ${submit('Verify & sign in', 'Verifying…')}
      <div class="flex items-center justify-between text-xs">
        <button type="button" class="text-muted hover:text-fg" data-act="changeNumber">← Change number</button>
        <button type="button" class="font-medium text-brand hover:text-brand-hover" data-act="resendCode">Resend code</button>
      </div>
    </form>`
  }

  const tab = (value, label) =>
    html`<button type="button" data-act="loginTab" data-args="${args(value)}" class="h-tap rounded-sm text-sm font-medium transition-colors ${l.tab === value ? 'bg-surface text-fg shadow-floating' : 'text-muted hover:text-fg'}">${label}</button>`

  return html`
    <div class="min-h-screen w-full overflow-x-hidden bg-bg lg:grid lg:grid-cols-[1.15fr_1fr]">
      <aside class="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div class="relative flex h-full w-full flex-col justify-between overflow-hidden rounded-lg bg-cover bg-center p-10 text-white" style="background-image:url(/auth_hero_1.jpg)">
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/50"></div>
          <div class="relative flex items-center gap-2 text-lg font-semibold"><span role="img" aria-label="UnieMax" class="logo-lockup logo-lockup-on-dark block h-8 shrink-0"></span></div>
          <div class="relative">
            <h2 class="text-4xl font-bold leading-tight font-heading">Your store,<br /><span class="text-brand-gradient-on-dark">online in minutes.</span></h2>
            <p class="mt-3 max-w-sm text-white/80">Add your products, share one link, take orders — no technical knowledge needed.</p>
          </div>
        </div>
      </aside>
      <main class="flex min-h-screen flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div class="mx-auto w-full max-w-sm">
          <div class="mb-8 flex flex-col items-center text-center">
            <div class="mb-4 flex items-center justify-center"><span role="img" aria-label="UnieMax" class="logo-lockup block h-11 shrink-0"></span></div>
            <p class="mt-2 text-sm text-muted">Sign in or create a free account to set up your store</p>
          </div>
          <div class="rounded-lg border border-line bg-surface px-8 py-9 shadow-floating">
            <div class="mb-5 grid grid-cols-2 gap-1 rounded-md bg-surface-alt p-1">${tab('email', 'Email')}${tab('phone', 'Mobile OTP')}</div>
            ${body}
          </div>
          <div class="mt-8 text-center"><p class="text-xs text-muted">© UnieMax · Terms · Privacy</p></div>
        </div>
      </main>
    </div>`
}

function adminLogin() {
  const busy = Store.ui.busy.login
  const error = Store.ui.errors.login
  const field =
    'w-full rounded-md border border-line bg-input text-fg outline-none transition-colors placeholder:text-muted ' +
    'hover:border-fg/30 focus:border-accent h-tap px-3 text-sm'
  return html`
    <div class="login">
      <form class="login-card" data-submit="adminSignIn">
        <div class="brandmark"><span role="img" aria-label="UnieMax" class="logo-lockup block shrink-0 -mr-6 h-7"></span><b>Admin</b></div>
        <h1>Sign in</h1>
        <p class="muted">Use your UnieMax admin account.</p>
        <label class="block mb-3"><span class="${FIELD_LABEL}">Email</span><input id="login-email" name="email" type="email" value="${DEMO_LOGIN.adminEmail}" placeholder="you@example.com" class="${field}" /></label>
        <label class="block mb-3"><span class="${FIELD_LABEL}">Password</span><input id="login-password" name="password" type="password" placeholder="••••••••" class="${field}" /></label>
        ${error ? html`<div class="callout c-danger" role="alert">${AIcon('alertCircle', 15)}<span class="min-w-0 flex-1">${error}</span></div>` : ''}
        <div class="callout c-info">${AIcon('alertCircle', 15)}<span class="min-w-0 flex-1">Prototype: any password works.</span></div>
        <button type="submit" class="${btn({ variant: 'primary', size: 'md', cls: 'mt-1 w-full' })}" ${busy ? 'disabled' : ''}>${busy ? spinner() : ''}${busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p class="login-foot">Authorized UnieMax staff only. Locked out? Ask a super admin to reset your account.</p>
    </div>`
}

App.reg('login', {
  path: '/login',
  title: 'Sign in',
  auth: false,
  render: () => (App.kind === 'admin' ? adminLogin() : sellerLogin()),
})

// ---- Acts ----

/** After a successful sign-in: back to where you were heading, or home. */
function signedIn(via) {
  Store.ui.session = { via, at: new Date().toISOString() }
  Store.ui.login = { tab: Store.ui.login.tab, step: 'phone', phone: '' }
  const next = Store.ui.afterLogin && Store.ui.afterLogin !== '/login' ? Store.ui.afterLogin : null
  Store.ui.afterLogin = null
  App.reset(next || App.home)
}

Object.assign(Act, {
  loginTab(tab) {
    Store.ui.login.tab = tab
    Store.ui.errors.login = null
    Act.commit()
  },
  async sendCode({ phone }) {
    const digits = phone.replace(/\D/g, '')
    if (digits.length !== 10) {
      Store.ui.errors.login = 'Enter your 10-digit mobile number.'
      return Act.commit()
    }
    const sent = await run('login', () => true)
    if (!sent) return
    Store.ui.login.phone = phone.trim()
    Store.ui.login.step = 'verify'
    UI.toast(`Code sent to ${phone.trim()}`)
    Act.commit()
  },
  async verifyCode({ code }) {
    const ok = await run('login', () => {
      if (code.trim() !== DEMO_LOGIN.otp) throw new Error('That code is not right. Check it and try again.')
      return true
    })
    if (ok) signedIn('phone')
  },
  changeNumber() {
    Store.ui.login.step = 'phone'
    Store.ui.errors.login = null
    Act.commit()
  },
  resendCode() {
    UI.toast(`Code sent again — it is still ${DEMO_LOGIN.otp}`)
  },
  async emailSignIn({ email, password }) {
    if (!email.trim()) return (Store.ui.errors.login = 'Enter your email address.'), Act.commit()
    if (!password) return (Store.ui.errors.login = 'Enter your password.'), Act.commit()
    const ok = await run('login', () => true)
    if (ok) signedIn('email')
  },
  async adminSignIn({ email, password }) {
    if (!email.trim() || !password) return (Store.ui.errors.login = 'Enter your email and password.'), Act.commit()
    const ok = await run('login', () => true)
    if (ok) signedIn('email')
  },
})
