// Plans & pricing — shared by both apps. NEW: not in the real app yet.
//
//   db.plans = {
//     settings  { yearlyDiscountPct, trialDays, trialPlanId, afterTrialPlanId,
//                 gstPct, pricesIncludeGst, priceChangeRule, salesEmail }
//     list      [{ id, name, tier, tone, audience, pitch, pricing: FIXED|CUSTOM,
//                  monthly, yearly (null = from the yearly discount), status,
//                  featured, badge, cta, order, limits { products, staff, storageGb },
//                  feePct (null = the platform fee), otherSellers }]
//     features  [{ key, group, label, on: [planId…] }]   the feature matrix
//     history   [{ id, at, by, text }]                    who changed what
//     otherTrials  sellers on a trial outside the demo stores (dashboard numbers)
//   }
//   store.subscription = { planId, cycle: MONTHLY|YEARLY, status: TRIAL|ACTIVE,
//                          amount, startedAt, renewsAt, trialEndsAt, pending }
//
// Plans      selectors (prices, features, seller counts)
// planCard() the plan card — the seller screen and the admin preview draw the same one
// World.*    the plan rules, added to World like the ones in store.js

const FEATURE_GROUPS = { store: 'Your shop', selling: 'Selling', insights: 'Insights', team: 'Team & support' }

STATUS.plan = {
  ACTIVE: { label: 'Live', tone: 'success', desc: 'Sellers see it and can choose it' },
  HIDDEN: { label: 'Hidden', tone: 'neutral', desc: 'Not shown to sellers. Sellers already on it keep it' },
  DRAFT: { label: 'Draft', tone: 'warning', desc: 'Being prepared. Sellers never see it' },
  ARCHIVED: { label: 'Archived', tone: 'danger', desc: 'Retired. Sellers on it move to another plan at renewal' },
}
STATUS.subscription = {
  TRIAL: { label: 'Free trial', tone: 'pending' },
  ACTIVE: { label: 'Active', tone: 'success' },
}
const PLAN_RULES = {
  RENEWAL: 'Sellers already on the plan keep their price until renewal',
  NOW: 'Everyone moves to the new price straight away',
}

// ===========================================================================
// Selectors
// ===========================================================================

const DAY_MS = 864e5

const Plans = {
  all: (db) => [...db.plans.list].sort((a, b) => a.order - b.order),
  get: (db, id) => db.plans.list.find((p) => p.id === id) || null,
  /** Live plans, in the order sellers see them. */
  live: (db) => Plans.all(db).filter((p) => p.status === 'ACTIVE'),
  isCustom: (plan) => plan.pricing === 'CUSTOM',

  yearly(db, plan) {
    if (Plans.isCustom(plan)) return null
    if (plan.yearly !== null && plan.yearly !== undefined) return plan.yearly
    return Math.round(plan.monthly * 12 * (1 - db.plans.settings.yearlyDiscountPct / 100))
  },
  /** What one bill costs for a cycle. */
  amount: (db, plan, cycle) => (cycle === 'YEARLY' ? Plans.yearly(db, plan) : plan.monthly),
  /** The monthly figure shown big on a card. */
  perMonth: (db, plan, cycle) => (cycle === 'YEARLY' ? Math.round(Plans.yearly(db, plan) / 12) : plan.monthly),
  /** How much cheaper yearly is, in %, from the real prices (an override may differ from the setting). */
  yearlySaving(db, plan) {
    if (Plans.isCustom(plan) || !plan.monthly) return 0
    return Math.max(0, Math.round((1 - Plans.yearly(db, plan) / (plan.monthly * 12)) * 100))
  },
  withGst: (db, amount) => (db.plans.settings.pricesIncludeGst ? amount : Math.round(amount * (1 + db.plans.settings.gstPct / 100))),

  features: (db, plan) => db.plans.features.filter((f) => f.on.includes(plan.id)),
  has: (db, plan, key) => db.plans.features.some((f) => f.key === key && f.on.includes(plan.id)),
  /** The live plan just below this one, and what this one adds on top of it. */
  added(db, plan) {
    const below = Plans.live(db).filter((p) => p.order < plan.order && p.id !== plan.id)
    const prev = below[below.length - 1] || null
    const list = Plans.features(db, plan).filter((f) => !prev || !f.on.includes(prev.id))
    return { prev, list }
  },
  /** Features a seller loses moving from one plan to another. */
  lost: (db, from, to) => Plans.features(db, from).filter((f) => !f.on.includes(to.id)),

  /** Paying sellers: the platform-wide number plus the demo stores. */
  sellers: (db, plan) => plan.otherSellers + db.stores.filter((s) => s.subscription && s.subscription.planId === plan.id && s.subscription.status === 'ACTIVE').length,
  trials: (db) => db.plans.otherTrials + db.stores.filter((s) => s.subscription && s.subscription.status === 'TRIAL').length,
  /** Monthly recurring revenue, before GST. Custom plans have no list price. */
  mrr: (db, plan) => (Plans.isCustom(plan) ? null : Plans.sellers(db, plan) * plan.monthly),

  limit: (value, unit = '') => (value === null || value === undefined ? 'Unlimited' : `${count(value)}${unit}`),
  fee: (db, plan) => `${plan.feePct ?? db.fees.platformPct}%`,
  daysLeft: (iso) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS)),
  /** "₹699" / "Custom". */
  priceLabel: (db, plan, cycle = 'MONTHLY') => (Plans.isCustom(plan) ? 'Custom' : money(Plans.amount(db, plan, cycle))),
}

const addCycle = (from, cycle) => {
  const d = new Date(from)
  if (cycle === 'YEARLY') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  return d.toISOString()
}

// ===========================================================================
// The plan card (seller screen + admin preview)
// ===========================================================================

const PLAN_TONE_TEXT = { success: 'text-success', brand: 'text-brand', info: 'text-accent', warning: 'text-warning', neutral: 'text-muted' }

/**
 * One plan, as sellers see it.
 *   cycle     'MONTHLY' | 'YEARLY'
 *   action    html for the button area (the seller screen decides what it does)
 *   preview   true in the admin editor: no hover lift
 *   current   true → "Your plan" chip; a string → that chip text ("Trying now")
 */
function planCard(db, plan, { cycle = 'MONTHLY', action = '', preview = false, current = false } = {}) {
  const featured = plan.featured
  const { prev, list } = Plans.added(db, plan)
  const custom = Plans.isCustom(plan)
  const yearly = cycle === 'YEARLY' && !custom
  const check = html`<span aria-hidden="true" class="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${featured ? 'bg-brand text-brand-contrast' : 'bg-brand-soft text-brand'}">${Icon('check', 'h-3 w-3')}</span>`
  const limit = (label, value) => html`<div class="min-w-0"><dt class="truncate text-xs text-muted">${label}</dt><dd class="mt-0.5 truncate font-figure text-sm font-semibold text-fg">${value}</dd></div>`

  return html`
    <article class="relative flex h-full flex-col rounded-lg p-5 sm:p-6 ${featured ? 'ws-card shadow-floating ring-2 ring-brand' : 'ws-card'} ${preview ? '' : 'transition-transform duration-200 hover:-translate-y-0.5'}">
      ${featured && plan.badge ? html`<span class="absolute -top-3 left-5 inline-flex h-6 items-center gap-1.5 rounded-pill bg-brand px-3 text-xs font-semibold text-brand-contrast">${Icon('check', 'h-3 w-3')}${plan.badge}</span>` : ''}
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-semibold ${PLAN_TONE_TEXT[plan.tone] || 'text-muted'}">${plan.tier}</p>
          <h3 class="mt-0.5 font-heading text-2xl font-semibold leading-tight text-fg">${plan.name}</h3>
        </div>
        ${current ? html`<span class="inline-flex h-6 shrink-0 items-center rounded-pill bg-success/12 px-2.5 text-xs font-semibold text-success">${current === true ? 'Your plan' : current}</span>` : ''}
      </div>
      <p class="mt-2 min-h-10 text-sm leading-relaxed text-muted">${plan.pitch}</p>

      <div class="mt-5">
        ${custom
          ? html`<p class="font-figure text-4xl font-semibold leading-none tracking-tight text-fg">Custom</p>
                 <p class="mt-2 text-hint text-muted">Priced for your volume</p>`
          : html`<p class="flex items-baseline gap-1.5">
                   <span class="font-figure text-4xl font-semibold leading-none tracking-tight tabular-nums text-fg">${money(Plans.perMonth(db, plan, cycle))}</span>
                   <span class="text-sm text-muted">/month</span>
                   ${yearly && Plans.yearlySaving(db, plan) > 0 ? html`<span class="ml-1 text-sm text-muted line-through">${money(plan.monthly)}</span>` : ''}
                 </p>
                 <p class="mt-2 text-hint text-muted">${yearly ? `${money(Plans.yearly(db, plan))} billed once a year` : 'Billed every month'}${db.plans.settings.pricesIncludeGst ? ' · GST included' : ' + GST'}</p>`}
      </div>

      ${action ? html`<div class="mt-5">${action}</div>` : ''}

      <div class="my-5 h-px bg-line"></div>
      <div class="flex-1">
        <p class="text-sm font-semibold text-fg">${prev ? `Everything in ${prev.name}, plus` : 'What you get'}</p>
        ${list.length === 0
          ? html`<p class="mt-3 text-sm text-muted">No extra features yet.</p>`
          : html`<ul class="mt-3 space-y-2.5">${list.map((f) => html`<li class="flex items-start gap-2.5 text-sm text-fg">${check}<span class="min-w-0">${f.label}</span></li>`)}</ul>`}
      </div>

      <dl class="ws-well mt-5 grid grid-cols-3 gap-2 rounded-md px-3 py-2.5">
        ${limit('Products', Plans.limit(plan.limits.products))}
        ${limit('Staff', Plans.limit(plan.limits.staff))}
        ${limit('Order fee', Plans.fee(db, plan))}
      </dl>
    </article>`
}

// ===========================================================================
// Rules — check, change, log (Store.emit), tell the other side (Act.notify)
// ===========================================================================

const planLog = (db, text) => {
  db.plans.history.unshift({ id: `ph${Store.nextId(db, 'planLog')}`, at: new Date().toISOString(), by: db.admin.name, text })
  db.plans.history = db.plans.history.slice(0, 60)
}

const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)

Object.assign(World, {
  // ---- seller ----
  /** Upgrades (and any choice during the trial) start now; a smaller plan starts at renewal. */
  choosePlan(db, planId, cycle) {
    const store = Q.myStore(db)
    const plan = Plans.get(db, planId)
    if (!plan || plan.status !== 'ACTIVE') throw new Error('This plan is no longer offered. Refresh to see the current plans.')
    if (Plans.isCustom(plan)) throw new Error(`${plan.name} is priced for each brand. Send us a message instead.`)
    const sub = store.subscription
    const current = Plans.get(db, sub.planId)
    if (sub.status === 'ACTIVE' && sub.planId === planId && sub.cycle === cycle) throw new Error(`You are already on ${plan.name}.`)
    const amount = Plans.amount(db, plan, cycle)
    const smaller = sub.status === 'ACTIVE' && current && plan.order < current.order
    if (smaller) {
      sub.pending = { planId, cycle, amount }
      Act.notify(db, 'admin', `${store.name} is moving to ${plan.name}`, `From ${day(sub.renewsAt)} · ${money(amount)} ${cycle === 'YEARLY' ? 'a year' : 'a month'}`, `/stores/${store.id}`)
      Store.emit('plan.downgrade', `${store.name} moves to ${plan.name} at renewal`, { ref: store.id })
      return { when: 'renewal', plan, at: sub.renewsAt }
    }
    const now = new Date().toISOString()
    store.subscription = { planId, cycle, status: 'ACTIVE', amount, startedAt: now, renewsAt: addCycle(now, cycle), trialEndsAt: null, pending: null }
    Act.notify(db, 'admin', `${store.name} chose ${plan.name}`, `${money(amount)} ${cycle === 'YEARLY' ? 'a year' : 'a month'}`, `/stores/${store.id}`)
    Store.emit('plan.choose', `${store.name} is now on ${plan.name} (${cycle === 'YEARLY' ? 'yearly' : 'monthly'})`, { ref: store.id })
    return { when: 'now', plan }
  },

  keepPlan(db) {
    const store = Q.myStore(db)
    const sub = store.subscription
    if (!sub.pending) throw new Error('There is no plan change waiting.')
    sub.pending = null
    Store.emit('plan.keep', `${store.name} cancelled its plan change`, { ref: store.id })
  },

  // ---- admin: plans ----
  addPlan(db) {
    const n = Store.nextId(db, 'plan')
    const last = Plans.all(db).pop()
    const plan = {
      id: `plan_${n}`, name: `New plan ${n}`, tier: 'New', tone: 'neutral', audience: 'Who is it for?', pitch: 'One line on why a seller picks this plan.',
      pricing: 'FIXED', monthly: 999, yearly: null, status: 'DRAFT', featured: false, badge: '', cta: '', order: (last ? last.order : 0) + 1,
      limits: { products: 500, staff: 1, storageGb: 5 }, feePct: null, otherSellers: 0, createdAt: new Date().toISOString(),
    }
    db.plans.list.push(plan)
    planLog(db, `Created the draft plan “${plan.name}”`)
    Store.emit('plan.add', `New draft plan “${plan.name}”`, { ref: plan.id })
    return plan
  },

  /** Save the editor's draft. Checks first, then writes, logs and tells the seller if it touches them. */
  savePlan(db, id, d) {
    const plan = Plans.get(db, id)
    if (!plan) throw new Error('This plan no longer exists.')
    const s = db.plans.settings
    const name = String(d.name || '').trim()
    if (name.length < 2 || name.length > 30) throw new Error('Give the plan a name of 2 to 30 letters.')
    if (db.plans.list.some((p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) throw new Error(`Another plan is already called “${name}”.`)
    const custom = d.pricing === 'CUSTOM'
    if (!custom && (!Number.isFinite(d.monthly) || d.monthly < 0)) throw new Error('Enter a monthly price (0 or more).')
    if (!custom && d.yearly !== null && (!Number.isFinite(d.yearly) || d.yearly < 0)) throw new Error('The yearly price must be 0 or more — or leave it empty to use the yearly discount.')
    if (d.status !== 'ACTIVE' && (s.trialPlanId === id || s.afterTrialPlanId === id))
      throw new Error(`${plan.name} is used for the free trial. Pick another plan under Billing rules first.`)
    if (custom && (s.trialPlanId === id || s.afterTrialPlanId === id)) throw new Error('The trial plan needs a fixed price.')
    for (const key of ['products', 'staff', 'storageGb']) {
      const v = d.limits[key]
      if (v !== null && (!Number.isInteger(v) || v < 0)) throw new Error('Limits are whole numbers — or empty for unlimited.')
    }
    if (d.feePct !== null && (!Number.isFinite(d.feePct) || d.feePct < 0 || d.feePct > 20)) throw new Error('The order fee is between 0 and 20%.')

    // What changed, in words, for the history and the seller.
    const changes = []
    const was = { ...plan, limits: { ...plan.limits } }
    const priceMoved = !custom && (was.monthly !== d.monthly || (was.yearly ?? null) !== (d.yearly ?? null))
    if (was.name !== name) changes.push(`renamed to “${name}”`)
    if (priceMoved) changes.push(`price ${was.monthly === null ? 'set' : `${money(was.monthly)} →`} ${money(d.monthly)} a month`)
    if (was.pricing !== d.pricing) changes.push(custom ? 'now custom-priced' : 'now fixed-priced')
    if (was.status !== d.status) changes.push(`${STATUS.plan[was.status].label} → ${STATUS.plan[d.status].label}`)
    if (!was.featured && d.featured) changes.push('set as the featured plan')
    if (JSON.stringify(was.limits) !== JSON.stringify(d.limits) || (was.feePct ?? null) !== (d.feePct ?? null)) changes.push('limits changed')
    const before = new Set(Plans.features(db, plan).map((f) => f.key))
    const after = new Set(d.features)
    const addedF = db.plans.features.filter((f) => after.has(f.key) && !before.has(f.key)).map((f) => f.label)
    const removedF = db.plans.features.filter((f) => before.has(f.key) && !after.has(f.key)).map((f) => f.label)
    if (addedF.length) changes.push(`added ${addedF.join(', ')}`)
    if (removedF.length) changes.push(`removed ${removedF.join(', ')}`)
    if (['tier', 'tone', 'audience', 'pitch', 'badge', 'cta'].some((k) => (was[k] || '') !== (d[k] || ''))) changes.push('wording updated')
    if (changes.length === 0) throw new Error('Nothing has changed.')

    Object.assign(plan, {
      name, tier: String(d.tier || '').trim(), tone: d.tone, audience: String(d.audience || '').trim(), pitch: String(d.pitch || '').trim(),
      pricing: d.pricing, monthly: custom ? null : d.monthly, yearly: custom ? null : d.yearly, status: d.status,
      featured: !!d.featured, badge: String(d.badge || '').trim(), cta: String(d.cta || '').trim(), limits: { ...d.limits }, feePct: d.feePct,
    })
    if (plan.featured) db.plans.list.forEach((p) => { if (p.id !== id) p.featured = false })
    for (const f of db.plans.features) {
      const on = after.has(f.key)
      f.on = on ? [...new Set([...f.on, id])] : f.on.filter((x) => x !== id)
    }

    // Sellers already on the plan.
    const mine = Q.myStore(db).subscription
    for (const store of db.stores) {
      const sub = store.subscription
      if (!sub || sub.planId !== id || sub.status !== 'ACTIVE' || !priceMoved) continue
      if (s.priceChangeRule === 'NOW') sub.amount = Plans.amount(db, plan, sub.cycle)
    }
    if (mine.planId === id) {
      if (priceMoved && mine.status === 'ACTIVE') {
        const next = money(Plans.amount(db, plan, mine.cycle))
        Act.notify(db, 'seller', `${plan.name} has a new price`, s.priceChangeRule === 'NOW' ? `You now pay ${next}.` : `You keep your price until ${day(mine.renewsAt)}. Then ${next}.`, '/plans')
      } else if (was.status === 'ACTIVE' && plan.status === 'ARCHIVED') {
        Act.notify(db, 'seller', `${plan.name} is being retired`, `You keep it until ${day(mine.renewsAt)}. Choose another plan before then.`, '/plans')
      }
    }

    planLog(db, `${plan.name}: ${changes.join(' · ')}`)
    Store.emit('plan.save', `Plan ${plan.name} updated — ${changes[0]}`, { ref: id })
    return plan
  },

  movePlan(db, id, dir) {
    const list = Plans.all(db)
    const i = list.findIndex((p) => p.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    const a = list[i]
    const b = list[j]
    ;[a.order, b.order] = [b.order, a.order]
    planLog(db, `${a.name} moved ${dir < 0 ? 'up' : 'down'}`)
    Store.emit('plan.order', `Plan order changed`, { ref: id })
  },

  deletePlan(db, id) {
    const plan = Plans.get(db, id)
    if (!plan) throw new Error('This plan no longer exists.')
    if (plan.status !== 'DRAFT' || Plans.sellers(db, plan) > 0) throw new Error('Only a draft with no sellers can be deleted. Archive it instead.')
    db.plans.list = db.plans.list.filter((p) => p.id !== id)
    db.plans.features.forEach((f) => (f.on = f.on.filter((x) => x !== id)))
    planLog(db, `Deleted the draft “${plan.name}”`)
    Store.emit('plan.delete', `Draft plan “${plan.name}” deleted`, { ref: id })
  },

  // ---- admin: the feature matrix ----
  setFeature(db, key, planId, on) {
    const f = db.plans.features.find((x) => x.key === key)
    const plan = Plans.get(db, planId)
    if (!f || !plan) throw new Error('This feature or plan no longer exists.')
    f.on = on ? [...new Set([...f.on, planId])] : f.on.filter((x) => x !== planId)
    planLog(db, `${f.label} ${on ? 'added to' : 'removed from'} ${plan.name}`)
    Store.emit('plan.feature', `${f.label} ${on ? 'added to' : 'removed from'} ${plan.name}`, { ref: planId })
  },

  addFeature(db, { label, group }) {
    label = String(label || '').trim()
    if (label.length < 3 || label.length > 40) throw new Error('Name the feature in 3 to 40 letters.')
    if (!FEATURE_GROUPS[group]) throw new Error('Pick a group.')
    let key = slug(label)
    if (db.plans.features.some((f) => f.key === key)) throw new Error(`A feature with the key “${key}” already exists.`)
    // New features start on the top live plans (Pro and Enterprise today) — tick more in the matrix.
    const live = Plans.live(db)
    const on = live.slice(-2).map((p) => p.id)
    const lastInGroup = db.plans.features.map((f) => f.group).lastIndexOf(group)
    db.plans.features.splice(lastInGroup + 1, 0, { key, group, label, on })
    planLog(db, `New feature “${label}” in ${FEATURE_GROUPS[group]}`)
    Store.emit('plan.feature', `New plan feature “${label}”`, { ref: key })
    return key
  },

  removeFeature(db, key) {
    const f = db.plans.features.find((x) => x.key === key)
    if (!f) throw new Error('This feature no longer exists.')
    db.plans.features = db.plans.features.filter((x) => x.key !== key)
    planLog(db, `Removed the feature “${f.label}” from every plan`)
    Store.emit('plan.feature', `Plan feature “${f.label}” removed`, { ref: key })
  },

  savePlanSettings(db, v) {
    const n = (x) => (x === '' || x === undefined ? NaN : Number(x))
    const next = {
      yearlyDiscountPct: n(v.yearlyDiscountPct), trialDays: n(v.trialDays), gstPct: n(v.gstPct),
      trialPlanId: v.trialPlanId, afterTrialPlanId: v.afterTrialPlanId, pricesIncludeGst: v.pricesIncludeGst === 'on',
      priceChangeRule: v.priceChangeRule === 'NOW' ? 'NOW' : 'RENEWAL', salesEmail: String(v.salesEmail || '').trim(),
    }
    if (!Number.isInteger(next.yearlyDiscountPct) || next.yearlyDiscountPct < 0 || next.yearlyDiscountPct > 90) throw new Error('The yearly discount is a whole number from 0 to 90.')
    if (!Number.isInteger(next.trialDays) || next.trialDays < 0 || next.trialDays > 90) throw new Error('The free trial is 0 to 90 days (0 = no trial).')
    if (!Number.isFinite(next.gstPct) || next.gstPct < 0 || next.gstPct > 28) throw new Error('GST is between 0 and 28%.')
    for (const id of [next.trialPlanId, next.afterTrialPlanId]) {
      const p = Plans.get(db, id)
      if (!p || p.status !== 'ACTIVE' || Plans.isCustom(p)) throw new Error('The trial plans must be live and have a fixed price.')
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next.salesEmail)) throw new Error('Enter the email that receives Enterprise enquiries.')
    db.plans.settings = next
    planLog(db, 'Billing rules updated')
    Store.emit('plan.settings', 'Billing rules for plans updated')
  },
})
