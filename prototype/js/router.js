// Screen stack navigation + rendering + event wiring.
//
// Register a screen:
//   App.reg('orders', {
//     path: '/orders',              the URL hash (#/orders). ':id' parts become params.
//     title: 'Orders',              shown in the control panel and the tab title
//     render(params, query) {...},  returns html`` (required)
//     mount(params) {...},          optional: runs after render; may return a cleanup
//     tab: true,                    show the seller's phone tab bar on this screen
//     skeleton(params) {...},       optional: shown while the screen "loads" (fake delay)
//     auth: false,                  optional: screen works when signed out (login)
//   })
//
// Navigate:
//   App.go('order', { id })     push        App.back()            pop
//   App.replace('orders')       swap top    App.reset('dashboard') clear the stack
//   App.go('/orders?status=PENDING')   a path works too (links, notifications)
//   App.set('ordersQuery', 'anj')      set a ui value + refresh
//   App.refresh()                       re-render the current screen
//
// Behaviour is attached by ATTRIBUTE, once, at the document level, so a
// re-render never loses a listener:
//   <a href="#/orders/ord_1">            plain navigation (a path)
//   data-go="order" data-args='[{"id":"ord_1"}]'   → App.go(name, params)
//   data-back                            → App.back()
//   data-act="confirmOrder" data-args='["ord_1"]'  → Act.confirmOrder("ord_1")
//   data-submit="sendReply"              form submit → Act.sendReply(formValues, ...args)
//   data-change="setStatus"              select/checkbox → Act.setStatus(value, ...args)
//   data-model="drafts.reply"            input → writes Store.ui.drafts.reply (no re-render)
//   data-search="ordersQuery"            input → Act.ordersQuery(value, ...args), after 250 ms
//   data-backdrop                        a click ON it closes the open dialog

const App = {
  kind: document.documentElement.dataset.app, // 'seller' | 'admin'
  screens: {},
  home: null,
  current: { name: null, params: {}, query: {}, path: '/' },
  depth: 0,
  loading: false,
  loadError: null,
  loadSeq: 0,
  cleanup: null,
  root: null,
  view: () => '',

  reg(name, def) {
    const keys = (def.path.match(/:\w+/g) || []).map((k) => k.slice(1))
    const re = new RegExp('^' + def.path.replace(/:\w+/g, '([^/]+)') + '/?$')
    this.screens[name] = { name, keys, re, ...def }
  },

  /** '/orders/:id' + { id } → '/orders/ord_1' */
  pathFor(name, params = {}) {
    const screen = this.screens[name]
    if (!screen) throw new Error(`No screen called "${name}"`)
    return screen.path.replace(/:(\w+)/g, (_, key) => encodeURIComponent(params[key]))
  },

  toPath(target, params) {
    return typeof target === 'string' && target.startsWith('/') ? target : this.pathFor(target, params)
  },

  go(target, params = {}, { replace = false } = {}) {
    const url = '#' + this.toPath(target, params)
    if (replace) {
      history.replaceState(null, '', url)
      this.resolve()
    } else {
      this.depth++
      this.saveDepth()
      if (location.hash === url) this.resolve()
      else location.hash = url
    }
    window.scrollTo(0, 0)
  },
  replace(target, params = {}) {
    this.go(target, params, { replace: true })
  },
  reset(target = this.home, params = {}) {
    this.depth = 0
    this.saveDepth()
    this.go(target, params, { replace: true })
  },
  back() {
    if (this.depth > 0) {
      this.depth--
      this.saveDepth()
      history.back()
    } else {
      // Nothing to pop (a link opened fresh): go to the screen's parent.
      const screen = this.screens[this.current.name]
      this.reset(screen && screen.parent ? screen.parent : this.home)
    }
  },
  set(key, value) {
    Store.ui[key] = value
    Act.commit()
  },
  refresh() {
    this.render()
  },
  saveDepth() {
    try {
      sessionStorage.setItem(`${STORE_KEY}_depth_${this.kind}`, String(this.depth))
    } catch {
      /* ignore */
    }
  },

  /** Is `path` the current section? ('/orders' is on for '/orders/123'.) */
  isOn(path, exact = false) {
    const p = this.current.path
    if (exact || path === '/') return p === path
    return p === path || p.startsWith(path + '/')
  },

  // ---- resolving the hash to a screen ----
  resolve() {
    const hash = location.hash.replace(/^#/, '') || '/'
    const [path, search = ''] = hash.split('?')
    const query = Object.fromEntries(new URLSearchParams(search))
    for (const screen of Object.values(this.screens)) {
      const match = screen.re.exec(path)
      if (!match) continue
      const params = {}
      screen.keys.forEach((key, i) => (params[key] = decodeURIComponent(match[i + 1])))

      // Signed out → login (keeps where you wanted to go for after).
      if (screen.auth !== false && !Store.ui.session) {
        Store.ui.afterLogin = hash
        this.reset('login')
        return
      }

      const changed = screen.name !== this.current.name || JSON.stringify(params) !== JSON.stringify(this.current.params)
      if (changed) {
        this.loadSeq++ // a new screen: any load still running for the old one is ignored
        this.loading = false
        this.loadError = null
        if (this.cleanup) {
          this.cleanup()
          this.cleanup = null
        }
      }
      this.current = { name: screen.name, params, query, path }
      Store.ui.popover = null
      if (changed && screen.skeleton) this.load()
      else Act.commit()
      return
    }
    this.reset(this.home)
  },

  /**
   * Pretend to fetch the screen's data: show its skeleton for the network
   * delay, then the screen — or an error with Retry when the control panel
   * says the network is down.
   */
  load() {
    this.loading = true
    this.loadError = null
    this.render()
    const seq = ++this.loadSeq
    setTimeout(() => {
      if (seq !== this.loadSeq) return // left the screen (or retried) meanwhile
      const dev = Store.ui.dev
      if (dev.offline || dev.netFailNext) {
        dev.netFailNext = false
        this.loadError = dev.offline
          ? 'You are offline. Check your internet and try again.'
          : 'This page could not load. Please try again.'
      }
      this.loading = false
      Act.commit()
    }, Store.ui.dev.latency)
  },

  /** The current screen's body: skeleton, error, or the screen itself. */
  body() {
    const screen = this.screens[this.current.name]
    if (this.loading && screen.skeleton) return screen.skeleton(this.current.params)
    if (this.loadError) return UI.errorState(this.loadError)
    return screen.render(this.current.params, this.current.query)
  },

  // ---- rendering ----
  start({ root, view, home }) {
    this.root = root
    this.view = view
    this.home = home
    try {
      this.depth = Number(sessionStorage.getItem(`${STORE_KEY}_depth_${this.kind}`) || 0)
    } catch {
      this.depth = 0
    }
    this.wire()
    window.addEventListener('hashchange', () => this.resolve())
    this.resolve()
  },

  /**
   * Re-draw everything. Keeps the focused field, its caret and its text, so a
   * change arriving from the other tab never interrupts typing.
   */
  render() {
    if (!this.root || !this.current.name) return
    const active = document.activeElement
    const key = active && (active.id || active.getAttribute('name') || active.dataset.model)
    const caret = active && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null
    const typed = active && 'value' in active ? active.value : null
    // Scrolling lists (data-keep-scroll="name") keep their place across a re-render,
    // so adding an item from a long list does not jump back to the top.
    const scrolls = {}
    this.root.querySelectorAll('[data-keep-scroll]').forEach((el) => (scrolls[el.dataset.keepScroll] = el.scrollTop))

    this.root.innerHTML = String(this.view())
    this.root.querySelectorAll('[data-keep-scroll]').forEach((el) => {
      if (scrolls[el.dataset.keepScroll]) el.scrollTop = scrolls[el.dataset.keepScroll]
    })

    const screen = this.screens[this.current.name]
    if (screen.mount && !this.loading && !this.loadError && !this.cleanup) {
      const cleanup = screen.mount(this.current.params)
      if (typeof cleanup === 'function') this.cleanup = cleanup
    }

    if (key) {
      const el =
        this.root.querySelector(`#${CSS.escape(key)}`) ||
        this.root.querySelector(`[name="${CSS.escape(key)}"]`) ||
        this.root.querySelector(`[data-model="${CSS.escape(key)}"]`)
      if (el) {
        if (typed !== null && 'value' in el && el.type !== 'checkbox' && el.tagName !== 'SELECT') el.value = typed
        el.focus({ preventScroll: true })
        if (caret && el.setSelectionRange) {
          try {
            el.setSelectionRange(caret[0], caret[1])
          } catch {
            /* not a text field */
          }
        }
      }
    }
    ControlPanel.render()
    document.title = `${screen.title || screen.name} · UnieMax ${{ admin: 'Admin', seller: 'seller', customer: 'bill' }[this.kind]} · prototype`
  },

  // ---- event wiring ----
  call(name, values) {
    const fn = Act[name]
    if (!fn) {
      console.warn('No Act called', name)
      return
    }
    fn(...values)
  },

  argsOf(el) {
    try {
      return JSON.parse(el.dataset.args || '[]')
    } catch {
      return []
    }
  },

  wire() {
    document.addEventListener('click', (event) => {
      if (event.target.matches('[data-backdrop]')) {
        Store.ui.dialog = null
        Act.commit()
        return
      }
      const el = event.target.closest('[data-go],[data-back],[data-act]')
      if (!el || el.disabled) return
      if (el.dataset.go !== undefined) {
        event.preventDefault()
        const [params] = this.argsOf(el)
        this.go(el.dataset.go, params || {})
      } else if (el.dataset.back !== undefined) {
        event.preventDefault()
        this.back()
      } else if (el.dataset.act && el.tagName !== 'SELECT' && el.type !== 'checkbox') {
        // A real link with an action still navigates; href="#" does not.
        const href = el.tagName === 'A' ? el.getAttribute('href') : null
        if (!href || href === '#') event.preventDefault()
        this.call(el.dataset.act, this.argsOf(el))
      }
    })

    // Close an open dropdown (marked data-popover="name") on a click outside it.
    document.addEventListener('click', (event) => {
      const open = Store.ui.popover
      if (open && !event.target.closest(`[data-popover="${open}"]`)) {
        Store.ui.popover = null
        Act.commit()
      }
    })

    document.addEventListener('submit', (event) => {
      const form = event.target.closest('form[data-submit]')
      if (!form) return
      event.preventDefault()
      const values = Object.fromEntries(new FormData(form))
      this.call(form.dataset.submit, [values, ...this.argsOf(form)])
    })

    document.addEventListener('change', (event) => {
      const el = event.target.closest('[data-change]')
      if (!el) return
      const value = el.type === 'checkbox' ? el.checked : el.value
      this.call(el.dataset.change, [value, ...this.argsOf(el)])
    })

    const timers = {}
    document.addEventListener('input', (event) => {
      const el = event.target
      if (el.dataset.model) {
        const path = el.dataset.model.split('.')
        let at = Store.ui
        path.slice(0, -1).forEach((part) => (at = at[part] = at[part] || {}))
        at[path[path.length - 1]] = el.value
      }
      if (el.dataset.search) {
        const key = el.dataset.search + (el.dataset.args || '')
        clearTimeout(timers[key])
        timers[key] = setTimeout(() => this.call(el.dataset.search, [el.value, ...this.argsOf(el)]), 250)
      }
    })

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && Store.ui.dialog) {
        Store.ui.dialog = null
        Act.commit()
      }
    })
  },
}
