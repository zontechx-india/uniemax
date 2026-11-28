// Start-up + the control panel.
//
// The control panel sits LEFT of the app on a desktop (1024 px and wider) and
// is not part of the product. It shows the current screen and lets you jump
// around, load or reset data, make things fail, and make the other side reply.
//
// Each app's screens file (js/screens/seller.js or admin.js) defines
// AppConfig: { home, view, freshUi, replyNow, simulate, jumps }.

const freshDev = () => ({
  open: true,
  offline: false, // every page load and action fails
  netFailNext: false, // the next page load fails (error state + Retry)
  failNext: false, // the next action fails
  latency: 700,
  autoReply: true, // play the other app when it is closed
  payoutFails: false,
})

// ===========================================================================
// Control panel
// ===========================================================================

const ControlPanel = {
  host: null,

  init() {
    this.host = document.createElement('aside')
    this.host.className = 'cp'
    this.host.setAttribute('aria-label', 'Prototype controls')
    document.body.prepend(this.host)
  },

  render() {
    if (!this.host) return
    const dev = Store.ui.dev
    document.documentElement.classList.toggle('cp-open', !!dev.open)
    if (!dev.open) {
      this.host.innerHTML = String(html`<button type="button" data-act="cpToggle" class="cp-tab">${Icon('panelLeft', 'h-4 w-4')}Controls</button>`)
      return
    }

    const other = Store.other === 'admin' ? 'Admin console' : 'Seller app'
    const online = Store.isOnline()
    const screen = App.screens[App.current.name] || {}
    const log = Store.readLog().slice(-6).reverse()
    const small = (variant = 'secondary', extra = '') => btn({ variant, size: 'sm', cls: `cp-btn ${extra}` })
    const section = (title, body) => html`<section class="cp-sec"><h3>${title}</h3>${body}</section>`
    const toggle = (act, on, label) => html`
      <label class="cp-check"><input type="checkbox" data-change="${act}" ${on ? 'checked' : ''} /><span>${label}</span></label>`

    this.host.innerHTML = String(html`
      <header class="cp-head">
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-fg">Prototype controls</p>
          <p class="text-xs text-muted">${{ admin: 'Admin console', seller: 'Seller app', customer: 'Customer bill page' }[App.kind]} · dummy data</p>
        </div>
        <button type="button" data-act="cpToggle" aria-label="Hide controls" class="cp-icon">${Icon('x', 'h-4 w-4')}</button>
      </header>
      <div class="cp-body">
        ${section('Current screen', html`
          <p class="font-medium text-fg">${screen.title || App.current.name || '—'}</p>
          <p class="cp-mono">${App.current.name} · #${App.current.path}</p>
          ${App.loading ? html`<p class="text-xs text-muted">Loading…</p>` : ''}`)}

        ${section('Jump to', html`<div class="cp-grid">
          ${AppConfig.jumps.map(([name, label, params]) => html`<button type="button" class="${small()}" data-act="cpJump" data-args="${args(name, params || {})}">${label}</button>`)}
          <button type="button" class="${small()}" data-act="cpJump" data-args="${args('login', {})}">Login</button>
        </div>`)}

        ${section('Data', html`<div class="flex flex-col gap-2">
          <button type="button" class="${small()}" data-act="cpDemo">Load full demo data</button>
          <button type="button" class="${small()}" data-act="cpNewUser">Start over as a new user</button>
          <button type="button" class="${small()}" data-act="cpEmpty">Empty data</button>
        </div>`)}

        ${section('Simulate', html`<div class="flex flex-col gap-2">
          <button type="button" class="${small(dev.netFailNext ? 'danger' : 'secondary')}" data-act="cpNetError">${dev.netFailNext ? 'Next page load fails — armed' : 'Network error (next page load)'}</button>
          <button type="button" class="${small(dev.failNext ? 'danger' : 'secondary')}" data-act="cpActionFail">${dev.failNext ? 'Next action fails — armed' : 'Action failure (next action)'}</button>
          <button type="button" class="${small('primary')}" data-act="cpReplyNow">Other side replies now</button>
          ${AppConfig.simulate.map((s) => html`<button type="button" class="${small()}" data-act="${s.act}">${s.label}</button>`)}
          ${toggle('cpOffline', dev.offline, 'Offline — everything fails')}
          <label class="cp-row"><span>Network delay</span>
            <select data-change="cpLatency" class="cp-select">${[0, 300, 700, 1500, 3000].map((ms) => html`<option value="${ms}" ${dev.latency === ms ? 'selected' : ''}>${ms === 0 ? 'None' : ms + ' ms'}</option>`)}</select>
          </label>
        </div>`)}

        ${section('Other app', html`
          <div class="cp-row">
            <span class="flex items-center gap-2"><span id="cp-dot" class="h-2 w-2 rounded-full ${online ? 'bg-success' : 'bg-muted'}"></span><span id="cp-presence">${other} ${online ? 'is open' : 'is closed'}</span></span>
            <a href="${Store.other}.html" target="uniemax-${Store.other}" class="text-xs font-semibold text-brand hover:underline">Open</a>
          </div>
          ${toggle('cpAutoReply', dev.autoReply, `When it is closed, answer for it after a few seconds`)}`)}

        ${section('Look', toggle('cpDark', Theme.mode === 'dark', 'Dark mode'))}

        ${section('Event log (both apps)', log.length === 0
          ? html`<p class="text-xs text-muted">Nothing yet.</p>`
          : html`<ol class="space-y-1.5">${log.map((e) => html`<li class="flex gap-2 text-xs">
              <span class="shrink-0 rounded-sm px-1 font-semibold ${e.app === 'admin' ? 'bg-accent/10 text-accent' : 'bg-brand-soft text-brand'}">${e.app}</span>
              <span class="min-w-0 flex-1 text-fg">${e.text}</span><span class="shrink-0 text-muted">${relative(e.at)}</span></li>`)}</ol>`)}
      </div>`)
  },

  /** Heartbeat update — no full render. */
  presence() {
    const dot = document.getElementById('cp-dot')
    const text = document.getElementById('cp-presence')
    if (!dot || !text) return
    const online = Store.isOnline()
    dot.className = `h-2 w-2 rounded-full ${online ? 'bg-success' : 'bg-muted'}`
    text.textContent = `${Store.other === 'admin' ? 'Admin console' : 'Seller app'} ${online ? 'is open' : 'is closed'}`
  },
}

Object.assign(Act, {
  cpToggle() {
    Store.ui.dev.open = !Store.ui.dev.open
    Act.commit()
  },
  /** Jump to a screen — signs in the demo user first if needed. */
  cpJump(name, params) {
    if (name !== 'login' && !Store.ui.session) Store.ui.session = { via: 'jump', at: new Date().toISOString() }
    if (name === 'login') Store.ui.session = null
    Store.ui.dialog = null
    App.go(name, params)
  },
  cpDemo() {
    Store.replaceWorld(demoState(), 'Full demo data loaded')
    UI.toast('Demo data loaded in both apps')
    Act.commit()
  },
  cpEmpty() {
    Store.replaceWorld(freshState(), 'Data emptied')
    UI.toast('Empty — no orders, tickets or payouts')
    Act.commit()
  },
  /** A brand-new start: empty world, this app signed out, its screen state reset. */
  cpNewUser() {
    Store.replaceWorld(freshState(), 'Started over as a new user')
    const keep = Store.ui.dev
    Object.assign(Store.ui, startUi(), { dev: keep, session: null })
    UI.toast('Started over — sign in again')
    Act.commit()
    App.reset('login')
  },
  cpNetError() {
    Store.ui.dev.netFailNext = !Store.ui.dev.netFailNext
    Act.commit()
  },
  cpActionFail() {
    Store.ui.dev.failNext = !Store.ui.dev.failNext
    Act.commit()
  },
  cpReplyNow() {
    Act[AppConfig.replyNow]()
  },
  cpOffline(on) {
    Store.ui.dev.offline = on
    Act.commit()
  },
  cpLatency(ms) {
    Store.ui.dev.latency = Number(ms)
    Act.commit()
  },
  cpAutoReply(on) {
    Store.ui.dev.autoReply = on
    Act.commit()
  },
  cpDark(on) {
    Theme.set(on ? 'dark' : 'light')
    Act.commit()
  },
})

// ===========================================================================
// Start-up
// ===========================================================================

/** This app's whole ui state when nothing is saved yet. */
const startUi = () => ({
  session: null,
  afterLogin: null,
  login: { tab: 'phone', step: 'phone', phone: '' },
  dev: freshDev(),
  ...AppConfig.freshUi(),
})

;(function start() {
  // Opened as a file, or the server did not inject index.css: explain, stop.
  if (!document.querySelector('style[type="text/tailwindcss"]')) {
    document.body.innerHTML =
      '<div style="font:15px system-ui;padding:32px;max-width:560px"><h1 style="font-size:20px;margin:0 0 8px">Start the prototype with start.cmd</h1>' +
      '<p>This page needs the tiny server (it loads the real app styles and lets the two apps sync). ' +
      'Double-click <b>prototype/start.cmd</b>, or run <code>node prototype/server.js</code> and open http://localhost:5180.</p></div>'
    document.body.style.visibility = 'visible'
    return
  }

  Store.init(App.kind, { freshUi: startUi, onRemote: (entry) => UI.toast(entry.text, 'remote') })
  ControlPanel.init()
  App.start({ root: document.getElementById('app'), view: AppConfig.view, home: AppConfig.home })

  // Give Tailwind a frame to compile the first render's classes, then show.
  requestAnimationFrame(() => requestAnimationFrame(() => (document.body.style.visibility = 'visible')))
})()
