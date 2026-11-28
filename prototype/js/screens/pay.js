// Customer — the bill page a seller shares (#/b/:token). NEW: not in the real app yet.
//
// The real URL is uniemax.com/b/<token>: public, noindex, no shop navigation.
// Steps, one screen at a time, phone-first:
//   1. Bill      see what the shop billed (items, sizes, delivery, discount, total)
//   2. Confirm   OTP to the bill's phone (the existing customer login; test code 123456)
//   3. Address   only for delivery bills — a saved address or a new one
//   4. Pay       UPI / card / net banking → PaymentHub (pretend here)
//   then         a receipt with the order number; the seller app gets the order
// Closed bills (paid, cash, expired, cancelled, not found) each get their own page.
// The page wears the SHOP's colour (storeVars → --cta), not UniMax purple.

const SAMPLE_PINCODE = /^\d{6}$/
// Form classes (seller.js / auth.js define these for the seller app; this page loads neither).
const FIELD =
  'h-field w-full rounded-md border border-line bg-input px-4 text-base text-fg outline-none transition-colors ' +
  'placeholder:text-muted hover:border-fg/30 focus:border-accent disabled:cursor-not-allowed disabled:opacity-60'
const FIELD_LABEL = 'mb-1.5 block text-sm font-medium text-fg'
const AREA = FIELD.replace('h-field', 'min-h-24 py-3')
const payState = (token) => {
  Store.ui.payState = Store.ui.payState || {}
  return (Store.ui.payState[token] = Store.ui.payState[token] || { step: 'bill', phone: '', codeSent: false, code: '', name: '', address: '', pincode: '', saved: true, method: 'UPI' })
}

/** The shop's colour on the primary button (what storeVars() does in the real app). */
const shopVars = (store) =>
  `--cta:${store.tone};--cta-pressed:color-mix(in srgb,${store.tone} 90%,black);--cta-lo:color-mix(in srgb,${store.tone} 80%,black)`

function payShell(store, body, bar = '') {
  return html`<div class="ws-form min-h-dvh bg-bg text-fg" style="${shopVars(store)}">
    <header class="sticky top-0 z-10 border-b border-line bg-surface">
      <div class="mx-auto flex h-14 max-w-md items-center gap-3 px-4">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-white" style="background:${store.tone}">${store.name.charAt(0)}</span>
        <p class="min-w-0 flex-1 truncate text-base font-semibold">${store.name}</p>
        ${store.verifiedAt ? html`<span class="inline-flex items-center gap-1 text-xs font-medium text-success">${Icon('shieldCheck', 'h-4 w-4')}Verified</span>` : ''}
      </div>
    </header>
    <main class="mx-auto max-w-md px-4 pt-4 ${bar ? 'pb-32' : 'pb-10'}">${body}</main>
    ${bar ? html`<div class="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface">
      <div class="mx-auto flex max-w-md items-center gap-3 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">${bar}</div>
    </div>` : ''}
  </div>`
}

/** The bill itself — the one rich thing on the page: it reads like a shop's printed bill. */
function billPaper(db, bill, { compact = false } = {}) {
  const store = Q.store(db, bill.storeId)
  const owner = Q.owner(db, store)
  const row = (label, value, strong = false) => html`<div class="flex justify-between gap-3 ${strong ? 'pt-2 text-base font-semibold text-fg' : 'text-sm text-muted'}"><dt>${label}</dt><dd class="font-figure tabular-nums ${strong ? '' : 'text-fg'}">${value}</dd></div>`
  return html`<article class="ws-card overflow-hidden rounded-lg">
    <header class="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
      <div class="min-w-0">
        <p class="text-sm text-muted">Bill for ${bill.customer.name || bill.customer.phone}</p>
        <p class="mt-0.5 font-figure text-xl font-semibold tracking-wide tabular-nums">${Bills.spaced(bill.number)}</p>
      </div>
      <p class="shrink-0 text-right text-xs text-muted">${day(bill.createdAt)}${Bills.open(bill) && bill.payWay === 'LINK' ? html`<br />Pay by ${day(bill.expiresAt)}` : ''}</p>
    </header>
    ${compact ? '' : html`<ul class="divide-y divide-line border-t border-line px-4">${bill.items.map((i) => html`
      <li class="flex gap-3 py-3">
        <span class="h-14 w-14 shrink-0 rounded-md border border-line" style="background:${i.tone}"></span>
        <div class="min-w-0 flex-1">
          <p class="text-sm leading-snug font-medium break-words text-fg">${i.name}</p>
          <p class="mt-0.5 text-sm text-muted">${i.variantName ? html`${i.variantName} · ` : ''}${i.qty} × ${money(i.price)}</p>
        </div>
        <span class="shrink-0 font-figure text-sm font-semibold tabular-nums text-fg">${money(i.qty * i.price)}</span>
      </li>`)}</ul>`}
    <dl class="space-y-1 border-t border-dashed border-line px-4 pt-3 pb-4">
      ${row(`Items (${Bills.itemCount(bill)})`, money(bill.subtotal))}
      ${row('Delivery', bill.handover === 'IN_SHOP' ? 'Taken from the shop' : bill.shipping ? money(bill.shipping) : 'Free')}
      ${bill.discountAmount ? row('Discount from the shop', '− ' + money(bill.discountAmount)) : ''}
      ${row(bill.status === 'PAID' ? 'Paid' : 'To pay', money(bill.total), true)}
    </dl>
    ${bill.note && !compact ? html`<p class="border-t border-line bg-surface-alt px-4 py-3 text-sm text-fg"><span class="text-muted">${owner.name.split(' ')[0]} from ${store.name}:</span> “${bill.note}”</p>` : ''}
  </article>`
}

/** Call / WhatsApp the shop — the bill page's only way out. */
function shopContact(db, bill, text = 'Questions about this bill?') {
  const store = Q.store(db, bill.storeId)
  const phone = Q.owner(db, store).phone
  return html`<div class="mt-4 rounded-lg border border-line bg-surface p-4">
    <p class="text-sm text-muted">${text}</p>
    <div class="mt-3 grid grid-cols-2 gap-2">
      <a href="tel:${phone}" class="${btn({ variant: 'secondary', size: 'sm', full: true })}">${Icon('phone', 'h-4 w-4')}Call the shop</a>
      <a href="https://wa.me/91${Bills.digits(phone)}" target="_blank" rel="noopener" class="${btn({ variant: 'secondary', size: 'sm', full: true })}">${Icon('chat', 'h-4 w-4')}WhatsApp</a>
    </div>
  </div>`
}

const stepHead = (n, title, sub, back) => html`<div class="mb-4">
  ${back ? html`<button type="button" data-act="payStep" data-args="${args(back[0], back[1])}" class="-ml-2 mb-2 inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted hover:bg-fg/5 hover:text-fg">${Icon('arrowLeft', 'h-4 w-4')}Back</button>` : ''}
  <p class="text-xs font-medium text-muted">Step ${n} of 3</p>
  <h1 class="mt-0.5 text-xl font-semibold text-fg">${title}</h1>
  ${sub ? html`<p class="mt-1 text-sm text-muted">${sub}</p>` : ''}
</div>`

const optionCard = (act, argList, on, title, text) => html`
  <button type="button" role="radio" aria-checked="${on}" data-act="${act}" data-args="${args(...argList)}"
    class="flex w-full items-start gap-3 rounded-lg border bg-surface p-4 text-left transition-colors duration-150 ${on ? 'border-fg' : 'border-line hover:border-fg/30'}">
    <span aria-hidden="true" class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-fg' : 'border-line'}">${on ? html`<span class="h-2.5 w-2.5 rounded-full bg-fg"></span>` : ''}</span>
    <span class="min-w-0"><span class="block text-base font-medium text-fg">${title}</span>${text ? html`<span class="mt-0.5 block text-sm leading-snug text-muted">${text}</span>` : ''}</span>
  </button>`

// ===========================================================================
// Screens
// ===========================================================================

const PayScreen = {
  mount({ token }) {
    // First open of the link: the seller sees "Opened · not paid".
    const bill = Bills.byToken(S(), token)
    if (bill && !bill.openedAt) Store.change((db) => World.openBill(db, token))
  },
  render({ token }) {
    const db = S()
    const bill = Bills.byToken(db, token)
    if (!bill) {
      return html`<div class="ws-form mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">${UI.empty({ ico: 'receipt', title: 'This bill does not exist', description: 'Check the link, or ask the shop to send it again.' })}</div>`
    }
    const store = Q.store(db, bill.storeId)
    const status = Bills.status(bill)
    const order = bill.orderId && Q.order(db, bill.orderId)
    const k = payState(token)
    const err = Store.ui.errors[`pay:${token}`]
    const busy = Store.ui.busy[`pay:${token}`]

    // ---- closed bills ----
    if (status === 'PAID') {
      const cash = bill.payWay === 'CASH'
      return payShell(store, html`
        <section class="mb-4 flex items-start gap-3">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/12 text-success">${Icon('check', 'h-5 w-5')}</span>
          <div class="min-w-0">
            <h1 class="text-xl font-semibold text-fg">${cash ? 'Paid in cash' : 'Payment received'}</h1>
            <p class="mt-0.5 text-sm text-muted">${money(bill.total)} to ${store.name} · ${dateTime(bill.paidAt)}</p>
          </div>
        </section>
        ${order ? html`<div class="mb-4 rounded-lg border border-line bg-surface p-4">
          <p class="text-sm text-muted">Your order number</p>
          <p class="mt-0.5 font-figure text-2xl font-semibold tracking-wide tabular-nums">${Bills.spaced(order.number)}</p>
          <p class="mt-2 text-sm text-fg">${order.fulfilment === 'IN_SHOP' ? 'You took it from the shop.' : `${store.name} packs and sends it to:`}</p>
          ${order.customer.address ? html`<p class="mt-1 text-sm text-muted">${order.customer.address}</p>` : ''}
          ${bill.payment ? html`<p class="mt-3 border-t border-line pt-3 text-xs text-muted">${PAY_METHOD[bill.payment.method]} · reference <span class="font-mono">${bill.payment.ref}</span></p>` : ''}
        </div>` : ''}
        ${billPaper(db, bill)}
        ${order && order.fulfilment !== 'IN_SHOP' ? html`<p class="mt-4 text-sm text-muted">You get an update on WhatsApp when it is confirmed, sent and delivered.</p>` : ''}
        ${shopContact(db, bill, 'Need help with your order?')}`)
    }
    if (status === 'EXPIRED' || status === 'CANCELLED') {
      return payShell(store, html`
        <section class="mb-4">
          <h1 class="text-xl font-semibold text-fg">${status === 'EXPIRED' ? 'This bill has expired' : 'The shop cancelled this bill'}</h1>
          <p class="mt-1 text-sm text-muted">${status === 'EXPIRED' ? `It could be paid until ${dateTime(bill.expiresAt)}.` : 'It can no longer be paid.'} Nothing was charged. Ask ${store.name} for a new bill if you still want it.</p>
        </section>
        ${billPaper(db, bill, { compact: true })}
        ${shopContact(db, bill, `Message ${store.name}`)}`)
    }

    // ---- open bill: the steps ----
    const delivery = bill.handover === 'DELIVERY'
    const known = Bills.knownCustomer(db, bill.storeId, bill.customer.phone)
    const signedIn = Store.ui.customer && Bills.digits(Store.ui.customer.phone) === Bills.digits(k.phone || bill.customer.phone)
    const payBar = (label, act, extra = '') => html`
      <div class="min-w-0 flex-1"><p class="text-xs text-muted">To pay</p><p class="font-figure text-lg font-semibold tabular-nums text-fg">${money(bill.total)}</p></div>
      <button type="button" data-act="${act}" data-args="${args(token)}" ${busy || extra === 'disabled' ? 'disabled' : ''} class="${btn({ size: 'lg' })}">${busy ? spinner() : ''}${busy ? 'Please wait…' : label}</button>`

    if (k.step === 'verify') {
      return payShell(store, html`
        ${stepHead(1, 'Confirm your number', 'We send a 6-digit code. It keeps your bill and order details yours.', ['bill', token])}
        <div class="space-y-4">
          <label class="block">
            <span class="${FIELD_LABEL}">Mobile number</span>
            <div class="relative">
              <span class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-base text-muted">+91</span>
              <input id="pay-phone" type="tel" inputmode="numeric" maxlength="14" autocomplete="tel-national" data-model="payState.${token}.phone" value="${k.phone || Bills.digits(bill.customer.phone)}" ${k.codeSent ? 'readonly' : ''} class="${FIELD} pl-14" />
            </div>
          </label>
          ${k.codeSent ? html`
            <label class="block">
              <span class="${FIELD_LABEL}">Code</span>
              <input id="pay-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" data-model="payState.${token}.code" value="${k.code}" placeholder="6 digits" class="${FIELD} font-figure tracking-[0.3em]" />
              <span class="mt-1.5 block text-sm text-muted">Sent to +91 ${k.phone || Bills.digits(bill.customer.phone)} · <button type="button" data-act="payChangePhone" data-args="${args(token)}" class="font-medium text-fg underline underline-offset-2">Change number</button></span>
            </label>
            <p class="text-xs text-muted">Prototype: the code is 123456.</p>` : ''}
          ${UI.errorNote(err)}
        </div>`, payBar(k.codeSent ? 'Verify' : 'Send code', k.codeSent ? 'payVerify' : 'paySendCode'))
    }

    if (k.step === 'address') {
      const useSaved = known && known.address && k.saved
      return payShell(store, html`
        ${stepHead(2, 'Where should it go?', `${store.name} sends it here.`, ['bill', token])}
        <div class="space-y-3">
          ${known && known.address ? html`<div role="radiogroup" aria-label="Delivery address" class="space-y-2">
            ${optionCard('paySaved', [token, true], useSaved, known.name, known.address)}
            ${optionCard('paySaved', [token, false], !useSaved, 'A different address', '')}
          </div>` : ''}
          ${!useSaved ? html`<div class="space-y-4 rounded-lg border border-line bg-surface p-4">
            <label class="block"><span class="${FIELD_LABEL}">Full name</span><input id="pay-name" data-model="payState.${token}.name" value="${k.name || bill.customer.name || ''}" autocomplete="name" class="${FIELD}" /></label>
            <label class="block"><span class="${FIELD_LABEL}">House, street and area</span><textarea id="pay-address" data-model="payState.${token}.address" rows="3" autocomplete="street-address" class="${AREA}">${k.address}</textarea></label>
            <label class="block"><span class="${FIELD_LABEL}">Pincode</span><input id="pay-pin" inputmode="numeric" maxlength="6" data-model="payState.${token}.pincode" value="${k.pincode}" autocomplete="postal-code" class="${FIELD} font-figure" /></label>
          </div>` : ''}
          ${UI.errorNote(err)}
        </div>`, payBar('Continue', 'payAddress'))
    }

    if (k.step === 'method') {
      const methods = [
        ['UPI', 'UPI', 'Google Pay, PhonePe, Paytm or any UPI app'],
        ['CARD', 'Debit or credit card', ''],
        ['NETBANKING', 'Net banking', ''],
      ]
      return payShell(store, html`
        ${stepHead(delivery ? 3 : 2, 'Pay', '', [delivery ? 'address' : 'bill', token])}
        ${delivery ? html`<div class="mb-4 flex items-start gap-3 rounded-lg border border-line bg-surface p-4">
          ${Icon('mapPin', 'mt-0.5 h-4 w-4 shrink-0 text-muted')}
          <p class="min-w-0 flex-1 text-sm text-fg">${k.deliverTo}</p>
          <button type="button" data-act="payStep" data-args="${args('address', token)}" class="text-sm font-medium text-fg underline underline-offset-2">Change</button>
        </div>` : ''}
        <div role="radiogroup" aria-label="Pay with" class="space-y-2">${methods.map(([v, title, text]) => optionCard('payMethod', [token, v], k.method === v, title, text))}</div>
        <div class="mt-4">${billPaper(db, bill, { compact: true })}</div>
        ${UI.errorNote(err)}
        <p class="mt-3 flex items-center gap-1.5 text-xs text-muted">${Icon('lock', 'h-3.5 w-3.5')}You pay on the payment partner’s page. ${store.name} never sees your card or UPI details.</p>`,
        payBar(`Pay ${money(bill.total)}`, 'payNow'))
    }

    // step 'bill'
    return payShell(store, html`
      <section class="mb-4">
        <h1 class="text-xl font-semibold text-fg">Your bill from ${store.name}</h1>
        <p class="mt-1 text-sm text-muted">${delivery ? 'Check it, then pay. You add your delivery address before paying.' : 'Check it, then pay.'}</p>
      </section>
      ${billPaper(db, bill)}
      ${shopContact(db, bill)}
      ${signedIn ? html`<p class="mt-3 text-center text-xs text-muted">Signed in as +91 ${Bills.digits(Store.ui.customer.phone)}</p>` : ''}`,
      payBar(`Pay ${money(bill.total)}`, 'payStart'))
  },
}

/** Prototype home: every bill link, so a tester can open any state. */
const PayHome = {
  render() {
    const db = S()
    const bills = Bills.all(db)
    const group = (title, list) => list.length ? html`<section class="mt-5">
      <h2 class="mb-2 text-sm font-semibold text-fg">${title}</h2>
      <ul class="ws-card divide-y divide-line overflow-hidden rounded-lg">${list.map((b) => html`<li><a href="#/b/${b.token}" class="flex items-center gap-3 px-4 py-3 hover:bg-fg/5">
        <span class="min-w-0 flex-1"><span class="block truncate text-base font-medium text-fg">${Bills.who(b)} · ${money(b.total)}</span><span class="block text-sm text-muted">${Bills.link(b)} · ${STATUS.bill[Bills.status(b)].label}</span></span>
        ${Icon('chevronRight', 'h-5 w-5 text-muted')}</a></li>`)}</ul>
    </section>` : ''
    return html`<div class="ws-form mx-auto max-w-md px-4 py-6">
      <h1 class="text-xl font-semibold text-fg">Bill links</h1>
      <p class="mt-1 text-sm text-muted">Prototype only. A customer never sees this list — they get one link from the shop on WhatsApp.</p>
      ${group('Waiting for payment', bills.filter(Bills.open))}
      ${group('Paid', bills.filter((b) => b.status === 'PAID'))}
      ${group('Expired or cancelled', bills.filter((b) => ['EXPIRED', 'CANCELLED'].includes(Bills.status(b))))}
      ${bills.length === 0 ? UI.empty({ ico: 'receipt', title: 'No bills yet', description: 'Make one in the seller app (Bills → Create a bill).' }) : ''}
    </div>`
  },
}

// ===========================================================================
// Act
// ===========================================================================

Object.assign(Act, {
  payStep(step, token) {
    payState(token).step = step
    Store.ui.errors[`pay:${token}`] = null
    Act.commit()
    window.scrollTo(0, 0)
  },
  /** "Pay" on the bill: sign in first unless this phone is already confirmed. */
  payStart(token) {
    const bill = Bills.byToken(S(), token)
    const k = payState(token)
    const confirmed = Store.ui.customer && Bills.digits(Store.ui.customer.phone) === Bills.digits(k.phone || bill.customer.phone)
    Act.payStep(confirmed ? (bill.handover === 'DELIVERY' ? 'address' : 'method') : 'verify', token)
  },
  async paySendCode(token) {
    const k = payState(token)
    const bill = Bills.byToken(S(), token)
    k.phone = Bills.digits(k.phone || bill.customer.phone)
    if (k.phone.length !== 10) {
      Store.ui.errors[`pay:${token}`] = 'Enter a 10-digit mobile number.'
      return Act.commit()
    }
    const sent = await run(`pay:${token}`, () => true, { ok: 'Code sent' })
    if (sent) {
      k.codeSent = true
      Act.commit()
    }
  },
  payChangePhone(token) {
    Object.assign(payState(token), { codeSent: false, code: '' })
    Act.commit()
  },
  async payVerify(token) {
    const k = payState(token)
    const ok = await run(`pay:${token}`, () => {
      if (String(k.code).trim() !== DEMO_LOGIN.otp) throw new Error('That code is not right. Check the SMS and try again.')
      return true
    })
    if (!ok) return
    Store.ui.customer = { phone: k.phone }
    const bill = Bills.byToken(S(), token)
    Act.payStep(bill.handover === 'DELIVERY' ? 'address' : 'method', token)
  },
  paySaved(token, saved) {
    payState(token).saved = saved
    Act.commit()
  },
  payAddress(token) {
    const db = S()
    const bill = Bills.byToken(db, token)
    const k = payState(token)
    const known = Bills.knownCustomer(db, bill.storeId, bill.customer.phone)
    let deliverTo
    let name
    if (known && known.address && k.saved) {
      deliverTo = known.address
      name = known.name
    } else {
      name = (k.name || bill.customer.name || '').trim()
      const e = name.length < 2 ? 'Enter your name.' : k.address.trim().length < 10 ? 'Enter your house, street and area.' : !SAMPLE_PINCODE.test(k.pincode.trim()) ? 'Enter a 6-digit pincode.' : null
      if (e) {
        Store.ui.errors[`pay:${token}`] = e
        return Act.commit()
      }
      deliverTo = `${k.address.trim()} — ${k.pincode.trim()}`
    }
    Object.assign(k, { deliverTo, payName: name })
    Act.payStep('method', token)
  },
  payMethod(token, method) {
    payState(token).method = method
    Act.commit()
  },
  /** The payment partner's page, faked: a short wait, then PaymentHub says paid. */
  async payNow(token) {
    const k = payState(token)
    const order = await run(`pay:${token}`, () => Store.change((db) => World.payBill(db, token, { method: k.method, address: k.deliverTo || null, name: k.payName || null })), { ms: 1600 })
    if (!order) return
    Store.ui.payState[token] = undefined
    UI.toast('Payment received')
    Act.commit()
    window.scrollTo(0, 0)
  },
  payNoop() {
    UI.toast('The customer is you here — use the seller app for the other side')
  },
})

App.reg('payHome', { path: '/', title: 'Bill links', auth: false, ...PayHome })
App.reg('payBill', { path: '/b/:token', title: 'Your bill', auth: false, ...PayScreen })
App.reg('login', { path: '/login', title: 'Sign in', auth: false, render: () => html`<div class="mx-auto max-w-md px-4 py-10">${UI.empty({ ico: 'user', title: 'No separate sign-in', description: 'Customers confirm their number on the bill page itself.', action: html`<a href="#/" class="${btn({ size: 'lg' })}">See bill links</a>` })}</div>` })

/** What js/app.js needs to start this app. */
const AppConfig = {
  home: 'payHome',
  view: () => html`${App.body()}${Store.ui.dialog && Store.ui.dialog.kind === 'confirm' ? UI.confirm(Store.ui.dialog) : ''}`,
  freshUi: () => ({ payState: {}, customer: null }),
  replyNow: 'payNoop',
  simulate: [],
  jumps: [
    ['payHome', 'All bill links'], ['payBill', 'New bill', { token: 'k3xp9q' }], ['payBill', 'Opened bill', { token: 'm8q2ra' }],
    ['payBill', 'Paid bill', { token: 'p4wz7n' }], ['payBill', 'Cash bill', { token: 't9vb3e' }], ['payBill', 'Expired bill', { token: 'w5hn2c' }],
  ],
}
