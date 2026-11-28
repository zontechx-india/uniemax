// Shared UI — used by every screen in both apps.
//
//   html`…${x}…`   safe templates: ${x} is escaped unless it is html`` or raw()
//   money(), dateTime(), timeAgo()…   the same words and number styles as the app
//   btn({variant,size})               shared/ui/Button.tsx class string
//   UI.toast(text, tone)              short feedback
//   UI.modal({title, body, footer})   bottom sheet on a phone, centred card from sm
//   UI.confirm({...})                 a two-button question (opened with UI.ask)
//   UI.empty({...})                   empty state
//   UI.skeleton(rows)                 loading shimmer
//   UI.errorState(message)            error with a Retry button
//
// No colours here: every class points at a design token from the real
// frontend/src/index.css (or admin.css in the console).

// ===========================================================================
// Safe HTML
// ===========================================================================

class Raw {
  constructor(value) {
    this.value = value
  }
  toString() {
    return this.value
  }
}
const raw = (value) => new Raw(String(value))

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function toHtml(value) {
  if (value === null || value === undefined || value === false || value === true) return ''
  if (value instanceof Raw) return value.value
  if (Array.isArray(value)) return value.map(toHtml).join('')
  return esc(value)
}

function html(strings, ...values) {
  let out = ''
  strings.forEach((part, i) => {
    out += part
    if (i < values.length) out += toHtml(values[i])
  })
  return new Raw(out)
}

/** data-args for a delegated action: data-args="${args('ord_1')}" */
const args = (...values) => raw(esc(JSON.stringify(values)))

// ===========================================================================
// Formatting
// ===========================================================================

const INR0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const INR2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })
const money = (n) => INR0.format(Math.round(Number(n) || 0))
const moneyExact = (n) => INR2.format(Number(n) || 0)
function moneyShort(n) {
  n = Number(n) || 0
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`
  return money(n)
}
const count = (n) => Number(n || 0).toLocaleString('en-IN')
const day = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const dateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—'
/** Seller wording: "Just now", "25 min ago", "3 h ago", "Yesterday", then the date. */
function timeAgo(iso, now = Date.now()) {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  if (hours < 48) return 'Yesterday'
  return day(iso)
}
/** Admin wording: "just now", "5m ago", "3h ago", "2d ago". */
function relative(iso, now = Date.now()) {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}
const todayLabel = () => new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
const dayTick = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const initials = (name) =>
  String(name || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?'
const plural = (n, word, many = word + 's') => `${n} ${n === 1 ? word : many}`

// ===========================================================================
// Theme — the same localStorage key and <html data-theme> as the real app.
// ===========================================================================

const Theme = {
  get mode() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  },
  set(mode) {
    document.documentElement.dataset.theme = mode
    try {
      localStorage.setItem('uniemax-theme', mode)
    } catch {
      /* ignore */
    }
  },
  toggle() {
    this.set(this.mode === 'dark' ? 'light' : 'dark')
  },
}

// ===========================================================================
// Buttons (shared/ui/Button.tsx). The console re-sizes them through admin.css.
// ===========================================================================

const BTN_SIZE = {
  sm: 'h-[var(--btn-h-sm,36px)] gap-1.5 px-3.5 text-sm',
  md: 'h-[var(--btn-h-md,44px)] gap-2 px-5 text-sm',
  lg: 'h-[var(--btn-h-lg,48px)] gap-2 px-6 text-base',
}
const btn = ({ variant = 'primary', size = 'md', full = false, cls = '' } = {}) =>
  `inline-flex shrink-0 items-center justify-center rounded-md font-semibold transition-colors duration-150 ` +
  `disabled:cursor-not-allowed disabled:opacity-45 ${BTN_SIZE[size]} btn-${variant} ${full ? 'w-full' : ''} ${cls}`

const spinner = () =>
  html`<span aria-hidden="true" class="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"></span>`

// ===========================================================================
// UI
// ===========================================================================

/**
 * Extra dialogs from feature files: DIALOGS.kind = (dialog) => UI.modal(…).
 * Open one with Store.ui.dialog = { kind, … }. Both apps' dialog renderers look here last.
 */
const DIALOGS = {}

const UI = {
  host: null,

  /** Short feedback. tone: 'neutral' | 'danger' | 'remote' (from the other app). */
  toast(text, tone = 'neutral') {
    if (!this.host) {
      this.host = document.createElement('div')
      this.host.setAttribute('aria-live', 'polite')
      this.host.className =
        'pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6'
      document.body.appendChild(this.host)
    }
    const el = document.createElement('div')
    const toneClass = tone === 'danger' ? 'border-danger/40 text-danger' : tone === 'remote' ? 'border-brand/40 text-fg' : 'border-line text-fg'
    el.className = `pointer-events-auto flex max-w-md items-center gap-2 rounded-lg border bg-surface px-4 py-3 text-sm font-medium shadow-floating animate-sheet-in ${toneClass}`
    el.textContent = text
    this.host.appendChild(el)
    setTimeout(() => el.remove(), tone === 'remote' ? 5000 : 3200)
  },

  /** shared/ui/Dialog.tsx — a sheet on a phone, a centred card from sm. */
  modal({ title, subtitle, body, footer }) {
    return html`
      <div class="fixed inset-0 z-40 flex animate-dialog-backdrop items-end justify-center bg-[var(--overlay-soft)] text-fg sm:items-center sm:p-4" data-backdrop>
        <div role="dialog" aria-modal="true" class="relative flex max-h-[92dvh] w-full animate-sheet-in flex-col rounded-t-sheet bg-surface shadow-floating outline-none sm:max-h-[88vh] sm:max-w-lg sm:rounded-sheet">
          <span aria-hidden="true" class="mx-auto mt-2 h-1 w-10 shrink-0 rounded-pill bg-fg/15 sm:hidden"></span>
          <header class="flex items-start justify-between gap-3 border-b border-line py-2 pr-2 pl-4 sm:pl-5">
            <div class="min-w-0 py-1.5">
              <h2 class="truncate text-lg font-semibold text-fg">${title}</h2>
              ${subtitle ? html`<div class="mt-0.5 text-xs text-muted">${subtitle}</div>` : ''}
            </div>
            <button type="button" data-act="closeDialog" aria-label="Close" class="flex size-tap shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-alt hover:text-fg">${Icon('x', 'h-5 w-5')}</button>
          </header>
          <div class="min-h-0 flex-1 overflow-y-auto px-4 pt-4 sm:px-5 ${footer ? 'pb-4' : 'pb-[max(1rem,env(safe-area-inset-bottom))]'}">${body}</div>
          ${footer ? html`<footer class="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">${footer}</footer>` : ''}
        </div>
      </div>`
  },

  /**
   * Open a confirm dialog. When the user says yes, Act[act](...args) runs.
   *   UI.ask({ title: 'Close this ticket?', message: '…', confirmLabel: 'Close', tone: 'danger', act: 'closeTicket', args: [id] })
   */
  ask(options) {
    Store.ui.dialog = { kind: 'confirm', ...options }
    Act.commit()
  },

  /** shared/ui/ConfirmDialog.tsx — rendered by each app's view when dialog.kind === 'confirm'. */
  confirm({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'primary', act, args: a = [] }) {
    const size = App.kind === 'admin' ? 'sm' : 'md'
    return this.modal({
      title,
      body: html`<p class="text-base text-fg">${message}</p>`,
      footer: html`
        <button type="button" data-act="closeDialog" class="${btn({ variant: 'secondary', size })}">${cancelLabel}</button>
        <button type="button" data-act="confirmYes" data-args="${args(act, ...a)}" class="${btn({ variant: tone === 'danger' ? 'danger' : 'primary', size })}">${confirmLabel}</button>`,
    })
  },

  /** shared/ui/states.tsx EmptyState (seller) / .empty (console). */
  empty({ ico, title, description, action, compact = false }) {
    if (App.kind === 'admin') {
      return html`<div class="empty ${compact ? 'compact' : ''}">${AIcon(ico || 'inbox', 28)}<h3>${title}</h3>${description ? html`<p>${description}</p>` : ''}${action ? html`<div class="acts">${action}</div>` : ''}</div>`
    }
    return html`
      <div class="flex flex-col items-center px-4 text-center ${compact ? 'py-8' : 'py-10 sm:py-14'}">
        ${ico ? html`<span class="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-brand-soft text-brand">${Icon(ico, 'h-7 w-7')}</span>` : ''}
        <h3 class="text-lg font-semibold text-fg">${title}</h3>
        ${description ? html`<p class="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">${description}</p>` : ''}
        ${action ? html`<div class="mt-5">${action}</div>` : ''}
      </div>`
  },

  /** Loading shimmer: `rows` is a list of Tailwind height classes. */
  skeleton(rows = ['h-32', 'h-20', 'h-20', 'h-20']) {
    if (App.kind === 'admin') {
      return html`<div aria-busy="true" aria-label="Loading">
        <div class="skel mb-2 h-6 w-56 max-w-full"></div><div class="skel mb-5 h-4 w-80 max-w-full"></div>
        <div class="stats">${[0, 1, 2, 3].map(() => html`<div class="skel h-[70px]"></div>`)}</div>
        <div class="card pad space-y-2">${rows.map((h) => html`<div class="skel ${h}"></div>`)}</div></div>`
    }
    return html`<div aria-busy="true" aria-label="Loading" class="space-y-3">
      <div class="h-6 w-40 animate-pulse rounded-md bg-fg/10"></div>
      ${rows.map((h) => html`<div class="ws-card ${h} animate-pulse rounded-lg"></div>`)}</div>`
  },

  /** An error with Retry (reloads the current screen). */
  errorState(message) {
    if (App.kind === 'admin') {
      return html`<div role="alert" class="empty err">${AIcon('alertCircle', 28)}<h3>Couldn’t load this page</h3><p>${message}</p>
        <div class="acts"><button type="button" class="${btn({ variant: 'secondary', size: 'sm' })}" data-act="retryLoad">${AIcon('refresh', 15)}Retry</button></div></div>`
    }
    return html`<div role="alert" class="ws-card rounded-lg">${this.empty({
      ico: 'alert',
      title: 'Couldn’t load this page',
      description: message,
      action: html`<button type="button" class="${btn({ variant: 'secondary', size: 'lg' })}" data-act="retryLoad">Try again</button>`,
    })}</div>`
  },

  /** Inline error line under a form or action. */
  errorNote(text) {
    return text
      ? html`<p role="alert" class="rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm font-medium text-danger">${text}</p>`
      : ''
  },
  infoNote(text) {
    return html`<p class="rounded-md border border-line bg-surface-alt px-3 py-2.5 text-sm text-muted">${text}</p>`
  },
}
