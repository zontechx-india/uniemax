// Admin console — Seller bills (#/bills, #/bills/:id) + the bill card on an
// order. NEW: not in the real app yet.
//
// Admin only LOOKS at bills — making, resending and cancelling one is the
// seller's job. What admin needs:
//   - Orders: a "Bill" chip and a Source filter (Shop checkout / Seller bill)
//   - Order page: "Seller bill" card — how the order started, link, WhatsApp log
//   - Seller bills: every bill on the platform, unpaid ones included, so support
//     can answer "my link does not work" or "I was charged twice"
// Rules and data: js/bills.js.

const billChipA = (bill) => {
  const s = Bills.status(bill)
  return chip(STATUS.bill[s].adminTone, STATUS.bill[s].admin)
}
const payWayChipA = (bill) => chip('neutral', bill.payWay === 'CASH' ? 'Cash' : 'Link')

/** On the order page: where this order came from. */
function orderBillCard(db, order) {
  const bill = Bills.get(db, order.billId)
  if (!bill) return ''
  return card({
    title: 'Seller bill',
    subtitle: bill.payWay === 'CASH' ? 'The seller made this order and took the cash' : 'The seller sent a bill; the customer paid by link',
    body: html`<dl>
      ${detail('Bill', html`<a href="#/bills/${bill.id}" class="lnk">${bill.number}</a>`)}
      ${detail('Made by', `${bill.createdBy} · ${dateTime(bill.createdAt)}`)}
      ${detail('Paid', `${bill.payWay === 'CASH' ? 'Cash to the seller' : `Online by link${bill.payment ? ` · ${PAY_METHOD[bill.payment.method]}` : ''}`} · ${dateTime(bill.paidAt)}`)}
      ${bill.payment ? detail('Payment ref', html`<span class="font-mono text-xs">${bill.payment.ref}</span>`) : ''}
      ${bill.discountAmount ? detail('Seller discount', '− ' + money(bill.discountAmount)) : ''}
      ${detail('Shared', bill.sharedAt ? `${SHARE_VIA[bill.shares[0].via]} · ${dateTime(bill.sharedAt)}` : 'Not shared')}
    </dl>`,
  })
}

// ===========================================================================
// Seller bills
// ===========================================================================

const A_BILL_TABS = ['', 'WAITING', 'PAID', 'EXPIRED', 'CANCELLED']
const billTabTest = (tab) => (b) =>
  !tab || (tab === 'WAITING' ? Bills.open(b) : Bills.status(b) === tab)

const BillsAdminPage = {
  render(params, query) {
    const db = S()
    const ui = Store.ui
    const all = Bills.all(db)
    const tab = A_BILL_TABS.includes(query.status || '') ? query.status || '' : ''
    const q = (ui.billsQuery || '').trim().toLowerCase().replace(/^#/, '')
    const rows = all.filter((b) =>
      billTabTest(tab)(b) &&
      (!ui.billsWay || b.payWay === ui.billsWay) &&
      (!ui.billsStore || b.storeId === ui.billsStore) &&
      (!q || b.number.includes(q) || (b.customer.name || '').toLowerCase().includes(q) || Bills.digits(b.customer.phone).includes(q.replace(/\s/g, ''))))
    const sum = (list) => list.reduce((s, b) => s + b.total, 0)
    const waiting = all.filter(Bills.open)
    const byLink = all.filter((b) => b.status === 'PAID' && b.payWay === 'LINK')
    const byCash = all.filter((b) => b.status === 'PAID' && b.payWay === 'CASH')
    const closed = all.filter((b) => ['EXPIRED', 'CANCELLED'].includes(Bills.status(b)))

    return html`
      ${pageHead({ title: 'Seller bills', subtitle: 'Bills sellers made for phone and in-shop customers. A paid bill becomes a normal order.' })}
      <div class="stats">
        <a href="#/bills?status=WAITING" class="stat"><span class="stat-l">Waiting for payment</span><span class="stat-v">${count(waiting.length)}</span><span class="stat-s">${money(sum(waiting))} on open links</span></a>
        <a href="#/bills?status=PAID" class="stat"><span class="stat-l">Paid by link</span><span class="stat-v">${count(byLink.length)}</span><span class="stat-s">${money(sum(byLink))} online</span></a>
        <div class="stat"><span class="stat-l">Paid in cash</span><span class="stat-v">${count(byCash.length)}</span><span class="stat-s">${money(sum(byCash))} held by sellers</span></div>
        <div class="stat"><span class="stat-l">Expired or cancelled</span><span class="stat-v">${count(closed.length)}</span><span class="stat-s">Never became orders</span></div>
      </div>
      ${card({ pad: 'none', cls: 'max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0', body: html`
        ${tabs('billsTab', tab, A_BILL_TABS.map((s) => ({ value: s, label: s ? (s === 'WAITING' ? 'Open' : STATUS.bill[s].admin) : 'All', count: all.filter(billTabTest(s)).length })))}
        <div class="fbar">
          ${searchBox('billsQuery', ui.billsQuery, 'Bill number, customer or phone…', 'bills-q')}
          ${filterSelect('billsWay', 'Paid by', ui.billsWay || '', [{ value: '', label: 'Any' }, { value: 'LINK', label: 'Payment link' }, { value: 'CASH', label: 'Cash' }])}
          ${filterSelect('billsStore', 'Store', ui.billsStore || '', [{ value: '', label: 'Any' }, ...db.stores.map((s) => ({ value: s.id, label: s.name }))])}
        </div>
        ${dataTable({
          rows,
          link: (b) => `/bills/${b.id}`,
          emptyTitle: all.length ? 'No bills match these filters' : 'No bills yet',
          emptyHint: all.length ? '' : 'When a seller makes a bill, it shows here.',
          columns: [
            { header: 'Bill', primary: true, cell: (b) => html`<span class="font-medium text-fg">${b.number}</span><span class="sub">${relative(b.createdAt)}</span>` },
            { header: 'Store', cell: (b) => Q.store(db, b.storeId).name },
            { header: 'Customer', hideOnMobile: true, cell: (b) => html`${Bills.who(b)}${b.customer.name ? html`<span class="sub">${b.customer.phone}</span>` : ''}` },
            { header: 'Status', cell: (b) => html`${billChipA(b)}${Bills.open(b) ? html`<span class="sub">${BILL_STAGE[Bills.stage(b)]}</span>` : ''}` },
            { header: 'Paid by', cell: (b) => payWayChipA(b) },
            { header: 'Order', cell: (b) => (b.orderId ? html`<a href="#/orders/${b.orderId}" class="lnk">${Q.order(db, b.orderId).number}</a>` : html`<span class="text-muted">—</span>`) },
            { header: 'Total', cls: 'text-right', cell: (b) => html`<span class="num font-medium">${money(b.total)}</span>` },
          ],
          mobileRow: (b) => html`<div class="flex items-baseline justify-between gap-3"><p class="min-w-0 truncate font-medium text-fg">${b.number} · ${Bills.who(b)}</p><p class="shrink-0 font-figure text-sm font-medium text-fg">${money(b.total)}</p></div>
            <p class="mt-0.5 truncate text-sm text-muted">${Q.store(db, b.storeId).name} · ${relative(b.createdAt)}</p>
            <div class="mt-2 flex flex-wrap gap-1.5">${billChipA(b)}${payWayChipA(b)}</div>`,
        })}` })}`
  },
}

const BillAdminPage = {
  render({ id }) {
    const db = S()
    const b = Bills.get(db, id)
    if (!b) return html`${pageHead({ title: 'Bill not found', back: { to: '/bills', label: 'Seller bills' } })}`
    const store = Q.store(db, b.storeId)
    const order = b.orderId && Q.order(db, b.orderId)
    const status = Bills.status(b)
    const steps = [['Made', b.createdAt]]
    if (b.payWay === 'LINK') steps.push(['Shared by the seller', b.sharedAt], ['Opened by the customer', b.openedAt])
    if (b.paidAt) steps.push([b.payWay === 'CASH' ? 'Cash taken' : `Paid online${b.payment ? ` · ${PAY_METHOD[b.payment.method]}` : ''}`, b.paidAt])
    if (b.cancelledAt) steps.push(['Cancelled', b.cancelledAt])
    if (status === 'EXPIRED') steps.push(['Expired', b.expiresAt])

    return html`
      ${pageHead({ title: `Bill ${b.number}`, back: { to: '/bills', label: 'Seller bills' }, subtitle: html`<span class="flex flex-wrap items-center gap-2">${billChipA(b)}${payWayChipA(b)}<span class="text-muted">Made ${dateTime(b.createdAt)} by ${b.createdBy}</span></span>` })}
      ${status === 'EXPIRED' ? html`<div class="callout" role="status">${AIcon('alertCircle', 15)}<span>Not paid in time — the link stopped working on ${dateTime(b.expiresAt)}. Nothing was charged and no stock was held.</span></div>` : ''}
      ${status === 'CANCELLED' ? html`<div class="callout" role="status">${AIcon('alertCircle', 15)}<span>Cancelled by the seller on ${dateTime(b.cancelledAt)}${b.cancelReason ? ` — “${b.cancelReason}”` : ''}. The link no longer works.</span></div>` : ''}
      <div class="grid-main">
        <div class="space-y-4">
          ${card({ pad: 'none', title: 'Items', count: b.items.length, subtitle: 'Prices are fixed when the bill is made', body: html`<table class="tbl"><thead><tr><th>Item</th><th class="text-right">Qty</th><th class="text-right">Price</th><th class="text-right">Total</th></tr></thead>
            <tbody>${b.items.map((i) => html`<tr><td><span class="flex items-center gap-2.5"><span class="h-8 w-8 shrink-0 rounded-md border border-line" style="background:${i.tone}"></span><span class="min-w-0">${i.name}<span class="sub">${[i.variantName, i.sku, i.oneOff ? 'One-off item' : ''].filter(Boolean).join(' · ')}</span></span></span></td><td class="text-right num">${i.qty}</td><td class="text-right num">${money(i.price)}</td><td class="text-right num font-medium">${money(i.qty * i.price)}</td></tr>`)}</tbody></table>
            ${b.note ? html`<p class="border-t border-line px-4 py-3 text-sm text-muted">Note to the customer: <span class="text-fg">“${b.note}”</span></p>` : ''}` })}
          <div class="space-y-4">
            ${card({ title: 'Customer', body: html`<dl>${detail('Name', b.customer.name || html`<span class="text-muted">Not given</span>`)}${detail('Phone', b.customer.phone)}${detail(b.handover === 'IN_SHOP' ? 'Handed over' : 'Address', b.handover === 'IN_SHOP' ? 'In the shop — no delivery' : b.customer.address || html`<span class="text-muted">Added by the customer when paying</span>`)}</dl>` })}
            ${card({ title: 'Timeline', body: html`<dl>${steps.map(([label, at]) => detail(label, at ? dateTime(at) : html`<span class="text-muted">—</span>`))}${b.payWay === 'LINK' ? detail('Link open till', dateTime(b.expiresAt)) : ''}</dl>` })}
          </div>
          ${card({ pad: 'none', title: 'Shared by the seller', count: b.shares.length, subtitle: 'The seller sends the link from their own WhatsApp — UnieMax records the tap, not the chat', body: b.shares.length === 0
            ? UI.empty({ title: 'Not shared yet', description: b.payWay === 'CASH' ? 'No receipt was shared for this cash bill.' : 'The seller has not sent or copied the link.', compact: true })
            : html`<table class="tbl"><thead><tr><th>How</th><th>When</th></tr></thead><tbody>${b.shares.map((s) => html`<tr>
                <td data-label="How"><span class="font-medium text-fg">${SHARE_VIA[s.via]}</span><span class="sub max-w-md whitespace-normal">${Bills.message(db, b)}</span></td>
                <td data-label="When" class="text-sm">${dateTime(s.at)}</td></tr>`)}</tbody></table>` })}
        </div>
        <div class="space-y-4">
          ${card({ title: 'Store', body: html`<div class="flex items-center gap-3">${storeAvatar(store)}<div class="min-w-0"><a href="#/stores/${store.id}" class="lnk">${store.name}</a><span class="sub">/${store.slug}</span></div></div>` })}
          ${card({ title: 'Order', body: order
            ? html`<dl>${detail('Order', html`<a href="#/orders/${order.id}" class="lnk">${order.number}</a>`)}${detail('Status', orderStatusChip(order.status))}${detail('Payment', paymentChip(order.paymentStatus, order.paymentMethod))}</dl>`
            : html`<p class="text-sm text-muted">${status === 'EXPIRED' || status === 'CANCELLED' ? 'Never paid, so no order was made.' : 'No order yet — it is made when the customer pays.'}</p>` })}
          ${card({ title: 'Money', body: html`<dl class="bill total">${detail('Items', money(b.subtotal))}${detail('Delivery', b.handover === 'IN_SHOP' ? 'None' : b.shipping ? money(b.shipping) : 'Free')}${b.discountAmount ? detail(`Seller discount${b.discount.type === 'PERCENT' ? ` (${b.discount.value}%)` : ''}`, '− ' + money(b.discountAmount)) : ''}${detail('Total', money(b.total))}</dl>` })}
          ${card({ title: 'Payment link', body: html`<p class="break-all font-mono text-xs text-fg">https://${Bills.link(b)}</p>
            <p class="mt-2 text-xs text-muted">${b.payWay === 'CASH' ? 'Cash bill — the link only shows the receipt.' : Bills.open(b) ? 'Works until it is paid, cancelled or expires.' : 'No longer takes payment.'} Only the seller can share or cancel a bill.</p>` })}
        </div>
      </div>`
  },
}

// ===========================================================================
// Act + wiring
// ===========================================================================

Object.assign(Act, {
  ordersSource(v) {
    App.set('ordersSource', v)
  },
  billsTab(status) {
    App.replace(status ? `/bills?status=${status}` : '/bills')
  },
  billsQuery(v) {
    App.set('billsQuery', v)
  },
  billsWay(v) {
    App.set('billsWay', v)
  },
  billsStore(v) {
    App.set('billsStore', v)
  },
  /** Control panel: Lakshmi Silk Sarees sends a bill by link. */
  simSellerBill() {
    const db = S()
    const pick = db.products.filter((p) => p.storeId === db.me.storeId && p.stock > 0).slice(0, 2)
    const bill = Store.change((w) => {
      const b = World.createBill(w, {
        phone: '9741055220', name: 'Pooja Venkat', shipping: '', discountType: 'AMOUNT', discount: '',
        items: pick.map((p) => { const v = Catalog.firstInStock(p); return { key: v.id, productId: p.id, variantId: v.id, qty: 1 } }),
        note: '', payWay: 'LINK', expiryDays: 3, handover: 'DELIVERY', address: '',
      })
      return World.shareBill(w, b.id, 'WHATSAPP')
    })
    UI.toast(`Lakshmi Silk Sarees shared bill ${bill.number}`)
    Act.commit()
  },
  /** Control panel: the customer pays the newest waiting bill. */
  simBillPaid() {
    const bill = Bills.all(S()).find(Bills.open)
    if (!bill) return UI.toast('No bill is waiting for payment')
    try {
      const order = Store.change((db) => World.payBill(db, bill.token, { method: 'UPI', address: bill.customer.address || '12, Lake View Road, Velachery, Chennai, Tamil Nadu 600042', name: 'Kavitha M' }))
      UI.toast(`Bill ${bill.number} paid — order ${order.number}`)
    } catch (err) {
      UI.toast(err.message, 'danger')
    }
    Act.commit()
  },
})

{
  const item = { to: '/bills', label: 'Seller bills', ico: 'receipt' }
  const commerce = NAV_GROUPS.find((g) => g.title === 'Commerce').items
  commerce.splice(commerce.findIndex((i) => i.to === '/orders') + 1, 0, item)
  NAV_ITEMS.push(item)
}

App.reg('billsAdmin', { path: '/bills', title: 'Seller bills', parent: 'dashboard', ...BillsAdminPage, skeleton: adminSkeleton })
App.reg('billAdmin', { path: '/bills/:id', title: 'Bill', parent: 'billsAdmin', ...BillAdminPage, skeleton: adminSkeleton })

AppConfig.jumps.push(['billsAdmin', 'Seller bills (new)'], ['billAdmin', 'A cash bill', { id: 'bill_4' }], ['order', 'A bill order', { id: 'ord_1064' }])
AppConfig.simulate.push({ act: 'simSellerBill', label: 'Seller sends a bill' }, { act: 'simBillPaid', label: 'Customer pays a bill' })
const baseAdminBillUi = AppConfig.freshUi
AppConfig.freshUi = () => ({ ...baseAdminBillUi(), ordersSource: '', billsQuery: '', billsWay: '', billsStore: '' })
