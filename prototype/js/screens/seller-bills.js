// Seller — Bills (#/bills, #/bills/new, #/bills/:id). NEW: not in the real app yet.
//
// "Create a new bill": the seller fills the cart for a customer who ordered by
// phone or is in the shop, then
//   - shares the bill link from their OWN WhatsApp (or copies it). The customer
//     previews and pays on pay.html (js/screens/pay.js), or
//   - marks it paid in cash — the order is made at once.
//
// The item picker is built for big catalogs (1,000+ products, 20+ categories):
// search first (name, SKU, category), then a category list, then "Often
// billed". Sizes are picked inline; a missing item can be added as a one-off.
//
// Look: ws-form scale (controls 8, cards 10, sheets 12 — the ADMIN_UI_THEME
// radii), chosen cells solid ink (bg-fg/text-surface) like SegmentedControl.
// Rules and data: js/bills.js, js/catalog.js.

const freshBillDraft = () => ({
  phone: '', name: '', items: [], shipping: '', discountType: 'AMOUNT', discount: '', note: '',
  payWay: 'LINK', expiryDays: 3, handover: 'DELIVERY', address: '',
})
const freshPick = () => ({ q: '', cat: '', view: 'list', limit: 30, open: null, oneOff: null, choice: null })
const billDraft = () => (Store.ui.billDraft = Store.ui.billDraft || freshBillDraft())
const pickState = () => (Store.ui.pick = Store.ui.pick || freshPick())
const PAGE = 30

// ===========================================================================
// Bits
// ===========================================================================

const billChip = (bill) => {
  const s = Bills.status(bill)
  return badge(STATUS.bill[s].tone, STATUS.bill[s].label)
}
const quietTag = (ico, text) =>
  html`<span class="inline-flex h-6 items-center gap-1 rounded-md bg-fg/6 px-2 text-xs font-medium text-muted">${ico ? Icon(ico, 'h-3.5 w-3.5') : ''}${text}</span>`
const fieldError = (msg) => (msg ? html`<p role="alert" class="mt-1.5 text-sm font-medium text-danger">${msg}</p>` : '')
const optional = html`<span class="font-normal text-muted">(optional)</span>`
const billNo = (n) => html`<span class="font-figure tabular-nums">${Bills.spaced(n)}</span>`

/** SegmentedControl look: bordered track, chosen cell solid ink. data-act="billSet" key value. */
function segmented(key, value, options, { label, equal = false, act = 'billSet' } = {}) {
  return html`<div role="radiogroup" aria-label="${label}" class="grid grid-flow-col gap-0.5 rounded-lg border border-line bg-surface p-0.5 ${equal ? 'w-full auto-cols-[minmax(0,1fr)]' : 'w-fit auto-cols-max'}">
    ${options.map(([v, text]) => {
      const on = String(v) === String(value)
      return html`<button type="button" role="radio" aria-checked="${on}" data-act="${act}" data-args="${args(key, v)}"
        class="flex min-h-10 items-center justify-center rounded-md px-3.5 text-sm whitespace-nowrap transition-colors duration-150 ${on ? 'bg-fg font-semibold text-surface' : 'font-medium text-muted hover:text-fg'}">${text}</button>`
    })}
  </div>`
}

/** An either/or card (how the customer pays). Chosen = ink border + solid dot. */
const choiceCard = ({ on, value, ico, title, text }) => html`
  <button type="button" role="radio" aria-checked="${on}" data-act="billSet" data-args="${args('payWay', value)}"
    class="flex w-full items-start gap-3 rounded-lg border bg-surface p-4 text-left transition-colors duration-150 ${on ? 'border-fg' : 'border-line hover:border-fg/30'}">
    <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${on ? 'bg-fg text-surface' : 'bg-fg/5 text-muted'}">${Icon(ico, 'h-5 w-5')}</span>
    <span class="min-w-0 flex-1">
      <span class="block text-base font-semibold text-fg">${title}</span>
      <span class="mt-0.5 block text-sm leading-snug text-muted">${text}</span>
    </span>
    <span aria-hidden="true" class="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-fg' : 'border-line'}">${on ? html`<span class="h-2.5 w-2.5 rounded-full bg-fg"></span>` : ''}</span>
  </button>`

/** − qty + ; act gets (key, ±1). At 1 the − removes the line (a trash icon), unless removeAtOne is false. */
const stepper = (act, key, qty, max, label, { removeAtOne = true } = {}) => html`
  <div class="inline-flex shrink-0 items-center rounded-md border border-line bg-surface" role="group" aria-label="Quantity of ${label}">
    <button type="button" data-act="${act}" data-args="${args(key, -1)}" ${!removeAtOne && qty <= 1 ? 'disabled' : ''} aria-label="${qty <= 1 && removeAtOne ? 'Remove' : 'One less'}" class="flex size-tap items-center justify-center text-fg transition-colors hover:bg-fg/5 disabled:opacity-35">${Icon(qty <= 1 && removeAtOne ? 'trash' : 'minus', 'h-4 w-4')}</button>
    <span class="w-7 text-center font-figure text-base font-semibold tabular-nums text-fg">${qty}</span>
    <button type="button" data-act="${act}" data-args="${args(key, 1)}" ${qty >= max ? 'disabled' : ''} aria-label="One more" class="flex size-tap items-center justify-center text-fg transition-colors hover:bg-fg/5 disabled:opacity-35">${Icon('plus', 'h-4 w-4')}</button>
  </div>`

/** The message the customer gets, drawn like a chat bubble. */
const waBubble = (text, meta) => html`
  <div class="rounded-lg bg-surface-alt p-3">
    <div class="max-w-[94%] rounded-lg rounded-tl-sm border border-line bg-surface px-3 py-2">
      <p class="text-sm leading-relaxed break-words text-fg">${text}</p>
      ${meta ? html`<p class="mt-1 text-right text-xs text-muted">${meta}</p>` : ''}
    </div>
  </div>`

function billTotals(b, { itemsLabel = 'Items' } = {}) {
  const row = (label, value, strong = false) =>
    html`<div class="flex justify-between gap-3 ${strong ? 'border-t border-line pt-2' : ''}"><dt class="${strong ? 'font-semibold text-fg' : 'text-muted'}">${label}</dt><dd class="font-figure tabular-nums text-fg ${strong ? 'font-semibold' : ''}">${value}</dd></div>`
  return html`<dl class="space-y-1.5 text-base">
    ${row(itemsLabel, money(b.subtotal))}
    ${row('Delivery', b.handover === 'IN_SHOP' ? 'None — in the shop' : b.shipping === 0 ? 'Free' : money(b.shipping))}
    ${b.discountAmount ? row(`Discount${b.discount && b.discount.type === 'PERCENT' ? ` (${b.discount.value}%)` : ''}`, '− ' + money(b.discountAmount)) : ''}
    ${row('Total', money(b.total), true)}
  </dl>`
}

const billRow = (b) => {
  const s = Bills.status(b)
  return html`
  <a href="#/bills/${b.id}" class="flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors hover:bg-fg/5 sm:px-5">
    <div class="min-w-0 flex-1">
      <div class="flex items-baseline justify-between gap-3">
        <p class="min-w-0 truncate text-base font-medium text-fg">${Bills.who(b)}</p>
        <span class="shrink-0 font-figure text-base font-semibold tabular-nums text-fg">${money(b.total)}</span>
      </div>
      <p class="mt-0.5 text-sm text-muted">${timeAgo(b.createdAt)} · ${plural(Bills.itemCount(b), 'item')} · ${billNo(b.number)}</p>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        ${billChip(b)}${b.payWay === 'CASH' ? quietTag('cash', 'Cash') : s === 'OPEN' ? quietTag(null, BILL_STAGE[Bills.stage(b)]) : ''}
      </div>
    </div>
    ${Icon('chevronRight', 'h-5 w-5 shrink-0 text-muted')}
  </a>`
}

// ===========================================================================
// Bills list
// ===========================================================================

const BILL_TABS = [
  ['ALL', 'All', () => true],
  ['WAITING', 'Waiting', (b) => Bills.open(b)],
  ['PAID', 'Paid', (b) => b.status === 'PAID'],
  ['CLOSED', 'Expired or cancelled', (b) => ['EXPIRED', 'CANCELLED'].includes(Bills.status(b))],
]

const BillsScreen = {
  render(params, query) {
    const db = S()
    const all = Bills.all(db, db.me.storeId)
    const tab = BILL_TABS.find((t) => t[0] === query.tab) || BILL_TABS[0]
    const rows = all.filter(tab[2])
    const waiting = all.filter(Bills.open)
    const notShared = waiting.filter((b) => !b.sharedAt).length
    const create = html`<a href="#/bills/new" class="${btn({ size: 'lg' })}">${Icon('plus', 'h-5 w-5')}Create a bill</a>`

    return html`<div class="ws-form space-y-4">
      ${pageHeader({ ico: 'receipt', title: 'Bills', description: 'For customers who order by phone or in your shop. Share a bill on WhatsApp, or mark it paid in cash.', action: all.length ? create : '' })}
      ${all.length === 0
        ? html`<div class="ws-card rounded-lg">${UI.empty({ ico: 'receipt', title: 'No bills yet', description: 'A customer called or walked in? Make them a bill — they pay from a link, or you take the cash.', action: create })}</div>`
        : html`
          ${waiting.length ? html`<p class="flex items-center gap-2 text-sm text-fg">${Icon('clock', 'h-4 w-4 text-muted')}<span><span class="font-semibold">${plural(waiting.length, 'bill')}</span> waiting · ${money(waiting.reduce((s, b) => s + b.total, 0))}${notShared ? html` · <span class="text-pending">${notShared} not shared yet</span>` : ''}</span></p>` : ''}
          <div class="-mx-3 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:px-0">
            ${segmented('tab', tab[0], BILL_TABS.map(([key, label, test]) => {
              const n = all.filter(test).length
              return [key, html`${label}${n && key !== 'ALL' ? html`<span class="ml-1.5 font-figure tabular-nums opacity-70">${n}</span>` : ''}`]
            }), { label: 'Show bills', act: 'billsTab' })}
          </div>
          ${rows.length === 0
            ? html`<div class="ws-card rounded-lg">${UI.empty({ ico: 'receipt', title: 'No bills here', description: 'Try another tab.', compact: true })}</div>`
            : html`<ul class="ws-card divide-y divide-line overflow-hidden rounded-lg">${rows.map((b) => html`<li>${billRow(b)}</li>`)}</ul>`}`}
    </div>`
  },
}

// ===========================================================================
// Create a bill
// ===========================================================================

/** The draft's lines, joined with the live catalog (one-off items stand alone). */
function draftLines(db, d) {
  return d.items
    .map((it) => {
      if (it.oneOff) return { key: it.key, name: it.name, variantName: null, price: Number(it.price) || 0, qty: it.qty, max: 999, tone: '#8a8a8a', oneOff: true }
      const p = Catalog.product(db, it.productId)
      const v = p && p.variants.find((x) => x.id === it.variantId)
      return v ? { key: it.key, name: p.name, variantName: Catalog.variantLabel(v), price: v.price, qty: it.qty, max: v.stock, tone: p.tone, sku: v.sku } : null
    })
    .filter(Boolean)
}
const draftTotals = (db, d) =>
  Bills.totals(db, { lines: draftLines(db, d), shipping: d.shipping, discountType: d.discountType, discount: d.discount, handover: d.payWay === 'CASH' ? d.handover : 'DELIVERY' })

const BillNewScreen = {
  render() {
    const db = S()
    const store = Q.myStore(db)
    const d = billDraft()
    const e = Store.ui.billErrors || {}
    const lines = draftLines(db, d)
    const t = draftTotals(db, d)
    const known = Bills.knownCustomer(db, store.id, d.phone)
    const cash = d.payWay === 'CASH'
    const inShop = cash && d.handover === 'IN_SHOP'
    const rate = store.settings.rate
    const count = lines.reduce((s, l) => s + l.qty, 0)
    const step = (n, title, description, body, id) => panel({ id, title: html`<span class="text-muted">${n}.</span> ${title}`, description, body })

    if (store.suspendedAt) {
      return html`<div class="ws-form space-y-4">${backLink('Bills')}<div class="ws-card rounded-lg">${UI.empty({ ico: 'alert', title: 'Your shop is paused', description: 'You cannot make bills while UnieMax has paused your shop.', action: html`<a href="#/support" class="${btn({ size: 'lg' })}">Ask UnieMax why</a>` })}</div></div>`
    }

    return html`<div class="ws-form @container space-y-4">
      ${backLink('Bills')}
      ${pageHeader({ ico: 'receipt', title: 'Create a bill', description: 'Pick what they are buying from your shop. Prices come from your products.' })}

      <div class="items-start gap-4 space-y-4 @4xl:grid @4xl:grid-cols-[minmax(0,1fr)_320px] @4xl:space-y-0">
        <div class="space-y-4">
          ${step(1, 'Customer', 'Their WhatsApp number — you send them the bill.', html`<div class="grid gap-4 @2xl:grid-cols-2">
            <label class="block">
              <span class="${FIELD_LABEL}">Mobile number</span>
              <div class="relative">
                <span class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-base text-muted">+91</span>
                <input id="bill-phone" type="tel" inputmode="numeric" autocomplete="off" maxlength="14" value="${d.phone}" data-search="billPhone" placeholder="98400 11223"
                  class="${FIELD} pl-14 ${e.phone ? 'border-danger' : ''}" aria-invalid="${!!e.phone}" />
              </div>
              ${fieldError(e.phone)}
              ${known ? html`<p class="mt-1.5 flex items-center gap-1.5 text-sm text-success">${Icon('check', 'h-4 w-4')}Returning customer · ${plural(known.orders, 'order')} before</p>` : ''}
            </label>
            <label class="block">
              <span class="${FIELD_LABEL}">Name ${optional}</span>
              <input id="bill-name" value="${d.name}" data-model="billDraft.name" autocomplete="off" placeholder="Shown on the bill" class="${FIELD}" />
            </label>
          </div>`)}

          ${step(2, 'What they are buying', lines.length ? `${plural(count, 'item')} · ${money(t.subtotal)}` : 'Search your shop by name, code or category.', html`
            ${lines.length ? html`<ul class="-mt-2 mb-3 divide-y divide-line">${lines.map((l) => html`
              <li class="flex gap-3 py-3">
                <div class="h-12 w-12 shrink-0 rounded-md border border-line" style="background:${l.tone}"></div>
                <div class="min-w-0 flex-1">
                  <p class="text-base leading-snug font-medium break-words text-fg">${l.name}</p>
                  <p class="mt-0.5 text-sm text-muted">${l.variantName ? html`<span class="font-medium text-fg">${l.variantName}</span> · ` : ''}${money(l.price)} each${l.oneOff ? ' · one-off item' : ` · ${l.max} left`}</p>
                  <div class="mt-2 flex items-center gap-2">
                    ${stepper('billQty', l.key, l.qty, l.max, l.name)}
                    <span class="ml-auto font-figure text-base font-semibold tabular-nums text-fg">${money(l.qty * l.price)}</span>
                  </div>
                </div>
              </li>`)}</ul>` : ''}
            <button type="button" data-act="billPick" class="${btn({ variant: lines.length ? 'secondary' : 'primary', size: 'lg', full: true })}">${Icon(lines.length ? 'plus' : 'search', 'h-5 w-5')}${lines.length ? 'Add more items' : 'Add items'}</button>
            ${fieldError(e.items)}`, 'bill-items')}

          ${step(3, 'How will they pay?', '', html`<div role="radiogroup" aria-label="How will they pay" class="space-y-3">
            ${choiceCard({ on: !cash, value: 'LINK', ico: 'link', title: 'Send a bill to pay online', text: 'You share the bill link on WhatsApp. They see it and pay. It becomes an order when paid.' })}
            ${!cash ? html`<div class="space-y-2 rounded-lg border border-line p-4">
              <p class="${FIELD_LABEL}">Link stays open for</p>
              ${segmented('expiryDays', d.expiryDays, BILL_EXPIRY_DAYS.map((n) => [n, plural(n, 'day')]), { label: 'Link stays open for', equal: true })}
              <p class="text-sm text-muted">They add their delivery address when they pay. Stock goes down only when they pay.</p>
            </div>` : ''}
            ${choiceCard({ on: cash, value: 'CASH', ico: 'cash', title: 'Customer paid me already', text: 'Cash, or UPI to your own number. The order is made now, marked paid.' })}
            ${cash ? html`<div class="space-y-4 rounded-lg border border-line p-4">
              <div class="space-y-2">
                <p class="${FIELD_LABEL}">How do they get it?</p>
                ${segmented('handover', d.handover, [['DELIVERY', 'Deliver to them'], ['IN_SHOP', 'Took it from the shop']], { label: 'How do they get it', equal: true })}
              </div>
              ${d.handover === 'DELIVERY' ? html`<label class="block">
                <span class="${FIELD_LABEL}">Delivery address</span>
                <textarea id="bill-address" data-model="billDraft.address" rows="3" placeholder="House, street, area, city and pincode" class="${AREA} ${e.address ? 'border-danger' : ''}" aria-invalid="${!!e.address}">${d.address}</textarea>
                ${fieldError(e.address)}
              </label>` : html`<p class="text-sm text-muted">The order is marked delivered straight away.</p>`}
              <p class="flex items-start gap-2 rounded-md bg-surface-alt px-3 py-2.5 text-sm text-muted">${Icon('clock', 'mt-0.5 h-4 w-4 shrink-0')}Coming later: the customer confirms the cash payment with a one-time code.</p>
            </div>` : ''}
          </div>`)}

          ${step(4, 'Delivery charge and discount', '', html`<div class="space-y-4">
            ${inShop
              ? html`<p class="text-sm text-muted">No delivery charge — they took it from the shop.</p>`
              : html`<label class="block">
                  <span class="${FIELD_LABEL}">Delivery charge (₹)</span>
                  <input id="bill-shipping" type="number" min="0" inputmode="numeric" value="${d.shipping}" data-search="billNum" data-args="${args('shipping')}"
                    placeholder="${t.autoShip === 0 ? '0 — free' : String(t.autoShip)}" class="${FIELD}" />
                  <span class="mt-1.5 block text-sm text-muted">Empty uses your usual rate: ${money(rate.amount)}, free above ${money(rate.freeAbove)}.</span>
                </label>`}
            <div>
              <span class="${FIELD_LABEL}">Discount ${optional}</span>
              <div class="flex gap-2">
                ${segmented('discountType', d.discountType, [['AMOUNT', '₹'], ['PERCENT', '%']], { label: 'Discount type' })}
                <input id="bill-discount" type="number" min="0" inputmode="numeric" value="${d.discount}" data-search="billNum" data-args="${args('discount')}"
                  placeholder="${d.discountType === 'PERCENT' ? 'e.g. 10' : 'e.g. 200'}" class="${FIELD} ${e.discount ? 'border-danger' : ''}" aria-label="Discount ${d.discountType === 'PERCENT' ? 'in percent' : 'in rupees'}" />
              </div>
              ${fieldError(e.discount)}
            </div>
            <label class="block">
              <span class="${FIELD_LABEL}">Note to the customer ${optional}</span>
              <textarea id="bill-note" data-model="billDraft.note" rows="2" maxlength="200" placeholder="e.g. Blouse stitched to your size" class="${AREA}">${d.note}</textarea>
            </label>
          </div>`)}
        </div>

        <div class="@4xl:sticky @4xl:top-[4.5rem]">${panel({ title: 'Bill total', body: html`
          ${billTotals({ ...t, discount: { type: d.discountType, value: d.discount }, handover: inShop ? 'IN_SHOP' : 'DELIVERY' }, { itemsLabel: `Items (${count})` })}
          <p class="mt-3 text-sm text-muted">${cash ? 'Saved as a paid order straight away.' : 'Nothing is charged until the customer pays.'}</p>` })}</div>
      </div>

      ${UI.errorNote(Store.ui.errors['bill:create'])}
      <div class="sticky bottom-[calc(var(--seller-dock,0px)+0.75rem)] z-20">
        <div class="ws-bar flex items-center gap-3 rounded-lg p-2 sm:p-3">
          <div class="min-w-0 flex-1 px-2">
            <p class="text-xs text-muted">${plural(count, 'item')}</p>
            <p class="font-figure text-xl leading-tight font-semibold tabular-nums text-fg">${money(t.total)}</p>
          </div>
          <button type="button" data-act="billReview" class="${btn({ size: 'lg' })}">Review bill${Icon('arrowRight', 'h-4 w-4')}</button>
        </div>
      </div>
    </div>`
  },
}

// ===========================================================================
// The item picker — a full-height sheet, built for 1,000+ products
// ===========================================================================

/** How many of each variant are on the draft: Map variantId → qty. */
const onBillMap = (d) => new Map(d.items.filter((i) => !i.oneOff).map((i) => [i.variantId, i.qty]))

function pickRow(db, p, onBill, open) {
  const simple = Catalog.isSimple(p)
  const v0 = p.variants[0]
  const qty = simple ? onBill.get(v0.id) || 0 : p.variants.reduce((s, v) => s + (onBill.get(v.id) || 0), 0)
  const out = p.stock === 0
  const meta = [
    money(p.price),
    simple ? (out ? 'Sold out' : `${p.stock} left`) : `${Catalog.optionSummary(p)}${out ? ' · sold out' : ''}`,
    p.visible ? '' : 'Hidden in shop',
  ].filter(Boolean).join(' · ')
  // The chosen colour's swatch (in the real app: that variant's own photo).
  const choice = open && pickState().choice
  const chosenColour = choice && choice.productId === p.id && choice.values.Colour
  const tone = (chosenColour && (COLOURS.find((c) => c[0] === chosenColour) || [])[1]) || p.tone
  const tile = html`<span class="h-11 w-11 shrink-0 rounded-md border border-line ${out ? 'opacity-40' : ''}" style="background:${tone}"></span>`
  const text = html`<span class="min-w-0 flex-1">
      <span class="line-clamp-2 text-sm leading-snug font-medium ${out ? 'text-muted' : 'text-fg'}">${p.name}</span>
      <span class="mt-0.5 block text-xs text-muted">${meta}</span>
    </span>`

  if (simple) {
    return html`<li class="flex items-center gap-3 px-4 py-2">
      ${tile}${text}
      ${qty ? stepper('pickQty', v0.id, qty, v0.stock, p.name)
        : html`<button type="button" data-act="pickAdd" data-args="${args(p.id, v0.id)}" ${out ? 'disabled' : ''} aria-label="Add ${p.name}"
            class="flex size-tap shrink-0 items-center justify-center rounded-md border border-line text-fg transition-colors hover:bg-fg/5 disabled:opacity-35">${Icon('plus', 'h-5 w-5')}</button>`}
    </li>`
  }
  return html`<li>
    <button type="button" data-act="pickOpen" data-args="${args(p.id)}" aria-expanded="${open}" class="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-fg/5">
      ${tile}${text}
      ${qty ? html`<span class="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md bg-fg px-2 font-figure text-sm font-semibold text-surface">${qty}</span>` : ''}
      ${Icon('chevronDown', `h-5 w-5 shrink-0 text-muted transition-transform duration-150 ${open ? 'rotate-180' : ''}`)}
    </button>
    ${open ? html`<div class="px-4 pt-1 pb-3 pl-[72px]">
      ${Catalog.optionTypes(p).length > 1 ? optionChooser(p, onBill) : sizeCells(p, onBill)}
      ${onBillLines(p, onBill)}
    </div>` : ''}
  </li>`
}

/** One option (Size): every value is a cell — tap adds one, tap again adds another. */
function sizeCells(p, onBill) {
  const type = Catalog.optionTypes(p)[0]
  return html`<div class="flex flex-wrap gap-2">${p.variants.map((v) => {
      const n = onBill.get(v.id) || 0
      const sold = v.stock === 0
      const value = v.options ? Object.values(v.options)[0] : v.name
      return html`<button type="button" data-act="pickAdd" data-args="${args(p.id, v.id)}" ${sold || n >= v.stock ? 'disabled' : ''}
        aria-label="Add ${type ? type.name.toLowerCase() : ''} ${value}${n ? `, ${n} on the bill` : ''}"
        class="flex min-h-11 min-w-14 flex-col items-center justify-center rounded-md border px-3 py-1 transition-colors duration-150 disabled:cursor-not-allowed ${n ? 'border-fg bg-fg text-surface' : 'border-line bg-surface text-fg hover:border-fg/40'} ${sold ? 'opacity-40' : ''}">
        <span class="text-sm font-semibold">${value}${n ? ` · ${n}` : ''}</span>
        <span class="text-xs ${n ? 'text-surface/75' : 'text-muted'}">${sold ? 'Sold out' : `${v.stock} left`}</span>
      </button>`
    })}</div>
    <p class="mt-2 text-xs text-muted">Tap a ${type ? type.name.toLowerCase() : 'size'} to add one. Tap again for one more.</p>`
}

/** Does variant v match every chosen value (ignoring option `skip`)? */
const fitsChoice = (v, values, skip) => Object.entries(values).every(([t, val]) => t === skip || (v.options && v.options[t] === val))

/**
 * Two or three options (Colour × Size …): choose one value per option, like a
 * shopper on the storefront. A chip is greyed when no in-stock combination is
 * left with it (given the other choices); a combination the seller never
 * listed simply does not exist. Once every option is chosen: that variant's
 * stock and price, a quantity, and "Add to bill".
 */
function optionChooser(p, onBill) {
  const types = Catalog.optionTypes(p)
  const k = pickState()
  const c = k.choice && k.choice.productId === p.id ? k.choice : { productId: p.id, values: {}, qty: 1 }
  const chosen = types.every((t) => c.values[t.name]) ? p.variants.find((v) => fitsChoice(v, c.values)) : null
  const left = chosen ? chosen.stock - (onBill.get(chosen.id) || 0) : 0
  const missing = types.filter((t) => !c.values[t.name]).map((t) => t.name.toLowerCase())

  return html`<div class="space-y-3">
    ${types.map((t) => html`<div>
      <p class="mb-1.5 text-xs font-medium text-muted">${t.name}${c.values[t.name] ? html`: <span class="text-fg">${c.values[t.name]}</span>` : ''}</p>
      <div role="radiogroup" aria-label="${t.name}" class="flex flex-wrap gap-2">${t.values.map((val) => {
        const on = c.values[t.name] === val
        const live = p.variants.some((v) => v.options && v.options[t.name] === val && v.stock > 0 && fitsChoice(v, c.values, t.name))
        return html`<button type="button" role="radio" aria-checked="${on}" data-act="pickChoose" data-args="${args(p.id, t.name, val)}" ${!live && !on ? 'disabled' : ''}
          class="inline-flex min-h-10 min-w-11 items-center justify-center rounded-md border px-3 text-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:border-dashed disabled:text-muted disabled:opacity-60 ${on ? 'border-fg bg-fg font-semibold text-surface' : 'border-line bg-surface font-medium text-fg hover:border-fg/40'}">${val}</button>`
      })}</div>
    </div>`)}
    ${chosen
      ? html`<div class="rounded-md border border-line bg-surface-alt p-3">
          <div class="flex items-center gap-3">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-fg">${Catalog.variantLabel(chosen)}</p>
              <p class="mt-0.5 text-xs text-muted">${money(chosen.price)} · ${left > 0 ? `${left} left` : 'No more in stock'}${onBill.get(chosen.id) ? ` · ${onBill.get(chosen.id)} on the bill` : ''}</p>
            </div>
            ${left > 0 ? stepper('pickChoiceQty', p.id, Math.min(c.qty, left), left, Catalog.variantLabel(chosen), { removeAtOne: false }) : ''}
          </div>
          <button type="button" data-act="pickChoiceAdd" data-args="${args(p.id)}" ${left > 0 ? '' : 'disabled'} class="${btn({ size: 'md', full: true, cls: 'mt-3' })}">${left > 0 ? `Add ${Math.min(c.qty, left)} to bill` : 'All in stock are on the bill'}</button>
        </div>`
      : html`<p class="text-xs text-muted">Choose ${missing.join(' and ')} to add. Greyed values are sold out with your other choice.</p>`}
  </div>`
}

/** What of this product is already on the bill — with − / + so the seller can fix it here. */
function onBillLines(p, onBill) {
  const lines = p.variants.filter((v) => onBill.get(v.id))
  if (!lines.length) return ''
  return html`<ul class="mt-3 space-y-2 border-t border-line pt-3">
    <li class="text-xs font-medium text-muted">On the bill</li>
    ${lines.map((v) => html`<li class="flex items-center gap-3">
      <span class="min-w-0 flex-1 text-sm text-fg">${Catalog.variantLabel(v)}</span>
      ${stepper('pickQty', v.id, onBill.get(v.id), v.stock, Catalog.variantLabel(v))}
    </li>`)}
  </ul>`
}

function pickCategories(db, k) {
  const storeId = db.me.storeId
  const parents = Catalog.categories(db, storeId).filter((c) => !c.parentId && !c.system).sort((a, b) => a.order - b.order)
  const row = (id, name, n, sub = false) => html`<li><button type="button" data-act="pickCat" data-args="${args(id)}"
      class="flex min-h-12 w-full items-center gap-3 px-4 text-left transition-colors hover:bg-fg/5 ${sub ? 'pl-8' : ''}">
      <span class="min-w-0 flex-1 truncate text-base ${sub ? 'text-fg' : 'font-semibold text-fg'}">${name}</span>
      <span class="font-figure text-sm tabular-nums text-muted">${count(n)}</span>
      ${k.cat === id ? Icon('check', 'h-5 w-5 shrink-0 text-fg') : html`<span class="w-5"></span>`}
    </button></li>`
  return html`<ul class="py-2">
    ${row('', 'All categories', db.products.filter((p) => p.storeId === storeId).length)}
    ${parents.map((c) => html`<li class="mt-2 border-t border-line pt-2"><ul>
      ${row(c.id, c.name, Catalog.count(db, storeId, c.id))}
      ${Catalog.children(db, c.id).map((ch) => row(ch.id, ch.name, Catalog.count(db, storeId, ch.id), true))}
    </ul></li>`)}
  </ul>`
}

function pickOneOff(k) {
  const o = k.oneOff
  if (!o) {
    return html`<div class="mx-4 my-3 rounded-lg border border-dashed border-line p-4">
      <p class="text-sm font-medium text-fg">Not in your shop?</p>
      <p class="mt-0.5 text-sm text-muted">Add it to this bill with a name and price. It is saved as a hidden product, so the order and your earnings stay correct.</p>
      <button type="button" data-act="pickOneOffStart" class="${btn({ variant: 'secondary', size: 'md', cls: 'mt-3' })}">${Icon('plus', 'h-4 w-4')}Add “${k.q.trim()}” as a one-off item</button>
    </div>`
  }
  const e = Store.ui.oneOffError
  return html`<div class="mx-4 my-3 space-y-3 rounded-lg border border-line p-4">
    <p class="text-sm font-semibold text-fg">One-off item</p>
    <label class="block"><span class="${FIELD_LABEL}">Name</span><input id="oneoff-name" data-model="pick.oneOff.name" value="${o.name}" maxlength="80" class="${FIELD}" /></label>
    <div class="grid grid-cols-2 gap-3">
      <label class="block"><span class="${FIELD_LABEL}">Price (₹)</span><input id="oneoff-price" type="number" min="1" inputmode="numeric" data-model="pick.oneOff.price" value="${o.price}" class="${FIELD}" /></label>
      <label class="block"><span class="${FIELD_LABEL}">Quantity</span><input id="oneoff-qty" type="number" min="1" inputmode="numeric" data-model="pick.oneOff.qty" value="${o.qty}" class="${FIELD}" /></label>
    </div>
    ${fieldError(e)}
    <div class="flex gap-2">
      <button type="button" data-act="pickOneOffAdd" class="${btn({ size: 'md', cls: 'flex-1' })}">Add to bill</button>
      <button type="button" data-act="pickOneOffCancel" class="${btn({ variant: 'ghost', size: 'md' })}">Cancel</button>
    </div>
  </div>`
}

DIALOGS.billPicker = () => {
  const db = S()
  const d = billDraft()
  const k = pickState()
  const storeId = db.me.storeId
  const onBill = onBillMap(d)
  const lines = draftLines(db, d)
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0)
  const items = lines.reduce((s, l) => s + l.qty, 0)
  const q = k.q.trim()
  const cat = k.cat && Catalog.category(db, k.cat)

  let body
  if (k.view === 'cats') {
    body = pickCategories(db, k)
  } else {
    const results = Catalog.search(db, storeId, { q, catId: k.cat })
    const shown = results.slice(0, k.limit)
    const often = !q && !k.cat ? Catalog.often(db, storeId) : []
    body = html`
      ${often.length ? html`<section class="pb-1">
        <h3 class="px-4 pt-3 pb-1 text-sm font-semibold text-fg">Often billed</h3>
        <ul>${often.map(({ p, v }) => {
          const n = onBill.get(v.id) || 0
          const label = Catalog.variantLabel(v)
          return html`<li class="flex items-center gap-3 px-4 py-2">
            <span class="h-11 w-11 shrink-0 rounded-md border border-line" style="background:${p.tone}"></span>
            <span class="min-w-0 flex-1"><span class="line-clamp-2 text-sm leading-snug font-medium text-fg">${p.name}</span>
              <span class="mt-0.5 block text-xs text-muted">${label ? html`<span class="font-medium text-fg">${label}</span> · ` : ''}${money(v.price)} · ${v.stock ? `${v.stock} left` : 'Sold out'}</span></span>
            ${n ? stepper('pickQty', v.id, n, v.stock, p.name)
              : html`<button type="button" data-act="pickAdd" data-args="${args(p.id, v.id)}" ${v.stock ? '' : 'disabled'} aria-label="Add ${p.name} ${label}" class="flex size-tap shrink-0 items-center justify-center rounded-md border border-line text-fg transition-colors hover:bg-fg/5 disabled:opacity-35">${Icon('plus', 'h-5 w-5')}</button>`}
          </li>`
        })}</ul>
      </section>` : ''}
      <h3 class="flex items-baseline justify-between gap-3 border-t border-line px-4 pt-3 pb-1 text-sm font-semibold text-fg ${often.length ? '' : 'border-t-0'}">
        <span>${q ? `Results for “${q}”` : cat ? cat.name : 'All products'}</span>
        <span class="font-figure text-xs font-normal tabular-nums text-muted">${count(results.length)}</span>
      </h3>
      ${shown.length ? html`<ul>${shown.map((p) => pickRow(db, p, onBill, k.open === p.id))}</ul>` : html`<p class="px-4 pt-6 pb-2 text-center text-sm text-muted">${q ? `Nothing in ${cat ? cat.name : 'your shop'} matches “${q}”.` : 'No products in this category.'}</p>`}
      ${!shown.length && cat && q ? (() => {
        const elsewhere = Catalog.search(db, storeId, { q }).length
        return elsewhere ? html`<div class="px-4 pb-3 text-center"><button type="button" data-act="pickCat" data-args="${args('')}" class="${btn({ variant: 'secondary', size: 'md' })}">Search all categories · ${count(elsewhere)} found</button></div>` : ''
      })() : ''}
      ${results.length > shown.length ? html`<div class="px-4 py-3"><button type="button" data-act="pickMore" class="${btn({ variant: 'secondary', size: 'md', full: true })}">Show ${Math.min(PAGE, results.length - shown.length)} more · ${count(results.length - shown.length)} left</button></div>` : ''}
      ${q.length >= 2 && !(cat && !shown.length && Catalog.search(db, storeId, { q }).length) ? pickOneOff(k) : ''}`
  }

  return html`
    <div class="fixed inset-0 z-40 flex animate-dialog-backdrop items-end justify-center bg-[var(--overlay-soft)] text-fg sm:items-center sm:p-4" data-backdrop>
      <div role="dialog" aria-modal="true" aria-label="Add items" class="ws-form flex h-[92dvh] w-full max-w-lg animate-sheet-in flex-col overflow-hidden rounded-t-sheet bg-surface shadow-floating sm:h-[min(760px,88vh)] sm:rounded-sheet">
        <header class="flex items-center gap-2 border-b border-line py-2 pr-2 pl-4">
          ${k.view === 'cats'
            ? html`<button type="button" data-act="pickView" data-args="${args('list')}" class="-ml-2 inline-flex min-h-tap items-center gap-1.5 rounded-md px-2 text-base font-semibold text-fg hover:bg-fg/5">${Icon('arrowLeft', 'h-5 w-5')}Categories</button>`
            : html`<h2 class="min-w-0 flex-1 text-lg font-semibold text-fg">Add items</h2>`}
          <button type="button" data-act="closeDialog" aria-label="Close" class="ml-auto flex size-tap shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-fg/5 hover:text-fg">${Icon('x', 'h-5 w-5')}</button>
        </header>
        ${k.view === 'list' ? html`<div class="space-y-2 border-b border-line px-4 py-3">
          <label class="relative block">
            <span class="sr-only">Search products</span>
            ${Icon('search', 'pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-muted')}
            <input id="pick-q" type="search" value="${k.q}" data-search="pickQuery" placeholder="Name, code or category" autocomplete="off" class="${FIELD} pl-11" />
          </label>
          <button type="button" data-act="pickView" data-args="${args('cats')}" class="inline-flex min-h-10 max-w-full items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors ${cat ? 'border-fg bg-fg text-surface' : 'border-line text-fg hover:border-fg/40'}">
            ${Icon('layers', 'h-4 w-4 shrink-0')}<span class="truncate">${cat ? Catalog.path(db, cat.id) : 'All categories'}</span>${Icon('chevronDown', 'h-4 w-4 shrink-0')}
          </button>
          ${cat ? html`<button type="button" data-act="pickCat" data-args="${args('')}" class="ml-1 text-sm font-medium text-muted underline-offset-2 hover:text-fg hover:underline">Clear</button>` : ''}
        </div>` : ''}
        <div data-keep-scroll="pick-${k.view}" class="min-h-0 flex-1 overflow-y-auto overscroll-contain">${body}</div>
        <footer class="flex items-center gap-3 border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div class="min-w-0 flex-1">
            <p class="text-xs text-muted">${items ? `${plural(items, 'item')} on the bill` : 'Nothing added yet'}</p>
            <p class="font-figure text-lg font-semibold tabular-nums text-fg">${money(total)}</p>
          </div>
          <button type="button" data-act="closeDialog" class="${btn({ variant: k.choice && k.open === k.choice.productId ? 'secondary' : 'primary', size: 'md' })}">Done</button>
        </footer>
      </div>
    </div>`
}

// ===========================================================================
// One bill
// ===========================================================================

const BillScreen = {
  render({ id }) {
    const db = S()
    const bill = Bills.get(db, id)
    if (!bill || bill.storeId !== db.me.storeId) {
      return html`<div class="ws-form space-y-4">${backLink('Bills')}<div class="ws-card rounded-lg">${UI.empty({ ico: 'receipt', title: 'Bill not found', description: 'It may have been removed. Go back to your bills.' })}</div></div>`
    }
    const status = Bills.status(bill)
    const order = bill.orderId && Q.order(db, bill.orderId)
    const open = status === 'OPEN'
    const cash = bill.payWay === 'CASH'
    const busy = Store.ui.busy[`bill:${bill.id}`]
    const closed = status === 'EXPIRED' || status === 'CANCELLED'
    const message = Bills.message(db, bill)
    const lastShare = bill.shares[bill.shares.length - 1]

    const tl = (label, at, { last = false, bad = false, sub } = {}) => html`
      <li class="relative flex gap-3 ${last ? '' : 'pb-4'}">
        ${last ? '' : html`<span aria-hidden="true" class="absolute top-5 left-[9px] h-[calc(100%-12px)] w-px ${at ? 'bg-fg/30' : 'bg-line'}"></span>`}
        <span class="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${at ? (bad ? 'bg-muted text-surface' : 'bg-fg text-surface') : 'border-2 border-line bg-surface'}">${at ? Icon(bad ? 'x' : 'check', 'h-3 w-3') : ''}</span>
        <div class="min-w-0"><p class="text-base font-medium ${at ? 'text-fg' : 'text-muted'}">${label}</p>${at ? html`<p class="text-sm text-muted">${dateTime(at)}${sub ? ` · ${sub}` : ''}</p>` : sub ? html`<p class="text-sm text-muted">${sub}</p>` : ''}</div>
      </li>`
    const timeline = cash
      ? html`${tl('Bill made', bill.createdAt, { sub: `by ${bill.createdBy}` })}${tl('Cash taken — order made', bill.paidAt, { last: !bill.sharedAt })}${bill.sharedAt ? tl('Receipt shared', bill.sharedAt, { last: true, sub: SHARE_VIA[bill.shares[0].via] }) : ''}`
      : html`${tl('Bill made', bill.createdAt, { sub: `by ${bill.createdBy}` })}
          ${tl('Shared with the customer', bill.sharedAt, { sub: bill.sharedAt ? SHARE_VIA[bill.shares[0].via] : open ? 'Send it from the button below' : '' })}
          ${tl('Customer opened it', bill.openedAt)}
          ${status === 'CANCELLED' ? tl('Cancelled', bill.cancelledAt, { last: true, bad: true })
            : status === 'EXPIRED' ? tl('Link expired', bill.expiresAt, { last: true, bad: true })
            : tl('Paid online', bill.paidAt, { last: true, sub: bill.payment ? PAY_METHOD[bill.payment.method] : open ? `Open till ${dateTime(bill.expiresAt)}` : '' })}`

    const whatsapp = (label) => html`<button type="button" data-act="billShare" data-args="${args(bill.id, 'WHATSAPP')}" ${busy ? 'disabled' : ''}
      class="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-md bg-whatsapp px-4 text-base font-semibold whitespace-nowrap text-whatsapp-contrast transition-[filter] duration-150 hover:brightness-95 disabled:opacity-45">${Icon('chat', 'h-5 w-5')}${label}</button>`

    return html`<div class="ws-form @container space-y-4">
      ${backLink('Bills')}
      <section class="ws-card rounded-lg p-4 sm:p-5">
        <div class="flex flex-wrap items-center gap-2">${billChip(bill)}${open ? quietTag(null, BILL_STAGE[Bills.stage(bill)]) : ''}${cash ? quietTag('cash', 'Cash') : ''}</div>
        <h2 class="mt-3 font-figure text-3xl leading-tight font-semibold tabular-nums text-fg">${money(bill.total)}</h2>
        <p class="mt-1 text-base text-fg">${Bills.who(bill)} · ${plural(Bills.itemCount(bill), 'item')}</p>
        <p class="mt-0.5 text-sm text-muted">Bill ${billNo(bill.number)} · made ${timeAgo(bill.createdAt)}${open ? ` · open till ${dateTime(bill.expiresAt)}` : ''}</p>
      </section>
      ${UI.errorNote(Store.ui.errors[`bill:${bill.id}`])}
      ${order ? UI.infoNote(cash ? `Saved as order ${order.number}, paid in cash.` : `Paid online — this bill is now order ${order.number}. Pack and send it from the order.`) : ''}
      ${status === 'EXPIRED' ? UI.infoNote('Not paid in time, so the link no longer takes payment. Nothing was charged and no stock was held.') : ''}

      <div class="items-start gap-4 space-y-4 @4xl:grid @4xl:grid-cols-[minmax(0,1fr)_320px] @4xl:space-y-0">
        <div class="space-y-4">
          ${!closed ? panel({ ico: 'chat', title: cash ? 'Receipt for the customer' : bill.sharedAt ? 'The message you shared' : `Send the bill to ${Bills.who(bill)}`,
            description: cash ? 'Optional — a record of what they paid.' : 'It goes from your own WhatsApp, so they see a number they know.',
            body: html`${waBubble(message, lastShare ? `${SHARE_VIA[lastShare.via]} · ${dateTime(lastShare.at)}` : null)}
              <div class="mt-3 flex items-center gap-2 rounded-md border border-line px-3 py-2">
                ${Icon('link', 'h-4 w-4 shrink-0 text-muted')}
                <span class="min-w-0 flex-1 truncate text-sm text-fg">${Bills.link(bill)}</span>
                <a href="${Bills.protoUrl(bill)}" target="uniemax-pay" class="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-fg underline-offset-2 hover:underline">Open${Icon('external', 'h-4 w-4')}</a>
              </div>
              <p class="mt-2 text-xs text-muted">Prototype: “Open” shows the customer’s page (pay.html) in a new tab — pay from there to see the order arrive here.</p>` }) : ''}

          ${panel({ ico: 'user', title: Bills.who(bill), body: html`<div class="space-y-3">
            <p class="text-base text-fg">${bill.customer.phone}</p>
            <div class="border-t border-line pt-3">
              <p class="flex items-center gap-2 text-sm font-semibold text-fg">${Icon('mapPin', 'h-4 w-4 text-muted')}${bill.handover === 'IN_SHOP' ? 'Handed over' : 'Send to'}</p>
              <p class="mt-1 text-base leading-relaxed text-fg">${bill.handover === 'IN_SHOP' ? 'They took it from your shop.' : bill.customer.address || html`<span class="text-muted">The customer adds it when they pay.</span>`}</p>
            </div>
          </div>` })}

          ${panel({ ico: 'box', title: `On the bill (${bill.items.length})`, padded: false, body: html`
            <ul class="divide-y divide-line px-4 sm:px-5">${bill.items.map((i) => html`
              <li class="flex items-center gap-3 py-3">
                <div class="h-12 w-12 shrink-0 rounded-md border border-line" style="background:${i.tone}"></div>
                <div class="min-w-0 flex-1">
                  <p class="text-base leading-snug font-medium break-words text-fg">${i.name}</p>
                  <p class="mt-0.5 text-sm text-muted">${i.variantName ? html`<span class="font-medium text-fg">${i.variantName}</span> · ` : ''}<span class="font-semibold text-fg">${i.qty}</span> × ${money(i.price)}${i.oneOff ? ' · one-off item' : ''}</p>
                </div>
                <span class="shrink-0 font-figure text-base font-semibold tabular-nums text-fg">${money(i.qty * i.price)}</span>
              </li>`)}</ul>
            <div class="border-t border-line px-4 py-3 sm:px-5">${billTotals(bill)}</div>
            ${bill.note ? html`<p class="border-t border-line px-4 py-3 text-sm text-muted sm:px-5">Note to the customer: <span class="text-fg">“${bill.note}”</span></p>` : ''}` })}
        </div>

        <div class="space-y-4">
          ${panel({ title: 'What has happened', body: html`<ol>${timeline}</ol>` })}
          ${open ? html`<div class="flex justify-center"><button type="button" data-act="billAskCancel" data-args="${args(bill.id)}" ${busy ? 'disabled' : ''} class="${btn({ variant: 'ghost', size: 'md', cls: 'text-danger' })}">Cancel this bill</button></div>` : ''}
        </div>
      </div>

      <div class="sticky bottom-[calc(var(--seller-dock,0px)+0.75rem)] z-20">
        <div class="ws-bar flex items-center gap-2 rounded-lg p-2 sm:p-3">
          ${order && cash && !bill.sharedAt
            ? html`${whatsapp('Send receipt')}<a href="#/orders/${order.id}" class="${btn({ variant: 'secondary', size: 'lg' })}">Order</a>`
            : order
              ? html`<a href="#/orders/${order.id}" class="${btn({ size: 'lg', cls: 'min-w-0 flex-1' })}">Open order ${order.number}${Icon('arrowRight', 'h-4 w-4')}</a>`
              : open
                ? html`${whatsapp(bill.sharedAt ? 'Send again' : 'Send on WhatsApp')}
                    <button type="button" data-act="billShare" data-args="${args(bill.id, 'COPY')}" aria-label="Copy the link" title="Copy the link" class="${btn({ variant: 'secondary', size: 'lg', cls: 'px-3.5' })}">${Icon('copy', 'h-5 w-5')}<span class="hidden sm:inline">Copy link</span></button>`
                : html`<button type="button" data-act="billCopy" data-args="${args(bill.id)}" class="${btn({ size: 'lg', cls: 'min-w-0 flex-1' })}">${Icon('copy', 'h-5 w-5')}Make a new bill like this</button>`}
        </div>
      </div>
    </div>`
  },
}

// ===========================================================================
// Review sheet
// ===========================================================================

DIALOGS.billReview = () => {
  const db = S()
  const d = billDraft()
  const t = draftTotals(db, d)
  const cash = d.payWay === 'CASH'
  const busy = Store.ui.busy['bill:create']
  const lines = draftLines(db, d)
  const who = d.name.trim() || Bills.phone(d.phone)
  return UI.modal({
    title: cash ? 'Save this paid bill?' : 'Make this bill?',
    subtitle: `${who} · ${Bills.phone(d.phone)}`,
    body: html`<div class="ws-form space-y-4">
      <ul class="space-y-1.5 text-base">${lines.map((l) => html`<li class="flex justify-between gap-3"><span class="min-w-0 text-fg">${l.qty} × ${l.name}${l.variantName ? html` <span class="text-muted">(${l.variantName})</span>` : ''}</span><span class="shrink-0 font-figure tabular-nums text-fg">${money(l.qty * l.price)}</span></li>`)}</ul>
      <div class="border-t border-line pt-3">${billTotals({ ...t, discount: { type: d.discountType, value: d.discount }, handover: cash && d.handover === 'IN_SHOP' ? 'IN_SHOP' : 'DELIVERY' })}</div>
      <p class="text-sm text-muted">${cash
        ? d.handover === 'IN_SHOP' ? 'The order is saved as paid and delivered. Stock goes down now.' : 'The order is saved as paid and confirmed — then pack and send it. Stock goes down now.'
        : `Next you send it from your WhatsApp. The link stays open for ${plural(Number(d.expiryDays), 'day')}; when they pay, it becomes a confirmed order.`}</p>
      ${UI.errorNote(Store.ui.errors['bill:create'])}
    </div>`,
    footer: html`<button type="button" data-act="closeDialog" class="${btn({ variant: 'secondary' })}">Change something</button>
      <button type="button" data-act="billCreate" ${busy ? 'disabled' : ''} class="${btn()}">${busy ? spinner() : Icon('check', 'h-5 w-5')}${busy ? 'Saving…' : cash ? 'Save — paid in cash' : 'Make bill'}</button>`,
  })
}

// ===========================================================================
// Act
// ===========================================================================

function addToDraft(productId, variantId, by = 1) {
  const d = billDraft()
  const v = Catalog.variant(S(), productId, variantId)
  if (!v) return
  const line = d.items.find((i) => i.variantId === variantId)
  if (line) line.qty = Math.min(v.stock, line.qty + by)
  else if (v.stock > 0) d.items.push({ key: variantId, productId, variantId, qty: Math.min(v.stock, by) })
  if (Store.ui.billErrors) delete Store.ui.billErrors.items
}
/**
 * The choices to start with when a multi-option product opens: a value the
 * seller typed in the search ("kurti teal" → Teal), then any option left with
 * only one in-stock value.
 */
function autoChoice(p, q) {
  const types = Catalog.optionTypes(p)
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const values = {}
  for (const t of types) {
    const typed = t.values.find((val) => words.includes(val.toLowerCase()) || (val.includes(' ') && q.toLowerCase().includes(val.toLowerCase())))
    if (typed && p.variants.some((v) => v.stock > 0 && v.options[t.name] === typed)) values[t.name] = typed
  }
  for (const t of types) {
    if (values[t.name]) continue
    const live = t.values.filter((val) => p.variants.some((v) => v.stock > 0 && v.options[t.name] === val && fitsChoice(v, values, t.name)))
    if (live.length === 1) values[t.name] = live[0]
  }
  return values
}

function changeQty(key, by) {
  const d = billDraft()
  const line = d.items.find((i) => i.key === key)
  if (!line) return
  const max = line.oneOff ? 999 : (Catalog.variant(S(), line.productId, line.variantId) || { stock: 0 }).stock
  const next = line.qty + by
  if (next <= 0) d.items = d.items.filter((i) => i.key !== key)
  else line.qty = Math.min(max, next)
}

Object.assign(Act, {
  billsTab(_key, tab) {
    App.replace(tab === 'ALL' ? '/bills' : `/bills?tab=${tab}`)
  },
  billSet(key, value) {
    billDraft()[key] = value
    if (Store.ui.billErrors) delete Store.ui.billErrors[key === 'handover' ? 'address' : key]
    Act.commit()
  },
  billPhone(value) {
    const d = billDraft()
    d.phone = value
    const known = Bills.knownCustomer(S(), S().me.storeId, value)
    if (known) {
      if (!d.name.trim()) d.name = known.name
      if (!d.address.trim() && known.address) d.address = known.address
    }
    if (Store.ui.billErrors && Bills.digits(value).length === 10) delete Store.ui.billErrors.phone
    Act.commit()
  },
  billNum(value, key) {
    billDraft()[key] = value
    if (Store.ui.billErrors) delete Store.ui.billErrors[key]
    Act.commit()
  },
  billQty(key, by) {
    changeQty(key, by)
    Act.commit()
  },

  // ---- picker ----
  billPick() {
    // Always open on the whole shop: a filter left over from last time hides items.
    Store.ui.pick = freshPick()
    Store.ui.oneOffError = null
    Store.ui.dialog = { kind: 'billPicker' }
    Act.commit()
  },
  pickQuery(value) {
    const k = pickState()
    k.q = value
    k.limit = PAGE
    k.open = null
    if (k.oneOff) k.oneOff.name = value.trim()
    Act.commit()
  },
  pickView(view) {
    pickState().view = view
    Act.commit()
  },
  pickCat(catId) {
    Object.assign(pickState(), { cat: catId, view: 'list', limit: PAGE, open: null })
    Act.commit()
  },
  pickMore() {
    pickState().limit += PAGE
    Act.commit()
  },
  pickOpen(productId) {
    const k = pickState()
    k.open = k.open === productId ? null : productId
    const p = k.open && Catalog.product(S(), productId)
    k.choice = p && Catalog.optionTypes(p).length > 1 ? { productId, values: autoChoice(p, k.q), qty: 1 } : null
    Act.commit()
  },
  /** Choose (or un-choose) one option value; choices that no longer fit are dropped. */
  pickChoose(productId, type, value) {
    const k = pickState()
    const p = Catalog.product(S(), productId)
    if (!k.choice || k.choice.productId !== productId) k.choice = { productId, values: {}, qty: 1 }
    const values = k.choice.values
    if (values[type] === value) delete values[type]
    else values[type] = value
    for (const t of Catalog.optionTypes(p)) {
      if (t.name === type || !values[t.name]) continue
      if (!p.variants.some((v) => v.stock > 0 && fitsChoice(v, values))) delete values[t.name]
    }
    k.choice.qty = 1
    Act.commit()
  },
  pickChoiceQty(productId, by) {
    const k = pickState()
    if (k.choice && k.choice.productId === productId) k.choice.qty = Math.max(1, k.choice.qty + by)
    Act.commit()
  },
  pickChoiceAdd(productId) {
    const k = pickState()
    const p = Catalog.product(S(), productId)
    const v = k.choice && p.variants.find((x) => fitsChoice(x, k.choice.values) && Catalog.optionTypes(p).every((t) => k.choice.values[t.name]))
    if (!v) return
    const before = (billDraft().items.find((i) => i.variantId === v.id) || { qty: 0 }).qty
    addToDraft(productId, v.id, k.choice.qty)
    const added = (billDraft().items.find((i) => i.variantId === v.id) || { qty: 0 }).qty - before
    k.choice.qty = 1
    UI.toast(`Added ${added} × ${Catalog.variantLabel(v)}`)
    Act.commit()
  },
  pickAdd(productId, variantId) {
    addToDraft(productId, variantId)
    Act.commit()
  },
  pickQty(variantId, by) {
    changeQty(variantId, by)
    Act.commit()
  },
  pickOneOffStart() {
    pickState().oneOff = { name: pickState().q.trim(), price: '', qty: '1' }
    Store.ui.oneOffError = null
    Act.commit()
  },
  pickOneOffCancel() {
    pickState().oneOff = null
    Act.commit()
  },
  pickOneOffAdd() {
    const o = pickState().oneOff
    const price = Math.round(Number(o.price))
    const qty = Math.round(Number(o.qty))
    if (o.name.trim().length < 2) Store.ui.oneOffError = 'Give the item a name.'
    else if (!(price > 0)) Store.ui.oneOffError = 'Enter a price above ₹0.'
    else if (!(qty > 0)) Store.ui.oneOffError = 'Quantity must be at least 1.'
    else {
      const d = billDraft()
      d.items.push({ key: `one${Date.now()}`, oneOff: true, name: o.name.trim(), price, qty })
      Store.ui.oneOffError = null
      pickState().oneOff = null
      if (Store.ui.billErrors) delete Store.ui.billErrors.items
      UI.toast(`Added “${o.name.trim()}”`)
    }
    Act.commit()
  },

  /** Check the form, then show the review sheet. Errors sit under their fields. */
  billReview() {
    const db = S()
    const d = billDraft()
    const t = draftTotals(db, d)
    const e = {}
    if (Bills.digits(d.phone).length !== 10) e.phone = 'Enter a 10-digit mobile number.'
    if (d.items.length === 0) e.items = 'Add at least one item.'
    if (d.payWay === 'CASH' && d.handover === 'DELIVERY' && d.address.trim().length < 10) e.address = 'Enter the full address with pincode, or choose “Took it from the shop”.'
    const disc = Number(d.discount) || 0
    if (d.discountType === 'PERCENT' && disc > 100) e.discount = 'A discount cannot be more than 100%.'
    if (d.discountType === 'AMOUNT' && t.subtotal > 0 && disc > t.subtotal) e.discount = `A discount cannot be more than the items (${money(t.subtotal)}).`
    if (!e.items && !e.discount && t.total <= 0) e.discount = 'The total must be more than ₹0.'
    Store.ui.billErrors = e
    Store.ui.errors['bill:create'] = null
    if (Object.keys(e).length) {
      UI.toast('Fix the marked fields', 'danger')
      return Act.commit()
    }
    Store.ui.dialog = { kind: 'billReview' }
    Act.commit()
  },

  async billCreate() {
    const d = billDraft()
    const bill = await run('bill:create', () => Store.change((db) => World.createBill(db, d)), {
      ok: (b) => (b.payWay === 'CASH' ? `Saved — order ${b.number} is paid` : 'Bill made — now send it'),
    })
    if (!bill) return
    Store.ui.dialog = null
    Store.ui.billDraft = freshBillDraft()
    Store.ui.billErrors = {}
    Act.commit()
    App.replace('bill', { id: bill.id })
  },

  /**
   * The seller shares the link. WhatsApp opens their own app on a chat with the
   * customer (wa.me), message filled in — they press send. COPY puts the link
   * on the clipboard. We record what they did; we cannot see the chat.
   */
  billShare(billId, via) {
    const db = S()
    const bill = Bills.get(db, billId)
    if (!bill) return
    const text = Bills.message(db, bill)
    if (via === 'WHATSAPP') {
      try {
        window.open(Bills.waUrl(bill, text.replace(Bills.link(bill), Bills.protoUrl(bill))), '_blank', 'noopener')
      } catch {
        /* pop-up blocked — the toast still explains */
      }
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(Bills.protoUrl(bill)).catch(() => {
        /* not allowed here (page not focused) — the toast still explains */
      })
    }
    return run(`bill:${billId}`, () => Store.change((w) => World.shareBill(w, billId, via)), {
      ms: 150,
      ok: via === 'WHATSAPP' ? `WhatsApp opened on ${bill.customer.phone} — press send there` : 'Link copied — paste it in any chat',
    })
  },
  billAskCancel(billId) {
    UI.ask({ title: 'Cancel this bill?', message: 'The link stops taking payment. The customer is not told — tell them yourself if needed.', confirmLabel: 'Cancel bill', cancelLabel: 'Keep it', tone: 'danger', act: 'billCancel', args: [billId] })
  },
  billCancel(billId) {
    return run(`bill:${billId}`, () => Store.change((db) => World.cancelBill(db, billId)), { ok: 'Bill cancelled — the link no longer takes payment' })
  },
  /** Start a new draft from an old bill (same customer, items and charges). */
  billCopy(billId) {
    const db = S()
    const b = Bills.get(db, billId)
    Store.ui.billDraft = {
      ...freshBillDraft(),
      phone: Bills.digits(b.customer.phone), name: b.customer.name || '',
      items: b.items
        .filter((i) => i.oneOff || Catalog.variant(db, i.productId, i.variantId))
        .map((i) => (i.oneOff ? { key: `one${i.productId}`, oneOff: true, name: i.name, price: i.price, qty: i.qty } : { key: i.variantId, productId: i.productId, variantId: i.variantId, qty: i.qty })),
      discountType: b.discount.type, discount: b.discount.value ? String(b.discount.value) : '', note: b.note || '',
      payWay: b.payWay, handover: b.handover, address: b.customer.address || '',
    }
    Store.ui.billErrors = {}
    App.go('billNew')
  },

  // ---- control panel: play the customer ----
  simBillPay() {
    const bill = Bills.all(S(), S().me.storeId).find(Bills.open)
    if (!bill) return UI.toast('No bill is waiting for payment')
    try {
      const order = Store.change((db) => World.payBill(db, bill.token, { method: 'UPI', name: 'Kavitha M', address: bill.customer.address || '12, Lake View Road, Velachery, Chennai 600042' }))
      UI.toast(`Paid online — new order ${order.number}`)
    } catch (err) {
      UI.toast(err.message, 'danger')
    }
    Act.commit()
  },
})

// ===========================================================================
// Screens (billNew before bill, so "/bills/new" is not read as an id)
// ===========================================================================

App.reg('bills', { path: '/bills', title: 'Bills', tab: true, parent: 'orders', ...BillsScreen, skeleton: cards('h-12', 'h-[88px]', 'h-[88px]', 'h-[88px]') })
App.reg('billNew', { path: '/bills/new', title: 'Create a bill', tab: true, parent: 'bills', ...BillNewScreen })
App.reg('bill', { path: '/bills/:id', title: 'Bill', tab: true, parent: 'bills', ...BillScreen, skeleton: cards('h-32', 'h-48', 'h-48') })

AppConfig.jumps.push(['bills', 'Bills (new)'], ['billNew', 'Create a bill'], ['bill', 'A new bill', { id: 'bill_1' }])
AppConfig.simulate.push({ act: 'simBillPay', label: 'Customer pays a bill' })
const baseSellerUi = AppConfig.freshUi
AppConfig.freshUi = () => ({ ...baseSellerUi(), billDraft: freshBillDraft(), billErrors: {}, pick: freshPick(), oneOffError: null })
