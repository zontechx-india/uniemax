// Bills — "Create a new bill". Shared by all apps. NEW: not in the real app yet.
//
// A bill is an order the SELLER fills in, from the store's own products.
//   LINK  the seller shares the bill link from THEIR OWN WhatsApp (or copies
//         it). The customer opens it, previews, confirms their phone (OTP),
//         adds the address and pays online. Only then does it become a normal
//         order (paid online, Confirmed) — stock is touched at that moment.
//   CASH  the seller already has the money. The order is made at once and
//         marked paid; the bill link works as a receipt.
//
// Why the seller shares it (and not the UnieMax WhatsApp number): no Meta
// template approval, no risk to the shared number, and the customer sees a
// number they know. Sending from UnieMax's number can come later.
//
//   db.bills = [{
//     id, number           number = the 8-digit order number the order will use
//     storeId, token       token  = the link: uniemax.com/b/<token>
//     customer  { name, phone, address }
//     items     [{ productId, variantId, name, variantName, sku, qty, price, tone, oneOff }]
//               prices are FIXED when the bill is made
//     subtotal, shipping, discount { type: AMOUNT|PERCENT, value }, discountAmount, total
//     note, payWay LINK|CASH, handover DELIVERY|IN_SHOP
//     status    OPEN | PAID | CANCELLED     (EXPIRED is worked out from expiresAt)
//     createdAt, expiresAt, sharedAt, openedAt, paidAt, cancelledAt, cancelReason
//     shares    [{ at, via: WHATSAPP|COPY|SHARE }]   what the seller did
//     payment   { method: UPI|CARD|NETBANKING, ref } when paid online
//     orderId, createdBy
//   }]

STATUS.bill = {
  OPEN: { label: 'Waiting for payment', tone: 'pending', admin: 'Open', adminTone: 'warning', desc: 'Made, not paid yet' },
  PAID: { label: 'Paid', tone: 'success', admin: 'Paid', adminTone: 'success', desc: 'Became an order' },
  EXPIRED: { label: 'Link expired', tone: 'neutral', admin: 'Expired', adminTone: 'neutral', desc: 'Not paid in time — the link no longer takes payment' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', admin: 'Cancelled', adminTone: 'danger', desc: 'Stopped by the seller before payment' },
}
/** Where an open bill is: the seller has not shared it, shared it, or the customer opened it. */
const BILL_STAGE = {
  NEW: 'Not shared yet',
  SHARED: 'Shared · not opened',
  OPENED: 'Opened · not paid',
}
const PAY_WAY = { LINK: 'Payment link', CASH: 'Paid in cash' }
const PAY_METHOD = { UPI: 'UPI', CARD: 'Card', NETBANKING: 'Net banking' }
const BILL_EXPIRY_DAYS = [1, 3, 7]
const SHARE_VIA = { WHATSAPP: 'WhatsApp', COPY: 'Copied link', SHARE: 'Share menu' }

// Icons this feature needs that the seller set does not have (lucide paths, drawn here).
Object.assign(SELLER_ICONS, {
  receipt: '<path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z" /> <path d="M9 8h6M9 12h6M9 16h3" />',
  minus: '<path d="M5 12h14" />',
  trash: '<path d="M4 7h16M10 11v6M14 11v6" /> <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3" />',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2" /> <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2" /> <circle cx="12" cy="12" r="2.5" /> <path d="M6 12h.01M18 12h.01" />',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.8 1.7" /> <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />',
  clock: '<circle cx="12" cy="12" r="9" /> <path d="M12 7v5l3 2" />',
  external: '<path d="M15 3h6v6M10 14 21 3" /> <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2" /> <path d="M8 11V7a4 4 0 0 1 8 0v4" />',
  layers: '<path d="m12 3 9 5-9 5-9-5z" /> <path d="m3 13 9 5 9-5" />',
})
ADMIN_ICONS.receipt = '<path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z" /><path d="M9 8h6M9 12h6M9 16h3" />'

// ===========================================================================
// Selectors + money
// ===========================================================================

const Bills = {
  all: (db, storeId) => (db.bills || []).filter((b) => !storeId || b.storeId === storeId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  get: (db, id) => (db.bills || []).find((b) => b.id === id) || null,
  byToken: (db, token) => (db.bills || []).find((b) => b.token === token) || null,

  /** The status to show — an open bill past its time is EXPIRED, whatever was saved. */
  status(bill, now = Date.now()) {
    if (bill.status === 'OPEN' && bill.payWay === 'LINK' && new Date(bill.expiresAt).getTime() <= now) return 'EXPIRED'
    return bill.status
  },
  open: (bill) => Bills.status(bill) === 'OPEN',
  stage: (bill) => (bill.openedAt ? 'OPENED' : bill.sharedAt ? 'SHARED' : 'NEW'),

  /** What the customer sees ("uniemax.com/b/k3xp9q"). */
  link: (bill) => `uniemax.com/b/${bill.token}`,
  /** The same page in this prototype, so a tester can open it. */
  protoUrl: (bill) => `${location.origin}/pay.html#/b/${bill.token}`,
  /** "4820 3917" — read out in two halves on a phone call. */
  spaced: (n) => (/^\d{8}$/.test(n) ? `${n.slice(0, 4)} ${n.slice(4)}` : n),
  digits: (phone) => String(phone || '').replace(/\D/g, '').slice(-10),
  phone(raw) {
    const d = Bills.digits(raw)
    return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : raw
  },
  who: (bill) => bill.customer.name || bill.customer.phone,
  itemCount: (bill) => bill.items.reduce((s, i) => s + i.qty, 0),

  /**
   * The bill's money. Delivery left blank follows the store's delivery rate
   * (free above its limit). The discount never goes over the items.
   */
  totals(db, { lines, shipping, discountType, discount, handover }) {
    const rate = Q.myStore(db).settings.rate
    const subtotal = lines.reduce((sum, l) => sum + l.qty * l.price, 0)
    const autoShip = subtotal === 0 || subtotal >= rate.freeAbove ? 0 : rate.amount
    const ship = handover === 'IN_SHOP' ? 0 : shipping === '' || shipping === null || shipping === undefined ? autoShip : Math.max(0, Math.round(Number(shipping) || 0))
    const raw = Math.max(0, Number(discount) || 0)
    const off = Math.min(subtotal, Math.round(discountType === 'PERCENT' ? (subtotal * Math.min(raw, 100)) / 100 : raw))
    return { subtotal, shipping: ship, autoShip, discountAmount: off, total: subtotal - off + ship }
  },

  /** A past customer of this store with the same phone ("Returning customer"). */
  knownCustomer(db, storeId, phone) {
    const d = Bills.digits(phone)
    if (d.length !== 10) return null
    const mine = Q.orders(db, storeId).filter((o) => Bills.digits(o.customer.phone) === d)
    return mine.length ? { name: mine[0].customer.name, address: mine.find((o) => o.customer.address)?.customer.address || null, orders: mine.length } : null
  },

  /** The text the seller sends from their own WhatsApp. */
  message(db, bill) {
    const store = Q.store(db, bill.storeId)
    const hi = bill.customer.name ? `Hi ${bill.customer.name.split(' ')[0]}` : 'Hi'
    const items = plural(Bills.itemCount(bill), 'item')
    if (bill.payWay === 'CASH') {
      return `${hi}, thank you for shopping at ${store.name}. Your bill ${bill.number} — ${items}, ${money(bill.total)}, paid in cash: ${Bills.link(bill)}`
    }
    return `${hi}, here is your bill from ${store.name}: ${items}, ${money(bill.total)}. See it and pay here: ${Bills.link(bill)} (open till ${day(bill.expiresAt)})`
  },
  /** wa.me opens the seller's WhatsApp on a chat with the customer, message filled in. */
  waUrl: (bill, text) => `https://wa.me/91${Bills.digits(bill.customer.phone)}?text=${encodeURIComponent(text)}`,
}

/** A random 8-digit number no order or bill uses yet (the real app's order format). */
function newOrderNumber(db) {
  const used = new Set([...db.orders.map((o) => o.number), ...(db.bills || []).map((b) => b.number)])
  for (;;) {
    const n = String(10000000 + Math.floor(Math.random() * 90000000))
    if (!used.has(n)) return n
  }
}
const billToken = () => Math.random().toString(36).slice(2, 8)

/** A line on a bill, from a product + variant (prices copied, then fixed). */
function billLine(p, v, qty, extra = {}) {
  return { productId: p.id, variantId: v.id, name: p.name, variantName: Catalog.variantLabel(v) || null, sku: v.sku || null, qty, price: v.price, tone: p.tone, ...extra }
}

// ===========================================================================
// World — the bill rules
// ===========================================================================

Object.assign(World, {
  /**
   * The seller makes a bill from the create-screen draft. One-off items are
   * saved first as hidden products (category "Added from bills") so every line
   * is a real product + variant. CASH: the order is made at once. LINK: nothing
   * else changes until the customer pays.
   */
  createBill(db, d) {
    const store = Q.myStore(db)
    if (store.suspendedAt) throw new Error('Your shop is paused by UnieMax — you cannot make bills right now.')
    if (d.items.length === 0) throw new Error('Add at least one item.')
    const lines = d.items.map((it) => {
      if (it.oneOff) {
        const { p, v } = World.addOneOffProduct(db, store, it)
        return billLine(p, v, it.qty, { oneOff: true })
      }
      const p = Catalog.product(db, it.productId)
      const v = p && p.variants.find((x) => x.id === it.variantId)
      if (!p || !v) throw new Error('An item on this bill was removed from your shop. Take it off and try again.')
      if (it.qty > v.stock) throw new Error(`Only ${v.stock} of “${p.name}${v.isDefault ? '' : ` (${Catalog.variantLabel(v)})`}” left — lower the quantity.`)
      return billLine(p, v, it.qty)
    })
    const t = Bills.totals(db, { lines, shipping: d.shipping, discountType: d.discountType, discount: d.discount, handover: d.handover })
    if (t.total <= 0) throw new Error('The bill total must be more than ₹0.')

    const now = new Date().toISOString()
    const cash = d.payWay === 'CASH'
    const bill = {
      id: `bill_${Store.nextId(db, 'bill')}`,
      number: newOrderNumber(db),
      storeId: store.id,
      token: billToken(),
      customer: { name: d.name.trim() || null, phone: Bills.phone(d.phone), address: cash && d.handover === 'DELIVERY' ? d.address.trim() : null },
      items: lines,
      subtotal: t.subtotal, shipping: t.shipping, discount: { type: d.discountType, value: Number(d.discount) || 0 }, discountAmount: t.discountAmount, total: t.total,
      note: (d.note || '').trim() || null,
      payWay: d.payWay,
      handover: cash ? d.handover : 'DELIVERY',
      status: 'OPEN',
      createdAt: now,
      expiresAt: cash ? now : new Date(Date.now() + (Number(d.expiryDays) || 3) * 864e5).toISOString(),
      sharedAt: null, openedAt: null, paidAt: null, cancelledAt: null, cancelReason: null,
      shares: [], payment: null, orderId: null,
      createdBy: Q.owner(db, store).name,
    }
    db.bills = db.bills || []
    db.bills.unshift(bill)
    if (cash) {
      const order = World.orderFromBill(db, bill, { method: 'CASH' })
      Store.emit('bill.cash', `${store.name} billed ${Bills.who(bill)} ${money(bill.total)} in cash — order ${order.number}`, { ref: bill.id })
    } else {
      Store.emit('bill.new', `${store.name} made a bill of ${money(bill.total)} for ${Bills.who(bill)}`, { ref: bill.id })
    }
    return bill
  },

  /** A one-off item becomes a hidden product with one default variant (stock = qty). */
  addOneOffProduct(db, store, it) {
    db.categories = db.categories || []
    let cat = db.categories.find((c) => c.storeId === store.id && c.system === 'BILL_ITEMS')
    if (!cat) {
      cat = { id: `cat_bill_${store.id}`, storeId: store.id, parentId: null, name: 'Added from bills', isActive: false, order: 99, system: 'BILL_ITEMS' }
      db.categories.push(cat)
    }
    const n = Store.nextId(db, 'oneoff')
    const pid = `p_bill${n}`
    const price = Math.round(Number(it.price))
    const p = Catalog.recompute({
      id: pid, storeId: store.id, categoryId: cat.id, category: cat.name, name: it.name.trim(), sku: `BILL-${n}`,
      tone: '#8a8a8a', visible: false, createdAt: new Date().toISOString(), source: 'BILL_ITEM',
      variants: [{ id: `${pid}_v`, name: 'Default', options: null, isDefault: true, price, mrp: price, stock: it.qty, sku: `BILL-${n}` }],
    })
    db.products.push(p)
    return { p, v: p.variants[0] }
  },

  /** Turn a bill into a real order: stock down (guarded), bill PAID, order linked. */
  orderFromBill(db, bill, { method, address, name, payment }) {
    for (const line of bill.items) {
      const v = Catalog.variant(db, line.productId, line.variantId)
      if (!v || v.stock < line.qty) throw new Error(`“${line.name}${line.variantName ? ` (${line.variantName})` : ''}” just sold out — the seller has to make a new bill.`)
    }
    for (const line of bill.items) Catalog.take(db, line.productId, line.variantId, line.qty)
    const now = new Date().toISOString()
    const inShop = bill.handover === 'IN_SHOP'
    if (name && !bill.customer.name) bill.customer.name = name
    if (address) bill.customer.address = address
    const order = {
      id: `ord_${Store.nextId(db, 'order')}`,
      number: bill.number,
      storeId: bill.storeId,
      customer: { name: bill.customer.name || bill.customer.phone, phone: bill.customer.phone, email: null, address: inShop ? null : bill.customer.address },
      items: bill.items.map((i) => ({ ...i })),
      subtotal: bill.subtotal, shipping: bill.shipping, discount: bill.discountAmount, total: bill.total,
      paymentMethod: method, paymentStatus: 'PAID',
      // The seller made it, so it never waits for the seller's own "Confirm".
      status: inShop ? 'DELIVERED' : 'CONFIRMED',
      fulfilment: inShop ? 'IN_SHOP' : 'DELIVERY',
      placedAt: now, confirmedAt: now, packedAt: inShop ? now : null, shippedAt: inShop ? now : null, deliveredAt: inShop ? now : null,
      cancelledAt: null, cancelReason: null, courier: null, tracking: null,
      source: 'BILL', billId: bill.id,
    }
    db.orders.unshift(order)
    bill.status = 'PAID'
    bill.paidAt = now
    bill.orderId = order.id
    bill.payment = payment || null
    return order
  },

  /** The seller sent or copied the link (we cannot see the chat — this is what they did). */
  shareBill(db, billId, via) {
    const bill = Bills.get(db, billId)
    if (!bill) throw new Error('This bill no longer exists.')
    if (['CANCELLED', 'EXPIRED'].includes(Bills.status(bill))) throw new Error('This bill is closed — make a new one.')
    const at = new Date().toISOString()
    bill.shares.push({ at, via })
    bill.sharedAt = bill.sharedAt || at
    return bill
  },

  /** The customer opened the link — the first time only. */
  openBill(db, token) {
    const bill = Bills.byToken(db, token)
    if (!bill || bill.openedAt) return null
    bill.openedAt = new Date().toISOString()
    if (Bills.open(bill)) {
      Act.notify(db, 'seller', `${Bills.who(bill)} opened your bill`, `${money(bill.total)} · bill ${bill.number}`, `/bills/${bill.id}`)
      Store.emit('bill.opened', `${Bills.who(bill)} opened bill ${bill.number}`, { ref: bill.id })
    }
    return bill
  },

  /** The customer paid on the bill page (PaymentHub said yes). */
  payBill(db, token, { address, name, method }) {
    const bill = Bills.byToken(db, token)
    if (!bill) throw new Error('This bill no longer exists.')
    const status = Bills.status(bill)
    if (status === 'PAID') throw new Error('This bill is already paid.')
    if (status === 'EXPIRED') throw new Error('This link has expired. Ask the shop for a new bill.')
    if (status === 'CANCELLED') throw new Error('The shop cancelled this bill.')
    if (!bill.openedAt) bill.openedAt = new Date().toISOString()
    const order = World.orderFromBill(db, bill, {
      method: 'ONLINE', address, name,
      payment: { method, ref: 'PH' + Math.random().toString(36).slice(2, 10).toUpperCase() },
    })
    Act.notify(db, 'seller', `Bill paid — order ${order.number}`, `${order.customer.name} paid ${money(order.total)} online`, `/orders/${order.id}`)
    Store.emit('bill.paid', `${order.customer.name} paid bill ${bill.number} — new order`, { ref: bill.id })
    return order
  },

  cancelBill(db, billId) {
    const bill = Bills.get(db, billId)
    if (!bill || !Bills.open(bill)) throw new Error('Only a bill waiting for payment can be cancelled.')
    bill.status = 'CANCELLED'
    bill.cancelledAt = new Date().toISOString()
    Store.emit('bill.cancel', `Bill ${bill.number} was cancelled by the seller`, { ref: bill.id })
    return bill
  },
})

// ===========================================================================
// Demo data — called by buildWorld() (data.js) with its helpers
// ===========================================================================

function demoBills({ ago, lineOf, customers, H, D, nextOrderSeq }) {
  const bills = []
  const orders = []
  let id = 0
  const make = (b) => {
    const subtotal = b.items.reduce((s, i) => s + i.qty * i.price, 0)
    const shipping = b.handover === 'IN_SHOP' ? 0 : b.shipping ?? (subtotal >= 1499 ? 0 : 60)
    const off = b.discount ? (b.discount.type === 'PERCENT' ? Math.round((subtotal * b.discount.value) / 100) : b.discount.value) : 0
    const [name, phone, , address] = customers[b.c]
    const cash = b.payWay === 'CASH'
    const bill = {
      id: `bill_${++id}`, number: b.number, storeId: 'st_lakshmi', token: b.token,
      customer: { name: b.anon ? null : name, phone, address: b.withAddress ? address : null },
      items: b.items, subtotal, shipping, discount: b.discount || { type: 'AMOUNT', value: 0 }, discountAmount: off, total: subtotal - off + shipping,
      note: b.note || null, payWay: b.payWay, handover: b.handover || 'DELIVERY',
      status: b.status, createdAt: ago(b.at), expiresAt: ago(b.at - (cash ? 0 : (b.days || 3) * D)),
      sharedAt: b.shared !== undefined ? ago(b.shared) : null, openedAt: b.opened !== undefined ? ago(b.opened) : null,
      paidAt: b.paid !== undefined ? ago(b.paid) : null, cancelledAt: b.cancelled !== undefined ? ago(b.cancelled) : null, cancelReason: null,
      shares: (b.shares || []).map(([via, at]) => ({ via, at: ago(at) })),
      payment: b.status === 'PAID' && !cash ? { method: 'UPI', ref: 'PH7Q2K' + id + 'M' } : null,
      orderId: null, createdBy: 'Priya Raman',
    }
    if (b.status === 'PAID') {
      const inShop = bill.handover === 'IN_SHOP'
      const order = {
        id: `ord_${nextOrderSeq()}`, number: bill.number, storeId: 'st_lakshmi',
        customer: { name, phone, email: null, address: inShop ? null : address },
        items: bill.items.map((i) => ({ ...i })), subtotal, shipping, discount: off, total: bill.total,
        paymentMethod: cash ? 'CASH' : 'ONLINE', paymentStatus: 'PAID',
        status: b.orderStatus || (inShop ? 'DELIVERED' : 'CONFIRMED'), fulfilment: inShop ? 'IN_SHOP' : 'DELIVERY',
        placedAt: bill.paidAt, confirmedAt: bill.paidAt, packedAt: inShop || b.orderStatus === 'SHIPPED' ? bill.paidAt : null,
        shippedAt: inShop ? bill.paidAt : b.orderStatus === 'SHIPPED' ? ago(b.paid - 20 * H) : null,
        deliveredAt: inShop ? bill.paidAt : null, cancelledAt: null, cancelReason: null,
        courier: b.orderStatus === 'SHIPPED' ? 'DTDC' : null, tracking: b.orderStatus === 'SHIPPED' ? 'D7019442' : null,
        source: 'BILL', billId: bill.id,
      }
      bill.orderId = order.id
      orders.push(order)
    }
    bills.push(bill)
  }

  // Made 20 min ago, not shared yet — the seller still has to send it.
  make({ c: 2, number: '48203917', token: 'k3xp9q', payWay: 'LINK', status: 'OPEN', at: 20, items: [lineOf('p1', 1), lineOf('p7', 1)],
    discount: { type: 'AMOUNT', value: 500 }, note: 'As discussed on the phone — blouse stitched to your size' })
  // Shared on WhatsApp yesterday, opened, not paid.
  make({ c: 5, number: '73015582', token: 'm8q2ra', payWay: 'LINK', status: 'OPEN', at: 26 * H, shared: 26 * H, opened: 25 * H, items: [lineOf('p2', 2)],
    shares: [['WHATSAPP', 26 * H]] })
  // Paid by link 2 days ago → a confirmed order, not sent yet.
  make({ c: 6, number: '26489170', token: 'p4wz7n', payWay: 'LINK', status: 'PAID', at: 3 * D, shared: 3 * D, opened: 2.9 * D, paid: 2 * D, withAddress: true,
    items: [lineOf('p6', 1), lineOf('p7', 2)], discount: { type: 'PERCENT', value: 10 }, shares: [['WHATSAPP', 3 * D]] })
  // Paid in cash, delivered by courier → already sent.
  make({ c: 1, number: '91537264', token: 'r2kd5v', payWay: 'CASH', status: 'PAID', at: 4 * D, paid: 4 * D, withAddress: true, orderStatus: 'SHIPPED',
    items: [lineOf('p4', 2)], shared: 4 * D, shares: [['WHATSAPP', 4 * D]] })
  // Paid in cash in the shop, customer took it.
  make({ c: 3, number: '58820413', token: 't9vb3e', payWay: 'CASH', status: 'PAID', at: 6 * H, paid: 6 * H, handover: 'IN_SHOP', items: [lineOf('p8', 1)] })
  // Expired: shared 5 days ago with a 3-day link, never opened.
  make({ c: 0, number: '30694428', token: 'w5hn2c', payWay: 'LINK', status: 'OPEN', at: 5 * D, shared: 5 * D, items: [lineOf('p3', 1)], anon: true,
    shares: [['COPY', 5 * D]] })
  // Cancelled by the seller.
  make({ c: 4, number: '64170385', token: 'y7tq1m', payWay: 'LINK', status: 'CANCELLED', at: 7 * D, shared: 7 * D, opened: 6.9 * D, cancelled: 6.5 * D,
    items: [lineOf('p2', 1)], shares: [['WHATSAPP', 7 * D]] })

  return { bills, orders, seq: id }
}
