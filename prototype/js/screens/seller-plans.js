// Seller — Plans & pricing (#/plans). NEW: not in the real app yet.
//
// Not in the seller nav yet (that is planned separately). Reach it from the
// control panel's "Jump to" list, the launcher page, or a notification.
//
// What the seller can do here:
//   - see every live plan, monthly or yearly, and compare all features
//   - choose a plan: an upgrade (or any choice during the trial) starts now;
//     a smaller plan starts at the next renewal and can be undone ("Keep …")
//   - ask about a custom-priced plan (Enterprise): it lands in Admin → Support
// Everything shown comes from db.plans, which the admin edits in Plans & pricing.

const PlansScreen = {
  render() {
    const db = S()
    const store = Q.myStore(db)
    const sub = store.subscription
    const s = db.plans.settings
    const cycle = Store.ui.planCycle || 'MONTHLY'
    const live = Plans.live(db)
    const fixed = live.filter((p) => !Plans.isCustom(p))
    const custom = live.filter((p) => Plans.isCustom(p))
    const cols = fixed.length >= 4 ? 'lg:grid-cols-2 xl:grid-cols-4' : fixed.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'

    if (live.length === 0) {
      return html`<div class="ws-card rounded-lg">${UI.empty({ ico: 'card', title: 'No plans to show', description: 'UnieMax is updating its plans. Please check again soon.' })}</div>`
    }

    return html`<div class="space-y-6">
      ${plansHero(db, store, cycle)}
      ${UI.errorNote(Store.ui.errors.plan)}

      <section aria-label="Plans" class="grid gap-4 pt-3 sm:grid-cols-2 ${cols}">
        ${fixed.map((plan) => planCard(db, plan, { cycle, action: planAction(db, plan, sub, cycle), current: sub.planId !== plan.id ? false : sub.status === 'TRIAL' ? 'Trying now' : true }))}
      </section>

      ${custom.map((plan) => customBand(db, plan))}
      ${compareTable(db, live, cycle)}

      <section aria-label="Good to know" class="grid gap-3 sm:grid-cols-3">
        ${fact('check', s.trialDays > 0 ? `${s.trialDays}-day free trial` : 'No free trial', s.trialDays > 0 ? `New shops get ${planName(db, s.trialPlanId)} free for ${s.trialDays} days. Then ${planName(db, s.afterTrialPlanId)}, unless you choose a plan.` : 'You choose a plan when you open your shop.')}
        ${fact('chart', 'Change any time', 'A bigger plan starts straight away. A smaller plan starts at your next renewal.')}
        ${fact('rupee', s.pricesIncludeGst ? 'GST included' : `Prices + ${s.gstPct}% GST`, s.pricesIncludeGst ? `Every price already includes ${s.gstPct}% GST.` : `${s.gstPct}% GST is added to every bill. Your GST invoice is emailed to you.`)}
      </section>
    </div>`
  },
}

const planName = (db, id) => (Plans.get(db, id) || { name: '—' }).name

/** The aurora hero (same panel as the homepage's "Start selling online"): the pitch, the billing switch, and your plan. */
function plansHero(db, store, cycle) {
  const best = Math.max(0, ...Plans.live(db).map((p) => Plans.yearlySaving(db, p)))
  const option = (value, label, extra = '') => {
    const on = cycle === value
    return html`<button type="button" aria-pressed="${on}" data-act="planCycle" data-args="${args(value)}"
      class="inline-flex h-10 items-center gap-2 rounded-pill px-4 text-sm font-semibold transition-colors ${on ? 'bg-[var(--cta)] text-[var(--cta-contrast)]' : 'text-white/85 hover:text-white'}">${label}${extra}</button>`
  }
  return html`
    <section class="seller-aurora rounded-lg">
      <div class="grid gap-8 px-5 py-8 sm:px-8 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-center lg:gap-12 lg:px-10">
        <div>
          <p class="text-sm font-medium text-white/80">Plans & pricing</p>
          <h2 class="mt-2 font-heading text-3xl font-semibold leading-[1.1] sm:text-4xl">Grow your shop at your own pace</h2>
          <p class="mt-3 max-w-md text-sm text-white/90 sm:text-base">Start small and move up when you need more. Every plan has your online store, your products and your orders.</p>
          <div role="group" aria-label="How often you pay" class="aurora-frost mt-6 inline-flex rounded-pill p-1">
            ${option('MONTHLY', 'Monthly')}
            ${option('YEARLY', 'Yearly', best > 0 ? html`<span class="rounded-pill px-2 py-0.5 text-xs font-semibold ${cycle === 'YEARLY' ? 'bg-brand-soft text-brand' : 'bg-white/15 text-white'}">Save ${best}%</span>` : '')}
          </div>
        </div>
        ${yourPlanPane(db, store)}
      </div>
    </section>`
}

function yourPlanPane(db, store) {
  const sub = store.subscription
  const plan = Plans.get(db, sub.planId)
  const s = db.plans.settings
  const frostChip = (label) => html`<span class="aurora-frost inline-flex h-6 items-center rounded-pill px-2.5 text-xs font-semibold">${label}</span>`
  if (!plan) return html`<div class="aurora-pane rounded-lg p-5"><p class="text-sm text-white/80">Your plan</p><p class="mt-1 text-lg font-semibold">No plan yet</p></div>`

  if (sub.status === 'TRIAL') {
    const total = Math.max(1, s.trialDays)
    const left = Plans.daysLeft(sub.trialEndsAt)
    const used = Math.min(100, Math.max(4, ((total - left) / total) * 100))
    const after = Plans.get(db, s.afterTrialPlanId)
    return html`<div class="aurora-pane rounded-lg p-5 sm:p-6">
      <p class="text-sm text-white/80">Your plan</p>
      <div class="mt-1 flex flex-wrap items-center gap-2"><p class="font-heading text-2xl font-semibold">${plan.name}</p>${frostChip('Free trial')}</div>
      <p class="mt-4 flex items-baseline justify-between gap-3 text-sm"><span class="font-semibold">${left === 0 ? 'Ends today' : plural(left, 'day') + ' left'}</span><span class="text-white/80">Ends ${day(sub.trialEndsAt)}</span></p>
      <div class="mt-2 h-1.5 overflow-hidden rounded-pill bg-white/15" role="progressbar" aria-label="Trial used" aria-valuenow="${Math.round(used)}" aria-valuemin="0" aria-valuemax="100"><div class="h-full rounded-pill bg-white" style="width:${used}%"></div></div>
      <p class="mt-4 text-sm leading-relaxed text-white/85">${after ? `When the trial ends, your shop moves to ${after.name} (${money(after.monthly)} a month) unless you choose a plan.` : 'Choose a plan before the trial ends.'}</p>
    </div>`
  }

  const next = Plans.amount(db, plan, sub.cycle)
  const pending = sub.pending && Plans.get(db, sub.pending.planId)
  const busy = Store.ui.busy.keepPlan
  return html`<div class="aurora-pane rounded-lg p-5 sm:p-6">
    <p class="text-sm text-white/80">Your plan</p>
    <div class="mt-1 flex flex-wrap items-center gap-2"><p class="font-heading text-2xl font-semibold">${plan.name}</p>${frostChip(sub.cycle === 'YEARLY' ? 'Yearly' : 'Monthly')}</div>
    <dl class="mt-4 grid grid-cols-2 gap-4 border-t border-white/15 pt-4">
      <div><dt class="text-sm text-white/80">You pay</dt><dd class="mt-0.5 font-figure text-xl font-semibold">${money(sub.amount)}<span class="text-sm font-normal text-white/80"> ${sub.cycle === 'YEARLY' ? '/year' : '/month'}</span></dd></div>
      <div><dt class="text-sm text-white/80">Renews on</dt><dd class="mt-0.5 text-base font-semibold">${day(sub.renewsAt)}</dd></div>
    </dl>
    ${plan.status !== 'ACTIVE' ? html`<p class="mt-4 text-sm leading-relaxed text-white/85">${plan.name} is no longer offered to new shops. You keep it${plan.status === 'ARCHIVED' ? ` until ${day(sub.renewsAt)} — choose another plan before then` : ''}.</p>` : ''}
    ${!Plans.isCustom(plan) && next !== sub.amount && !pending ? html`<p class="mt-4 text-sm leading-relaxed text-white/85">New price from ${day(sub.renewsAt)}: <span class="font-semibold text-white">${money(next)} ${sub.cycle === 'YEARLY' ? 'a year' : 'a month'}</span>.</p>` : ''}
    ${pending ? html`<div class="aurora-frost mt-4 rounded-md p-3">
      <p class="text-sm leading-relaxed">You move to <span class="font-semibold">${pending.name}</span> on ${day(sub.renewsAt)}. Until then you keep everything in ${plan.name}.</p>
      <button type="button" data-act="keepPlan" ${busy ? 'disabled' : ''} class="${btn({ size: 'sm', cls: 'mt-3' })}">${busy ? spinner() : ''}${busy ? 'Saving…' : `Keep ${plan.name}`}</button>
    </div>` : ''}
  </div>`
}

/** The button under a plan's price. */
function planAction(db, plan, sub, cycle) {
  const current = Plans.get(db, sub.planId)
  const full = { size: 'lg', full: true }
  const busy = Store.ui.busy.plan
  const disabled = (label) => html`<button type="button" disabled class="${btn({ ...full, variant: 'secondary' })}">${label}</button>`
  if (sub.pending && sub.pending.planId === plan.id) return disabled(`Starts ${day(sub.renewsAt)}`)
  if (sub.status === 'ACTIVE' && sub.planId === plan.id) {
    if (sub.cycle === cycle) return disabled('Your current plan')
    return html`<button type="button" data-act="askPlan" data-args="${args(plan.id)}" ${busy ? 'disabled' : ''} class="${btn({ ...full, variant: 'secondary' })}">Switch to ${cycle === 'YEARLY' ? 'yearly' : 'monthly'}</button>`
  }
  const smaller = sub.status === 'ACTIVE' && current && plan.order < current.order
  const label = plan.cta || (sub.status === 'TRIAL' ? (plan.id === sub.planId ? `Keep ${plan.name}` : `Choose ${plan.name}`) : smaller ? `Switch to ${plan.name}` : `Upgrade to ${plan.name}`)
  const variant = smaller ? 'ghost' : plan.featured ? 'primary' : 'secondary'
  return html`<button type="button" data-act="askPlan" data-args="${args(plan.id)}" ${busy ? 'disabled' : ''} class="${btn({ ...full, variant, cls: smaller ? 'ring-1 ring-line' : '' })}">${label}${smaller ? '' : Icon('arrowRight', 'h-4 w-4')}</button>`
}

/** A custom-priced plan (Enterprise): a wide band under the cards. */
function customBand(db, plan) {
  const { prev, list } = Plans.added(db, plan)
  return html`
    <section class="ws-tint overflow-hidden rounded-lg">
      <div class="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-10 lg:p-8">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-brand">${plan.tier} · for ${plan.audience.toLowerCase()}</p>
          <h3 class="mt-1 font-heading text-2xl font-semibold leading-tight text-fg">${plan.name}</h3>
          <p class="mt-2 max-w-xl text-sm leading-relaxed text-muted">${plan.pitch}</p>
          <p class="mt-4 text-sm font-semibold text-fg">${prev ? `Everything in ${prev.name}, plus` : 'What you get'}</p>
          <ul class="mt-2 flex flex-wrap gap-2">${[...list.map((f) => f.label), `${Plans.limit(plan.limits.products)} products`, `${Plans.limit(plan.limits.staff)} staff`].map((label) => html`
            <li class="inline-flex h-8 items-center gap-1.5 rounded-pill border border-line bg-surface px-3 text-sm text-fg">${Icon('check', 'h-3.5 w-3.5 text-brand')}${label}</li>`)}</ul>
        </div>
        <div class="flex flex-col gap-3 lg:w-64">
          <p class="font-figure text-3xl font-semibold leading-none text-fg">Custom price</p>
          <p class="text-hint text-muted">Tell us about your shop. We reply within one working day.</p>
          <button type="button" data-act="askEnterprise" data-args="${args(plan.id)}" class="${btn({ size: 'lg', full: true, variant: 'secondary' })}">${plan.cta || 'Talk to us'}${Icon('arrowRight', 'h-4 w-4')}</button>
        </div>
      </div>
    </section>`
}

/** Every feature, every plan. Scrolls sideways on a phone with the feature names pinned. */
function compareTable(db, plans, cycle) {
  const head = (p) => html`<th scope="col" class="min-w-[120px] px-3 py-3 text-left align-bottom font-normal ${p.featured ? 'bg-brand-soft' : ''}">
    <span class="block text-sm font-semibold text-fg">${p.name}</span>
    <span class="block font-figure text-hint text-muted">${Plans.isCustom(p) ? 'Custom' : `${money(Plans.perMonth(db, p, cycle))}/month`}</span></th>`
  const cell = (p, body) => html`<td class="px-3 py-3 ${p.featured ? 'bg-brand-soft' : ''}">${body}</td>`
  const label = (text) => html`<th scope="row" class="sticky left-0 z-10 bg-surface py-3 pr-3 pl-4 text-left text-sm font-normal text-fg sm:pl-5">${text}</th>`
  const group = (title) => html`<tr><th colspan="${plans.length + 1}" scope="colgroup" class="sticky left-0 bg-surface-alt px-4 py-2 text-left text-xs font-semibold text-muted sm:px-5">${title}</th></tr>`
  const yes = html`<span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-brand">${Icon('check', 'h-3.5 w-3.5')}</span><span class="sr-only">Included</span>`
  const no = html`<span aria-hidden="true" class="text-muted">—</span><span class="sr-only">Not included</span>`
  const limitRow = (text, fn) => html`<tr class="border-t border-line">${label(text)}${plans.map((p) => cell(p, html`<span class="font-figure text-sm font-medium text-fg">${fn(p)}</span>`))}</tr>`

  return html`
    <section class="ws-card overflow-hidden rounded-lg">
      <header class="px-4 py-4 sm:px-5">
        <h3 class="font-heading text-lg font-semibold text-fg">Compare all features</h3>
        <p class="mt-0.5 text-sm text-muted">See exactly what each plan includes.</p>
      </header>
      <div class="overflow-x-auto border-t border-line">
        <table class="w-full min-w-[640px] border-collapse">
          <thead><tr><th scope="col" class="sticky left-0 z-10 bg-surface py-3 pr-3 pl-4 text-left text-xs font-semibold text-muted sm:pl-5">Feature</th>${plans.map(head)}</tr></thead>
          <tbody>
            ${group('Limits')}
            ${limitRow('Products', (p) => Plans.limit(p.limits.products))}
            ${limitRow('Staff accounts', (p) => Plans.limit(p.limits.staff))}
            ${limitRow('Photo storage', (p) => Plans.limit(p.limits.storageGb, ' GB'))}
            ${limitRow('Order fee', (p) => Plans.fee(db, p))}
            ${Object.entries(FEATURE_GROUPS).map(([key, title]) => {
              const rows = db.plans.features.filter((f) => f.group === key)
              if (rows.length === 0) return ''
              return html`${group(title)}${rows.map((f) => html`<tr class="border-t border-line">${label(f.label)}${plans.map((p) => cell(p, f.on.includes(p.id) ? yes : no))}</tr>`)}`
            })}
          </tbody>
        </table>
      </div>
    </section>`
}

const fact = (ico, title, text) => html`
  <div class="ws-card flex gap-3 rounded-lg p-4">
    <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">${Icon(ico, 'h-[18px] w-[18px]')}</span>
    <div class="min-w-0"><p class="text-sm font-semibold text-fg">${title}</p><p class="mt-0.5 text-hint leading-relaxed text-muted">${text}</p></div>
  </div>`

// ===========================================================================
// Dialogs
// ===========================================================================

DIALOGS.plan = (d) => {
  const db = S()
  const plan = Plans.get(db, d.planId)
  const sub = Q.myStore(db).subscription
  const current = Plans.get(db, sub.planId)
  if (!plan || plan.status !== 'ACTIVE') return UI.modal({ title: 'Plan not available', body: UI.infoNote('This plan is no longer offered. Close this and look again.') })
  const cycle = d.cycle
  const amount = Plans.amount(db, plan, cycle)
  const s = db.plans.settings
  const total = Plans.withGst(db, amount)
  const smaller = sub.status === 'ACTIVE' && current && plan.order < current.order
  const lost = current && smaller ? Plans.lost(db, current, plan) : []
  const busy = Store.ui.busy.plan
  const row = (k, v, strong = false) => html`<div class="flex justify-between gap-3 ${strong ? 'border-t border-line pt-2 font-semibold' : ''}"><dt class="${strong ? 'text-fg' : 'text-muted'}">${k}</dt><dd class="text-right text-fg">${v}</dd></div>`
  const per = cycle === 'YEARLY' ? 'a year' : 'a month'

  return UI.modal({
    title: smaller ? `Move to ${plan.name}?` : sub.planId === plan.id && sub.status === 'ACTIVE' ? `Pay ${cycle === 'YEARLY' ? 'yearly' : 'monthly'}?` : `Start ${plan.name}?`,
    subtitle: `${plan.tier} · for ${plan.audience.toLowerCase()}`,
    body: html`<div class="space-y-4">
      <dl class="ws-well space-y-1.5 rounded-md p-4 text-base">
        ${row('Plan', plan.name)}
        ${row('Billing', cycle === 'YEARLY' ? 'Once a year' : 'Every month')}
        ${row('Price', `${money(amount)} ${per}`)}
        ${s.pricesIncludeGst ? '' : row(`GST (${s.gstPct}%)`, money(total - amount))}
        ${row(smaller ? `From ${day(sub.renewsAt)}` : 'You pay today', `${money(total)}`, true)}
      </dl>
      ${smaller
        ? html`<p class="text-base text-fg">You keep ${current.name} until <span class="font-semibold">${day(sub.renewsAt)}</span>. Then ${plan.name} starts and you pay ${money(total)} ${per}.</p>
          ${lost.length ? html`<div><p class="text-sm font-semibold text-fg">You lose from ${day(sub.renewsAt)}</p><ul class="mt-2 space-y-1.5">${lost.map((f) => html`<li class="flex items-center gap-2 text-sm text-muted">${Icon('x', 'h-4 w-4 text-danger')}${f.label}</li>`)}</ul></div>` : ''}
          ${plan.limits.products !== null && Q.stats(db, Q.myStore(db)).products > plan.limits.products ? UI.errorNote(`${plan.name} allows ${count(plan.limits.products)} products. You have ${count(Q.stats(db, Q.myStore(db)).products)} — hide some before ${day(sub.renewsAt)}.`) : ''}`
        : html`<p class="text-base text-fg">${plan.name} starts straight away${sub.status === 'TRIAL' ? ' and your free trial ends' : ''}. Your next bill is on <span class="font-semibold">${day(addCycle(new Date().toISOString(), cycle))}</span>.</p>`}
      <p class="text-hint text-muted">Prototype: the payment is pretend. The real app opens the payment page here.</p>
      ${UI.errorNote(Store.ui.errors.plan)}
    </div>`,
    footer: html`<button type="button" data-act="closeDialog" class="${btn({ variant: 'secondary' })}">Not now</button>
      <button type="button" data-act="choosePlan" data-args="${args(plan.id, cycle)}" ${busy ? 'disabled' : ''} class="${btn()}">${busy ? spinner() : ''}${busy ? 'Please wait…' : smaller ? `Move to ${plan.name}` : `Pay ${money(total)}`}</button>`,
  })
}

DIALOGS.enterprise = (d) => {
  const db = S()
  const plan = Plans.get(db, d.planId)
  const owner = Q.owner(db, Q.myStore(db))
  const busy = Store.ui.busy.enterprise
  const select = (name, label, options) => html`<label class="block"><span class="${FIELD_LABEL}">${label}</span>
    <select name="${name}" class="${FIELD}">${options.map((o) => html`<option>${o}</option>`)}</select></label>`
  return UI.modal({
    title: `Ask about ${plan ? plan.name : 'a custom plan'}`,
    subtitle: 'The UnieMax team replies within one working day',
    body: html`<form id="enterprise-form" data-submit="sendEnterprise" class="space-y-4">
      <div class="grid gap-4 sm:grid-cols-2">
        ${select('products', 'Products you sell', ['Up to 1,000', '1,000 to 10,000', 'More than 10,000'])}
        ${select('orders', 'Orders a month', ['Up to 500', '500 to 5,000', 'More than 5,000'])}
      </div>
      <label class="block"><span class="${FIELD_LABEL}">Phone</span><input name="phone" value="${owner.phone || ''}" required class="${FIELD}" /></label>
      <label class="block"><span class="${FIELD_LABEL}">What do you need? <span class="font-normal text-muted">(optional)</span></span>
        <textarea name="message" rows="3" class="${FIELD.replace('h-field', 'min-h-24 py-3')}" placeholder="For example: 5 staff logins, our own courier, many warehouses"></textarea></label>
      ${UI.errorNote(Store.ui.errors.enterprise)}
    </form>`,
    footer: html`<button type="button" data-act="closeDialog" class="${btn({ variant: 'secondary' })}">Cancel</button>
      <button type="submit" form="enterprise-form" ${busy ? 'disabled' : ''} class="${btn()}">${busy ? spinner() : ''}${busy ? 'Sending…' : 'Send to UnieMax'}</button>`,
  })
}

// ===========================================================================
// Act
// ===========================================================================

Object.assign(Act, {
  planCycle(cycle) {
    Store.ui.planCycle = cycle
    Act.commit()
  },
  askPlan(planId) {
    Store.ui.errors.plan = null
    Store.ui.dialog = { kind: 'plan', planId, cycle: Store.ui.planCycle || 'MONTHLY' }
    Act.commit()
  },
  async choosePlan(planId, cycle) {
    const result = await run('plan', () => Store.change((db) => World.choosePlan(db, planId, cycle)), { ms: 1200 })
    if (!result) return // the error shows in the open dialog
    Store.ui.dialog = null
    UI.toast(result.when === 'now' ? `Payment received — you are on ${result.plan.name}` : `You move to ${result.plan.name} on ${day(result.at)}`)
    Act.commit()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  },
  keepPlan() {
    return run('keepPlan', () => Store.change((db) => World.keepPlan(db)), { ok: 'Your plan stays as it is' })
  },
  askEnterprise(planId) {
    Store.ui.errors.enterprise = null
    Store.ui.dialog = { kind: 'enterprise', planId }
    Act.commit()
  },
  async sendEnterprise(values) {
    const db = S()
    const store = Q.myStore(db)
    const ticket = await run('enterprise', () =>
      Store.change((d) =>
        World.createTicket(d, {
          subject: `Enterprise plan enquiry — ${store.name}`,
          category: 'OTHER',
          body: `Products: ${values.products}\nOrders a month: ${values.orders}\n\n${values.message.trim() || 'Please call me about a custom plan.'}`,
          email: Q.owner(db, store).email,
          phone: values.phone.trim(),
        }),
      ),
    )
    if (!ticket) return
    Store.ui.dialog = null
    UI.toast('Sent — UnieMax will call you. Track it in Help from UnieMax.')
    Act.commit()
    maybeAutoAnswer(ticket.id, `Hi, thanks for your interest in a custom plan. Someone from our sales team (${db.plans.settings.salesEmail}) will call you within one working day.`)
  },

  // ---- simulate (control panel) ----
  /** UnieMax changes the price of the plan I am on (or am trialling). */
  simPlanPrice() {
    const db = S()
    const sub = Q.myStore(db).subscription
    const plan = Plans.get(db, sub.planId)
    if (!plan || Plans.isCustom(plan)) return UI.toast('Your plan has no list price to change')
    const features = Plans.features(db, plan).map((f) => f.key)
    try {
      Store.change((d) => World.savePlan(d, plan.id, { ...plan, monthly: plan.monthly + 50, features }))
      UI.toast(`UnieMax raised ${plan.name} to ${money(plan.monthly + 50)} a month`)
    } catch (err) {
      UI.toast(err.message, 'danger')
    }
    Act.commit()
  },
})

App.reg('plans', { path: '/plans', title: 'Plans & pricing', tab: true, parent: 'dashboard', ...PlansScreen, skeleton: cards('h-64', 'h-[520px]', 'h-40') })

AppConfig.jumps.push(['plans', 'Plans (new)'])
AppConfig.simulate.push({ act: 'simPlanPrice', label: 'UnieMax changes my plan’s price' })
