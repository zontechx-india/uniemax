// State + persistence + business rules + the fake server.
//
//   Store.state (S())  the shared "world": stores, orders, tickets, payouts,
//                      notifications. Both apps read and write the SAME copy in
//                      localStorage, so a change in one tab shows in the other.
//   Store.ui           this app's own screen state: session, filters, drafts,
//                      open dialog, control-panel flags. Saved per app, not shared.
//
// Rules:
//   - Screens never change state. Every change goes through an Act.* function.
//   - An Act changes the world with Store.change(db => …) — usually one World.*
//     rule — and ends with Act.commit() (= Store.save() + App.refresh()).
//   - Store.change() re-reads the world from localStorage first, so a write never
//     overwrites what the other tab saved a moment ago.
//   - The other side (PaymentHub, support, the seller, a customer) is faked with
//     later(ms, fn). fn must check the item still exists and is still in the
//     expected status before changing it.
//
// Syncing two apps (same origin, served by server.js):
//   1. The world key  — the other tab's `storage` event reloads the state.
//   2. The event log  — every change appends {type, text, app}. The other tab
//                       shows new entries as toasts.
//   3. The heartbeat  — each app writes Date.now() every 2 s ("Admin app: open").
//
// Bump STATE_VERSION whenever the shape of the state changes: saved data with a
// different version is thrown away instead of breaking the screens.

const STATE_VERSION = 6
const STORE_KEY = `uniemax_proto_v${STATE_VERSION}`
const S = () => Store.state

/** The empty world: same shop and catalog, no orders, tickets or payouts. */
const freshState = () => buildWorld('empty')

// ===========================================================================
// Statuses — one map per entity: { KEY: { label, tone, admin, adminTone, desc } }
// `label`/`tone` = seller wording (stores/orderMeta.tsx); `admin`/`adminTone` =
// console wording (admin/ui/statusMeta.tsx).
// ===========================================================================

const STATUS = {
  order: {
    AWAITING_PAYMENT: { label: 'Awaiting payment', tone: 'neutral', admin: 'Awaiting payment', adminTone: 'neutral', desc: 'Online payment not finished — hidden from the seller' },
    PENDING: { label: 'Waiting', tone: 'pending', admin: 'Pending', adminTone: 'warning', desc: 'New — the seller has not confirmed it' },
    CONFIRMED: { label: 'Confirmed', tone: 'brand', admin: 'Confirmed', adminTone: 'info', desc: 'The seller accepted it' },
    PACKED: { label: 'Packed', tone: 'brand', admin: 'Packed', adminTone: 'info', desc: 'Ready to send' },
    SHIPPED: { label: 'Sent', tone: 'brand', admin: 'Shipped', adminTone: 'brand', desc: 'With the courier' },
    DELIVERED: { label: 'Delivered', tone: 'success', admin: 'Delivered', adminTone: 'success', desc: 'The customer has it' },
    CANCELLED: { label: 'Cancelled', tone: 'neutral', admin: 'Cancelled', adminTone: 'danger', desc: 'Stopped before it was sent' },
  },
  /** The only allowed forward order. Cancel is allowed until SHIPPED. */
  orderFlow: ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'],

  payout: {
    PENDING: { label: 'Not sent yet', tone: 'pending', admin: 'Pending', adminTone: 'warning', desc: 'Created, not sent to PaymentHub' },
    PROCESSING: { label: 'On its way', tone: 'pending', admin: 'Processing', adminTone: 'info', desc: 'PaymentHub is sending it' },
    SUCCEEDED: { label: 'Paid', tone: 'success', admin: 'Paid out', adminTone: 'success', desc: 'In the seller’s bank' },
    FAILED: { label: 'Failed', tone: 'danger', admin: 'Failed', adminTone: 'danger', desc: 'The bank refused it — can be tried again' },
    REVERSED: { label: 'Came back', tone: 'danger', admin: 'Reversed', adminTone: 'danger', desc: 'Sent, then returned by the bank' },
    CANCELLED: { label: 'Cancelled', tone: 'neutral', admin: 'Cancelled', adminTone: 'neutral', desc: 'Stopped by an admin' },
  },

  ticket: {
    OPEN: { label: 'Open', tone: 'warning', admin: 'Open', adminTone: 'warning', desc: 'Waiting for the UnieMax team' },
    IN_PROGRESS: { label: 'In progress', tone: 'info', admin: 'In progress', adminTone: 'info', desc: 'Picked up — set by the first reply' },
    RESOLVED: { label: 'Resolved', tone: 'success', admin: 'Resolved', adminTone: 'success', desc: 'Answered — a new reply re-opens it' },
    CLOSED: { label: 'Closed', tone: 'neutral', admin: 'Closed', adminTone: 'neutral', desc: 'No more replies' },
  },
  priority: {
    LOW: { label: 'Low', tone: 'neutral' },
    NORMAL: { label: 'Normal', tone: 'neutral' },
    HIGH: { label: 'High', tone: 'warning' },
    URGENT: { label: 'Urgent', tone: 'danger' },
  },
  category: {
    ORDERS: 'Orders & delivery', PAYMENTS: 'Payments & refunds', PAYOUTS: 'Payouts & bank account', PRODUCTS: 'Products & listings',
    STORE_SETUP: 'Store setup', STORE_REPORT: 'Report a store or seller', ACCOUNT: 'Account & sign-in', TECHNICAL: 'Something is broken', OTHER: 'Something else',
  },
}

// ===========================================================================
// Money rules (docs/seller-finance)
// ===========================================================================

const FEES = { platformPct: 2, gatewayPct: 2 }

/** What the seller gets for one order (platform fee always, gateway fee online). */
function sellerShare(order, fees = FEES) {
  const platform = (order.total * fees.platformPct) / 100
  const gateway = order.paymentMethod === 'ONLINE' ? (order.total * fees.gatewayPct) / 100 : 0
  return { platform, gateway, net: order.total - platform - gateway }
}

// ===========================================================================
// Selectors
// ===========================================================================

const Q = {
  store: (db, id) => db.stores.find((s) => s.id === id),
  myStore: (db) => db.stores.find((s) => s.id === db.me.storeId),
  owner: (db, store) => db.owners[store.ownerId],
  orders: (db, storeId) => db.orders.filter((o) => !storeId || o.storeId === storeId).sort((a, b) => b.placedAt.localeCompare(a.placedAt)),
  order: (db, id) => db.orders.find((o) => o.id === id),
  ticket: (db, id) => db.tickets.find((t) => t.id === id),
  tickets: (db, storeId) =>
    db.tickets.filter((t) => storeId === undefined || t.storeId === storeId).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
  payoutFor: (db, orderId) =>
    db.payouts.filter((p) => p.orderId === orderId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null,
  /** Delivered, paid online, and not paid out (or the last try failed). */
  toPay: (db) =>
    db.orders.filter((o) => {
      if (o.status !== 'DELIVERED' || o.paymentMethod !== 'ONLINE' || o.paymentStatus !== 'PAID') return false
      const p = Q.payoutFor(db, o.id)
      return !p || p.status === 'FAILED' || p.status === 'REVERSED'
    }),
  /** Counts for a store (ours from real rows; others from their static stats). */
  stats(db, store) {
    if (store.stats) return store.stats
    const orders = db.orders.filter((o) => o.storeId === store.id)
    const products = db.products.filter((p) => p.storeId === store.id)
    return {
      products: products.length,
      categories: new Set(products.map((p) => p.category)).size,
      orders: orders.length,
      revenue: orders.filter((o) => o.status !== 'CANCELLED').reduce((sum, o) => sum + o.total, 0),
    }
  },
  unread: (db, to) => db.notifications.filter((x) => x.to === to && !x.read).length,
}

// ===========================================================================
// Store — persistence and syncing
// ===========================================================================

const Store = {
  app: null,
  other: null,
  state: null,
  ui: null,
  lastSeq: 0,
  pending: [],
  onRemote: () => {},

  get uiKey() {
    return `${STORE_KEY}_ui_${this.app}`
  },
  get logKey() {
    return `${STORE_KEY}_log`
  },
  hbKey(app) {
    return `${STORE_KEY}_hb_${app}`
  },

  init(app, { freshUi, onRemote }) {
    this.app = app
    this.other = app === 'seller' ? 'admin' : 'seller'
    this.onRemote = onRemote || (() => {})
    this.state = this.load() || this.writeState(demoState())
    const saved = this.read(this.uiKey) || {}
    this.ui = { ...freshUi(), ...saved, dev: { ...freshUi().dev, ...(saved.dev || {}) }, busy: {}, errors: {}, dialog: null, popover: null }
    this.lastSeq = this.readLog().reduce((max, e) => Math.max(max, e.seq), 0)

    window.addEventListener('storage', (event) => this.onStorage(event))
    this.beat()
    setInterval(() => this.beat(), 2000)
    window.addEventListener('pagehide', () => this.remove(this.hbKey(this.app)))
  },

  // ---- localStorage, every access guarded (private windows can throw) ----
  read(key) {
    try {
      const value = localStorage.getItem(key)
      return value ? JSON.parse(value) : null
    } catch {
      return null
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (err) {
      console.warn('Could not save', key, err)
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },

  /** The saved world, or null when missing or saved by another STATE_VERSION. */
  load() {
    const db = this.read(STORE_KEY)
    return db && db.version === STATE_VERSION ? db : null
  },
  writeState(db) {
    db.version = STATE_VERSION
    this.write(STORE_KEY, db)
    return db
  },
  /** Save this app's ui state (the world is saved by change()). */
  save() {
    const { busy, errors, dialog, popover, typing, ...keep } = this.ui
    this.write(this.uiKey, keep)
  },
  readLog() {
    return this.read(this.logKey) || []
  },

  /**
   * Change the shared world. `fn(db)` changes a FRESH copy read from storage.
   * Call Store.emit() inside it to tell the other app what happened.
   */
  change(fn) {
    const db = this.load() || this.state
    const result = fn(db)
    db.rev = (db.rev || 0) + 1
    this.state = this.writeState(db)
    this.flushLog()
    return result
  },

  emit(type, text, extra = {}) {
    this.pending.push({ type, text, ...extra })
  },
  flushLog() {
    if (this.pending.length === 0) return
    const log = this.readLog()
    let seq = log.reduce((max, e) => Math.max(max, e.seq), 0)
    for (const entry of this.pending) log.push({ ...entry, seq: ++seq, at: new Date().toISOString(), app: this.app })
    this.pending = []
    this.lastSeq = seq
    this.write(this.logKey, log.slice(-200))
  },

  /** Replace the whole world (control panel). Both apps follow. */
  replaceWorld(db, text) {
    this.pending.push({ type: 'world.replace', text })
    this.state = this.writeState(db)
    this.flushLog()
  },

  onStorage(event) {
    if (event.key === STORE_KEY) {
      this.state = this.load() || this.state
      App.refresh()
    } else if (event.key === this.logKey) {
      for (const entry of this.readLog()) {
        if (entry.seq <= this.lastSeq) continue
        this.lastSeq = entry.seq
        if (entry.app !== this.app) this.onRemote(entry)
      }
    } else if (event.key === this.hbKey(this.other)) {
      ControlPanel.presence()
    } else if (event.key === 'uniemax-theme') {
      document.documentElement.dataset.theme = event.newValue === 'dark' ? 'dark' : 'light'
      App.refresh()
    }
  },

  beat() {
    try {
      localStorage.setItem(this.hbKey(this.app), String(Date.now()))
    } catch {
      /* ignore */
    }
    if (typeof ControlPanel !== 'undefined') ControlPanel.presence()
  },
  /** Is the other app open in a tab right now? */
  isOnline(app = this.other) {
    return Date.now() - Number(this.read(this.hbKey(app)) || 0) < 6000
  },
  nextId(db, name) {
    db.seq[name] = (db.seq[name] || 0) + 1
    return db.seq[name]
  },
}

// ===========================================================================
// Act — the base. Each app adds its own with Object.assign(Act, {...}).
// ===========================================================================

const Act = {
  /** Every Act ends here: save, then re-render. */
  commit() {
    Store.save()
    App.refresh()
  },

  /** Add an in-app notification (inside Store.change). to: 'seller' | 'admin'. */
  notify(db, to, title, body, go) {
    const id = `n${Store.nextId(db, 'notif')}`
    db.notifications.unshift({ id, to, title, body, go, at: new Date().toISOString(), read: false })
  },

  closeDialog() {
    Store.ui.dialog = null
    Act.commit()
  },
  /** The "yes" of UI.confirm: close, then run the action it was opened for. */
  confirmYes(act, ...rest) {
    Store.ui.dialog = null
    Act.commit()
    Act[act](...rest)
  },
  retryLoad() {
    App.load()
  },
  toggleTheme() {
    Theme.toggle()
    Act.commit()
  },
  openNote(id) {
    let go = null
    Store.change((db) => {
      const n = db.notifications.find((x) => x.id === id)
      if (n) {
        n.read = true
        go = n.go
      }
    })
    Store.ui.popover = null
    Act.commit()
    if (go) App.go(go)
  },
  readAll() {
    Store.change((db) => db.notifications.filter((n) => n.to === Store.app).forEach((n) => (n.read = true)))
    Act.commit()
  },
  togglePopover(name) {
    Store.ui.popover = Store.ui.popover === name ? null : name
    Act.commit()
  },
  signOut() {
    Store.ui.session = null
    Store.ui.popover = null
    Act.commit()
    App.reset('login')
  },
}

// ===========================================================================
// The fake server
// ===========================================================================

/**
 * Do `work` like a network request: ui.busy[key] while waiting (buttons show
 * "Saving…"), fail when the control panel says so, toast the result, and
 * always end with Act.commit(). Returns work()'s result, or undefined on failure.
 */
async function run(key, work, { ok, ms } = {}) {
  if (Store.ui.busy[key]) return
  Store.ui.busy[key] = true
  Store.ui.errors[key] = null
  Act.commit()
  try {
    const result = await new Promise((resolve, reject) => {
      setTimeout(() => {
        const dev = Store.ui.dev
        if (dev.offline) return reject(new Error('You are offline. Check your internet and try again.'))
        if (dev.failNext) {
          dev.failNext = false
          return reject(new Error('Something went wrong on our side. Please try again.'))
        }
        try {
          resolve(work())
        } catch (err) {
          reject(err)
        }
      }, ms ?? Store.ui.dev.latency)
    })
    if (ok) UI.toast(typeof ok === 'function' ? ok(result) : ok)
    return result
  } catch (err) {
    Store.ui.errors[key] = err.message
    UI.toast(err.message, 'danger')
  } finally {
    Store.ui.busy[key] = false
    Act.commit()
  }
}

/** The other side answers later. fn must re-check what it changes. */
function later(ms, fn) {
  setTimeout(() => {
    try {
      fn()
    } catch (err) {
      console.warn('Simulated reply skipped:', err.message)
    }
    Act.commit()
  }, ms)
}

// ===========================================================================
// World — the business rules. One function per thing that can happen. Each
// checks the item exists and is in the expected status, changes it, logs it
// (Store.emit) and notifies the other side (Act.notify).
// ===========================================================================

const World = {
  // ---- orders ----
  newOrder(db) {
    const store = Q.myStore(db)
    const names = ['Harini Subramanian', 'Swathi Ganesh', 'Rekha Thomas', 'Bhavana Rao', 'Uma Shankar', 'Ishita Varma']
    const name = names[Math.floor(Math.random() * names.length)]
    const visible = db.products.filter((p) => p.storeId === store.id && p.visible && p.stock > 0)
    const picked = visible.sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 2))
    if (picked.length === 0) throw new Error('No visible product in stock to order.')
    const items = picked.map((p) => {
      const v = Catalog.firstInStock(p)
      return { productId: p.id, variantId: v.id, variantName: v.isDefault ? null : Catalog.variantLabel(v), sku: v.sku, name: p.name, qty: 1, price: v.price, tone: p.tone }
    })
    const subtotal = items.reduce((sum, i) => sum + i.price, 0)
    const shipping = subtotal >= 1499 ? 0 : 60
    const number = Store.nextId(db, 'order')
    const pay = Math.random() < 0.6 ? 'ONLINE' : 'COD'
    const order = {
      id: `ord_${number}`, number: newOrderNumber(db), storeId: store.id, // 8 digits, as the real app since v1.125.0
      customer: { name, phone: '+91 98765 4' + String(number).slice(-4), email: null, address: '9, Lake Road, T. Nagar, Chennai, Tamil Nadu 600017' },
      items, subtotal, shipping, total: subtotal + shipping,
      paymentMethod: pay, paymentStatus: pay === 'ONLINE' ? 'PAID' : 'PENDING',
      status: 'PENDING', fulfilment: 'DELIVERY', placedAt: new Date().toISOString(),
      confirmedAt: null, packedAt: null, shippedAt: null, deliveredAt: null, cancelledAt: null, cancelReason: null, courier: null, tracking: null,
    }
    for (const item of items) Catalog.take(db, item.productId, item.variantId, item.qty)
    db.orders.unshift(order)
    Act.notify(db, 'seller', `New order ${order.number}`, `${name} · ${money(order.total)}`, `/orders/${order.id}`)
    Store.emit('order.new', `New order ${order.number} for ${store.name}`, { ref: order.id })
    return order
  },

  /** The seller's next step on an order. */
  NEXT: {
    PENDING: { to: 'CONFIRMED', at: 'confirmedAt', label: 'Confirm order', done: 'Order confirmed' },
    CONFIRMED: { to: 'PACKED', at: 'packedAt', label: 'Mark as packed', done: 'Marked as packed' },
    PACKED: { to: 'SHIPPED', at: 'shippedAt', label: 'Mark as sent', done: 'Order sent' },
    SHIPPED: { to: 'DELIVERED', at: 'deliveredAt', label: 'Mark as delivered', done: 'Marked as delivered' },
  },

  advanceOrder(db, orderId, extra = {}) {
    const order = Q.order(db, orderId)
    const step = order && this.NEXT[order.status]
    if (!step) throw new Error('This order has already moved on. Refresh to see it.')
    order.status = step.to
    order[step.at] = new Date().toISOString()
    if (step.to === 'SHIPPED') {
      order.courier = extra.courier || 'DTDC'
      order.tracking = extra.tracking || null
    }
    if (step.to === 'DELIVERED' && order.paymentMethod === 'COD') order.paymentStatus = 'PAID'
    Store.emit('order.status', `${order.number}: ${step.done.toLowerCase()}`, { ref: order.id })
    return step
  },

  cancelOrder(db, orderId, reason) {
    const order = Q.order(db, orderId)
    if (!order || ['SHIPPED', 'DELIVERED', 'CANCELLED'].includes(order.status)) throw new Error('A sent order can no longer be cancelled.')
    order.status = 'CANCELLED'
    order.cancelledAt = new Date().toISOString()
    order.cancelReason = reason || null
    if (order.paymentMethod === 'ONLINE') order.paymentStatus = 'REFUNDED'
    for (const item of order.items) {
      if (Catalog.product(db, item.productId)) Catalog.take(db, item.productId, item.variantId, -item.qty)
    }
    Store.emit('order.cancel', `${order.number} was cancelled by the seller`, { ref: order.id })
  },

  // ---- payouts: admin → PaymentHub → seller ----
  startPayout(db, orderId) {
    const order = Q.order(db, orderId)
    if (!order || !Q.toPay(db).some((o) => o.id === orderId)) throw new Error('This order has nothing left to pay.')
    const number = Store.nextId(db, 'payout')
    const payout = {
      id: `po_${number}`, number: `PO-${number}`, storeId: order.storeId, orderId,
      amount: sellerShare(order, db.fees).net, status: 'PROCESSING', method: 'PAYMENTHUB',
      ref: 'PH' + Math.random().toString(36).slice(2, 10).toUpperCase(), createdAt: new Date().toISOString(), paidAt: null, failReason: null,
    }
    db.payouts.unshift(payout)
    if (order.storeId === db.me.storeId) Act.notify(db, 'seller', 'Payout on its way', `${moneyExact(payout.amount)} for ${order.number}`, '/earnings')
    Store.emit('payout.start', `Payout ${payout.number} started for ${order.number}`, { ref: payout.id })
    return payout
  },

  /** PaymentHub's answer. Skipped if the payout is gone or no longer PROCESSING. */
  finishPayout(db, payoutId, ok) {
    const payout = db.payouts.find((p) => p.id === payoutId)
    if (!payout || payout.status !== 'PROCESSING') return
    const order = Q.order(db, payout.orderId)
    payout.status = ok ? 'SUCCEEDED' : 'FAILED'
    payout.paidAt = ok ? new Date().toISOString() : null
    payout.failReason = ok ? null : 'Bank rejected the transfer (account frozen). Ask the seller to check their account.'
    if (payout.storeId === db.me.storeId) {
      Act.notify(db, 'seller', ok ? 'Money sent to your bank' : 'Payout failed', `${moneyExact(payout.amount)} for ${order ? order.number : payout.number}`, '/earnings')
    }
    Store.emit(ok ? 'payout.ok' : 'payout.fail', `Payout ${payout.number} ${ok ? 'paid' : 'failed'}`, { ref: payout.id })
  },

  // ---- support tickets ----
  createTicket(db, { subject, category, body, email, phone }) {
    const store = Q.myStore(db)
    const owner = Q.owner(db, store)
    const number = Store.nextId(db, 'ticket')
    const at = new Date().toISOString()
    const ticket = {
      id: `tk_${number}`, number: `T-${number}`, storeId: store.id, customerId: owner.id,
      subject, category, status: 'OPEN', priority: 'NORMAL', contactEmail: email || null, contactPhone: phone || null, createdAt: at, lastMessageAt: at,
      messages: [{ id: `m${Store.nextId(db, 'msg')}`, author: 'SELLER', authorName: owner.name, body, at }],
    }
    db.tickets.unshift(ticket)
    Act.notify(db, 'admin', `New ticket from ${store.name}`, subject, `/support/${ticket.id}`)
    Store.emit('ticket.new', `${store.name} asked: "${subject}"`, { ref: ticket.id })
    return ticket
  },

  reply(db, ticketId, author, authorName, body) {
    const ticket = Q.ticket(db, ticketId)
    if (!ticket) throw new Error('This ticket no longer exists.')
    if (ticket.status === 'CLOSED') throw new Error('This ticket is closed and takes no further replies.')
    const at = new Date().toISOString()
    ticket.messages.push({ id: `m${Store.nextId(db, 'msg')}`, author, authorName, body, at })
    ticket.lastMessageAt = at
    if (author === 'ADMIN') {
      if (ticket.status === 'OPEN') ticket.status = 'IN_PROGRESS' // replying picks it up
      if (ticket.storeId === db.me.storeId) Act.notify(db, 'seller', 'Reply from UnieMax', ticket.subject, `/support/${ticket.id}`)
      Store.emit('ticket.reply', `Support replied on ${ticket.number}`, { ref: ticket.id })
    } else {
      if (ticket.status === 'RESOLVED') ticket.status = 'OPEN' // a new reply re-opens it
      Act.notify(db, 'admin', `New reply on ${ticket.number}`, ticket.subject, `/support/${ticket.id}`)
      Store.emit('ticket.reply', `Seller replied on ${ticket.number}`, { ref: ticket.id })
    }
  },

  setTicket(db, ticketId, patch) {
    const ticket = Q.ticket(db, ticketId)
    if (!ticket) throw new Error('This ticket no longer exists.')
    Object.assign(ticket, patch)
    if (patch.status && ticket.storeId === db.me.storeId) {
      const word = STATUS.ticket[patch.status].label
      Act.notify(db, 'seller', `Your question is now ${word.toLowerCase()}`, ticket.subject, `/support/${ticket.id}`)
      Store.emit('ticket.status', `${ticket.number} is now ${word}`, { ref: ticket.id })
    }
  },

  // ---- store moderation ----
  suspend(db, storeId, on, reason) {
    const store = Q.store(db, storeId)
    if (!store) throw new Error('This store no longer exists.')
    if (!!store.suspendedAt === on) throw new Error(on ? 'This store is already suspended.' : 'This store is not suspended.')
    store.suspendedAt = on ? new Date().toISOString() : null
    store.suspendedReason = on ? reason || null : null
    if (storeId === db.me.storeId) {
      Act.notify(db, 'seller', on ? 'Your shop has been paused by UnieMax' : 'Your shop is live again',
        on ? reason || 'Contact UnieMax support to know more.' : 'Customers can see your shop and order again.', on ? '/support' : '/')
    }
    Store.emit(on ? 'store.suspend' : 'store.unsuspend', `${store.name} ${on ? 'suspended' : 'suspension lifted'}`, { ref: storeId })
  },

  verify(db, storeId, on, note) {
    const store = Q.store(db, storeId)
    if (!store) throw new Error('This store no longer exists.')
    store.verifiedAt = on ? new Date().toISOString() : null
    store.verifyNote = on ? note || null : null
    if (storeId === db.me.storeId) {
      Act.notify(db, 'seller', on ? 'Your shop is verified' : 'Verification removed', on ? 'Customers now see the Verified badge.' : note || '', '/business')
    }
    Store.emit(on ? 'store.verify' : 'store.unverify', `${store.name} ${on ? 'marked verified' : 'verification removed'}`, { ref: storeId })
  },

  // ---- catalog ----
  toggleProduct(db, productId) {
    const p = db.products.find((x) => x.id === productId)
    if (!p) throw new Error('This product no longer exists.')
    p.visible = !p.visible
    Store.emit('product.visible', `${p.name.split(' — ')[0]} is now ${p.visible ? 'visible' : 'hidden'}`, { ref: p.id })
    return p
  },
}
