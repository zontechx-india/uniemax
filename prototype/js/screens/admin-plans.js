// Admin — Plans & pricing (#/plans, #/plans/:id). NEW: not in the real console yet.
//
//   Plans & pricing   numbers (paying sellers, MRR, trials), the plan list (order,
//                     price, status, sellers), the feature matrix, billing rules
//                     (yearly discount, trial, GST, price-change rule) and history
//   Plan editor       every field of one plan + a live preview of the seller card
//
// Every save goes through World.* in js/plans.js, so the seller app follows at once.

const TONE_OPTIONS = [['success', 'Green'], ['brand', 'Purple'], ['info', 'Blue'], ['warning', 'Amber'], ['neutral', 'Grey']]

const planChip = (status) => chip(STATUS.plan[status].tone, STATUS.plan[status].label)
const subChip = (sub) => chip(STATUS.subscription[sub.status].tone, STATUS.subscription[sub.status].label)
const priceCell = (db, p) => (Plans.isCustom(p)
  ? html`<span class="font-medium text-fg">Custom</span><span class="sub">Talk to us</span>`
  : html`<span class="num font-medium text-fg">${money(p.monthly)}/mo</span><span class="sub">${money(Plans.yearly(db, p))}/yr${p.yearly !== null ? ' · set by hand' : ''}</span>`)

// ===========================================================================
// Plans & pricing
// ===========================================================================

const PlansAdminPage = {
  render() {
    const db = S()
    const ui = Store.ui
    const s = db.plans.settings
    const plans = Plans.all(db)
    const live = Plans.live(db)
    const paying = live.reduce((sum, p) => sum + Plans.sellers(db, p), 0)
    const mrr = plans.reduce((sum, p) => sum + (Plans.mrr(db, p) || 0), 0)
    const trialPlan = Plans.get(db, s.trialPlanId)

    return html`
      ${pageHead({
        title: 'Plans & pricing',
        subtitle: 'What sellers pay, and what each plan includes. Changes show in the seller app straight away.',
        actions: html`<div class="flex flex-wrap items-center gap-2">
          <a href="seller.html#/plans" target="uniemax-seller" class="${abtn()}">${AIcon('external', 14)}Preview as seller</a>
          <button type="button" class="${abtn({ variant: 'primary' })}" data-act="newPlan" ${ui.busy.newPlan ? 'disabled' : ''}>${ui.busy.newPlan ? spinner() : ''}New plan</button></div>`,
      })}

      <div class="stats">
        <div class="stat"><span class="stat-l">Paying sellers</span><span class="stat-v">${count(paying)}</span><span class="stat-s">On ${plural(live.length, 'live plan')}</span></div>
        <div class="stat"><span class="stat-l">Monthly recurring revenue</span><span class="stat-v">${money(mrr)}</span><span class="stat-s">Fixed-price plans, before GST</span></div>
        <div class="stat"><span class="stat-l">On free trial</span><span class="stat-v">${count(Plans.trials(db))}</span><span class="stat-s">${s.trialDays ? `${s.trialDays} days of ${trialPlan ? trialPlan.name : '—'}` : 'Trial switched off'}</span></div>
        <div class="stat"><span class="stat-l">Average per paying seller</span><span class="stat-v">${money(paying ? mrr / paying : 0)}</span><span class="stat-s">A month</span></div>
      </div>

      ${card({ pad: 'none', title: 'Plans', count: plans.length, subtitle: 'Sellers see live plans in this order. Open a plan to edit it.', body: dataTable({
        rows: plans,
        link: (p) => `/plans/${p.id}`,
        emptyTitle: 'No plans yet',
        emptyHint: 'Create the first plan with “New plan”.',
        columns: [
          { header: 'Order', cell: (p) => { const i = plans.indexOf(p); return html`<span class="inline-flex gap-1">
            ${ibtn('chevronUp', `Move ${p.name} up`, `data-act="movePlan" data-args='${JSON.stringify([p.id, -1])}' ${i === 0 ? 'disabled' : ''}`)}
            ${ibtn('chevronDown', `Move ${p.name} down`, `data-act="movePlan" data-args='${JSON.stringify([p.id, 1])}' ${i === plans.length - 1 ? 'disabled' : ''}`)}</span>` } },
          { header: 'Plan', primary: true, cell: (p) => html`<span class="flex flex-wrap items-center gap-1.5 font-medium text-fg">${p.name}${p.featured ? chip('brand', 'Featured') : ''}</span><span class="sub">${p.tier}</span>` },
          { header: 'Price', cell: (p) => priceCell(db, p) },
          { header: 'For', hideOnMobile: true, cell: (p) => html`<span class="text-sm">${p.audience}</span>` },
          { header: 'Status', cell: (p) => planChip(p.status) },
          { header: 'Sellers', cls: 'text-right', cell: (p) => html`<span class="num">${count(Plans.sellers(db, p))}</span>` },
          { header: 'MRR', cls: 'text-right', cell: (p) => html`<span class="num font-medium">${Plans.mrr(db, p) === null ? '—' : money(Plans.mrr(db, p))}</span>` },
        ],
        mobileRow: (p) => html`<div class="flex items-baseline justify-between gap-3"><p class="min-w-0 truncate font-medium text-fg">${p.name} <span class="font-normal text-muted">· ${p.tier}</span></p><p class="shrink-0 font-figure text-sm font-medium text-fg">${Plans.isCustom(p) ? 'Custom' : `${money(p.monthly)}/mo`}</p></div>
          <p class="mt-0.5 truncate text-sm text-muted">${p.audience} · ${plural(Plans.sellers(db, p), 'seller')}</p>
          <div class="mt-2 flex flex-wrap gap-1.5">${planChip(p.status)}${p.featured ? chip('brand', 'Featured') : ''}</div>`,
      }) })}

      <div class="mt-4">${featureMatrix(db, plans)}</div>

      <div class="grid-2 mt-4 mb-0">
        ${billingRules(db)}
        ${card({ pad: 'none', title: 'Change history', subtitle: 'Every change to plans and billing rules', body: db.plans.history.length === 0
          ? html`<p class="mini-empty">No changes yet.</p>`
          : html`<ul class="mini-list max-h-[460px] overflow-y-auto">${db.plans.history.slice(0, 20).map((h) => html`
              <li><div class="ml-row"><span class="ml-m"><b class="!whitespace-normal">${h.text}</b><em>${h.by} · ${relative(h.at)}</em></span></div></li>`)}</ul>` })}
      </div>`
  },
}

function featureMatrix(db, plans) {
  const ui = Store.ui
  const limitRow = (label, fn) => html`<tr><td><span class="text-fg">${label}</span><span class="sub">Edit in the plan</span></td>${plans.map((p) => html`<td class="text-center num text-sm">${fn(p)}</td>`)}<td></td></tr>`
  const groupRow = (title) => html`<tr><td colspan="${plans.length + 2}" class="!bg-surface-alt !py-1.5 text-xs font-semibold text-muted">${title}</td></tr>`
  return card({
    pad: 'none',
    title: 'Feature matrix',
    count: db.plans.features.length,
    subtitle: 'Tick what each plan includes. Sellers see it on the plan cards and in “Compare all features”.',
    body: html`
      <div class="tscroll"><table class="tbl min-w-[720px]">
        <thead><tr><th scope="col">Feature</th>${plans.map((p) => html`<th scope="col" class="text-center"><span class="block">${p.name}</span><span class="block text-xs font-normal text-muted">${STATUS.plan[p.status].label}</span></th>`)}<th scope="col"><span class="sr-only">Remove</span></th></tr></thead>
        <tbody>
          ${groupRow('Limits')}
          ${limitRow('Products', (p) => Plans.limit(p.limits.products))}
          ${limitRow('Staff accounts', (p) => Plans.limit(p.limits.staff))}
          ${limitRow('Photo storage', (p) => Plans.limit(p.limits.storageGb, ' GB'))}
          ${limitRow('Order fee', (p) => Plans.fee(db, p))}
          ${Object.entries(FEATURE_GROUPS).map(([key, title]) => {
            const rows = db.plans.features.filter((f) => f.group === key)
            if (rows.length === 0) return ''
            return html`${groupRow(title)}${rows.map((f) => html`<tr>
              <td><span class="text-fg">${f.label}</span><span class="sub font-mono">${f.key}</span></td>
              ${plans.map((p) => html`<td class="text-center"><input type="checkbox" class="h-4 w-4 cursor-pointer accent-[var(--brand)]" aria-label="${f.label} in ${p.name}"
                data-change="toggleFeature" data-args="${args(f.key, p.id)}" ${f.on.includes(p.id) ? 'checked' : ''} ${ui.busy[`feat:${f.key}:${p.id}`] ? 'disabled' : ''} /></td>`)}
              <td class="text-right">${ibtn('x', `Remove ${f.label}`, `data-act="askRemoveFeature" data-args='${esc(JSON.stringify([f.key]))}'`, 'danger')}</td>
            </tr>`)}`
          })}
        </tbody>
      </table></div>
      <form class="fbar flex-wrap border-t border-line" data-submit="addFeature">
        <label class="min-w-[220px] flex-1"><span class="sr-only">New feature</span>
          <input name="label" data-model="drafts.feature" value="${(ui.drafts && ui.drafts.feature) || ''}" required minlength="3" maxlength="40" placeholder="New feature, for example Gift cards" class="${FIELD_A}" /></label>
        <label><span class="sr-only">Group</span><select name="group" class="${FIELD_A} w-auto pr-8">${Object.entries(FEATURE_GROUPS).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
        <button type="submit" class="${abtn({ variant: 'secondary' })}" ${ui.busy.addFeature ? 'disabled' : ''}>${ui.busy.addFeature ? spinner() : ''}Add feature</button>
        <p class="w-full text-xs text-muted">A new feature starts on the top two live plans. Its key is what the app checks to switch the feature on.</p>
      </form>`,
  })
}

function billingRules(db) {
  const s = db.plans.settings
  const ui = Store.ui
  const busy = ui.busy.planSettings
  const fixedLive = Plans.live(db).filter((p) => !Plans.isCustom(p))
  const planSelect = (name, value) => html`<select name="${name}" class="${FIELD_A} appearance-none pr-8">${fixedLive.map((p) => html`<option value="${p.id}" ${p.id === value ? 'selected' : ''}>${p.name} · ${money(p.monthly)}/mo</option>`)}</select>`
  const num = (name, label, value, hint, extra = '') => html`<label class="block"><span class="${LABEL_A}">${label}</span><input name="${name}" type="number" inputmode="numeric" value="${value}" class="${FIELD_A}" ${raw(extra)} />${hint ? html`<span class="mt-1 block text-xs text-muted">${hint}</span>` : ''}</label>`
  return card({
    title: 'Billing rules',
    subtitle: 'Apply to every plan',
    body: html`<form class="space-y-4" data-submit="savePlanSettings">
      <div class="grid gap-4 sm:grid-cols-2">
        ${num('yearlyDiscountPct', 'Yearly discount (%)', s.yearlyDiscountPct, 'Off 12 × the monthly price. A plan can set its own yearly price.', 'min="0" max="90" step="1"')}
        ${num('trialDays', 'Free trial (days)', s.trialDays, '0 switches the trial off.', 'min="0" max="90" step="1"')}
        <label class="block"><span class="${LABEL_A}">Trial gives this plan</span>${planSelect('trialPlanId', s.trialPlanId)}</label>
        <label class="block"><span class="${LABEL_A}">After the trial, move to</span>${planSelect('afterTrialPlanId', s.afterTrialPlanId)}<span class="mt-1 block text-xs text-muted">If the seller has not chosen a plan.</span></label>
        ${num('gstPct', 'GST (%)', s.gstPct, '', 'min="0" max="28" step="0.01"')}
        <label class="block"><span class="${LABEL_A}">Enterprise enquiries go to</span><input name="salesEmail" type="email" value="${s.salesEmail}" class="${FIELD_A}" /></label>
      </div>
      <label class="flex items-start gap-2.5 text-sm text-fg"><input type="checkbox" name="pricesIncludeGst" class="mt-0.5 h-4 w-4 accent-[var(--brand)]" ${s.pricesIncludeGst ? 'checked' : ''} /><span>Prices already include GST<span class="block text-xs text-muted">Off: sellers see “+ GST” and pay it on top.</span></span></label>
      <fieldset><legend class="${LABEL_A}">When a plan’s price changes</legend>
        <div class="space-y-2">${Object.entries(PLAN_RULES).map(([k, text]) => html`<label class="flex items-start gap-2.5 text-sm text-fg"><input type="radio" name="priceChangeRule" value="${k}" class="mt-0.5 h-4 w-4 accent-[var(--brand)]" ${s.priceChangeRule === k ? 'checked' : ''} />${text}</label>`)}</div>
      </fieldset>
      ${ui.errors.planSettings ? html`<p class="text-sm text-danger">${ui.errors.planSettings}</p>` : ''}
      <button type="submit" class="${abtn({ variant: 'primary' })}" ${busy ? 'disabled' : ''}>${busy ? spinner() : ''}${busy ? 'Saving…' : 'Save billing rules'}</button>
    </form>`,
  })
}

// ===========================================================================
// Plan editor
// ===========================================================================

const planDraftOf = (db, plan) => JSON.parse(JSON.stringify({ ...plan, features: Plans.features(db, plan).map((f) => f.key) }))
const numOrNull = (v) => (v === '' || v === undefined || v === null ? null : Number(v))

const PlanAdminPage = {
  render({ id }) {
    const db = S()
    const ui = Store.ui
    const plan = Plans.get(db, id)
    if (!plan) return html`${pageHead({ title: 'Plan not found', back: { label: 'Plans & pricing' } })}${card({ body: UI.empty({ title: 'This plan no longer exists', description: 'It may have been deleted in another tab.' }) })}`
    if (!ui.planDraft || ui.planDraft.id !== id) ui.planDraft = planDraftOf(db, plan)
    const d = ui.planDraft
    const s = db.plans.settings
    const norm = (x) => JSON.stringify({ ...x, features: [...x.features].sort() })
    const dirty = norm(planDraftOf(db, plan)) !== norm(d)
    const busy = ui.busy[`plan:${id}`]
    const custom = d.pricing === 'CUSTOM'
    const sellers = Plans.sellers(db, plan)
    const autoYearly = custom || d.monthly === null ? null : Math.round(d.monthly * 12 * (1 - s.yearlyDiscountPct / 100))

    const text = (field, label, { hint, area = false, max = 60, placeholder = '' } = {}) => html`<label class="block ${area ? 'sm:col-span-2' : ''}"><span class="${LABEL_A}">${label}</span>
      ${area
        ? html`<textarea name="${field}" data-search="planInput" data-args="${args(field)}" maxlength="${max}" rows="2" placeholder="${placeholder}" class="${AREA_A}">${d[field] || ''}</textarea>`
        : html`<input name="${field}" value="${d[field] || ''}" data-search="planInput" data-args="${args(field)}" maxlength="${max}" placeholder="${placeholder}" class="${FIELD_A}" />`}
      ${hint ? html`<span class="mt-1 block text-xs text-muted">${hint}</span>` : ''}</label>`
    const number = (field, label, value, { hint, placeholder = '', disabled = false, step = '1' } = {}) => html`<label class="block"><span class="${LABEL_A}">${label}</span>
      <input name="${field}" type="number" min="0" step="${step}" inputmode="numeric" value="${value ?? ''}" placeholder="${placeholder}" data-search="planInput" data-args="${args(field)}" class="${FIELD_A}" ${disabled ? 'disabled' : ''} />
      ${hint ? html`<span class="mt-1 block text-xs text-muted">${hint}</span>` : ''}</label>`

    // The preview reads the draft, not the saved plan.
    const previewPlan = { ...d, status: 'ACTIVE' }
    const pdb = { ...db, plans: { ...db.plans,
      list: db.plans.list.map((p) => (p.id === id ? previewPlan : p)),
      features: db.plans.features.map((f) => ({ ...f, on: d.features.includes(f.key) ? [...new Set([...f.on, id])] : f.on.filter((x) => x !== id) })) } }
    const cycle = ui.previewCycle || 'MONTHLY'
    const priceMoved = !custom && (plan.monthly !== d.monthly || (plan.yearly ?? null) !== (d.yearly ?? null))
    const canDelete = plan.status === 'DRAFT' && sellers === 0

    return html`
      ${pageHead({
        title: plan.name,
        back: { label: 'Plans & pricing' },
        subtitle: html`<span class="flex flex-wrap items-center gap-2">${planChip(plan.status)}${plan.featured ? chip('brand', 'Featured') : ''}<span class="text-muted">${plural(sellers, 'paying seller')}</span>${dirty ? chip('warning', 'Unsaved changes') : ''}</span>`,
        actions: html`<div class="flex flex-wrap items-center gap-2">
          ${dirty ? html`<button type="button" class="${abtn()}" data-act="discardPlan" ${busy ? 'disabled' : ''}>Discard</button>` : ''}
          <button type="submit" form="plan-form" class="${abtn({ variant: 'primary' })}" ${!dirty || busy ? 'disabled' : ''}>${busy ? spinner() : ''}${busy ? 'Saving…' : 'Save changes'}</button></div>`,
      })}
      ${ui.errors[`plan:${id}`] ? html`<div class="callout c-warn mb-4" role="alert">${AIcon('alert', 15)}<span class="text-fg">${ui.errors[`plan:${id}`]}</span></div>` : ''}

      <div class="grid-main">
        <form id="plan-form" class="min-w-0 space-y-4" data-submit="savePlan" data-args="${args(id)}">
          ${card({ title: 'Basics', subtitle: 'The words on the plan card', body: html`<div class="grid gap-4 sm:grid-cols-2">
            ${text('name', 'Plan name', { max: 30 })}
            ${text('audience', 'Who it is for', { max: 40, placeholder: 'Growing businesses' })}
            ${text('tier', 'Label above the name', { max: 20, placeholder: 'Main plan' })}
            <label class="block"><span class="${LABEL_A}">Label colour</span><select name="tone" data-change="planField" data-args="${args('tone')}" class="${FIELD_A} appearance-none pr-8">${TONE_OPTIONS.map(([v, l]) => html`<option value="${v}" ${d.tone === v ? 'selected' : ''}>${l}</option>`)}</select></label>
            ${text('pitch', 'One-line pitch', { area: true, max: 90, hint: 'Up to 90 letters. Shown under the name.' })}
            ${text('cta', 'Button text', { max: 24, placeholder: 'Automatic — “Choose”, “Upgrade to”…', hint: 'Leave empty and the app picks it from what the seller is on.' })}
            <div class="space-y-3">
              <label class="flex items-start gap-2.5 pt-7 text-sm text-fg"><input type="checkbox" class="mt-0.5 h-4 w-4 accent-[var(--brand)]" data-change="planField" data-args="${args('featured')}" ${d.featured ? 'checked' : ''} /><span>Feature this plan<span class="block text-xs text-muted">Highlighted card. Only one plan at a time.</span></span></label>
            </div>
            ${d.featured ? text('badge', 'Badge on the featured card', { max: 20, placeholder: 'Most popular' }) : ''}
          </div>` })}

          ${card({ title: 'Price', subtitle: `Before GST (${s.gstPct}%) — set in Billing rules`, body: html`<div class="grid gap-4 sm:grid-cols-2">
            <label class="block sm:col-span-2"><span class="${LABEL_A}">Pricing</span>${segmented('planPricing', d.pricing, [{ value: 'FIXED', label: 'Fixed price' }, { value: 'CUSTOM', label: 'Custom — “Talk to us”' }])}</label>
            ${custom
              ? html`<p class="text-sm text-muted sm:col-span-2">Sellers see “Custom price” and a button that sends an enquiry to ${s.salesEmail} and to Support.</p>`
              : html`${number('monthly', 'Monthly price (₹)', d.monthly)}
                ${number('yearly', 'Yearly price (₹)', d.yearly, { placeholder: autoYearly === null ? '' : `Automatic: ${money(autoYearly)}`, hint: `Empty = 12 months minus ${s.yearlyDiscountPct}%.` })}
                <p class="text-xs text-muted sm:col-span-2">Sellers pay ${money(Plans.withGst(db, d.monthly || 0))} a month or ${money(Plans.withGst(db, d.yearly ?? autoYearly ?? 0))} a year${s.pricesIncludeGst ? ' (GST included)' : ' with GST'}.</p>`}
          </div>` })}

          ${card({ title: 'Limits', subtitle: 'Leave a box empty for unlimited', body: html`<div class="grid gap-4 sm:grid-cols-2">
            ${number('limits.products', 'Products', d.limits.products, { placeholder: 'Unlimited' })}
            ${number('limits.staff', 'Staff accounts', d.limits.staff, { placeholder: 'Unlimited', hint: 'Including the owner.' })}
            ${number('limits.storageGb', 'Photo storage (GB)', d.limits.storageGb, { placeholder: 'Unlimited' })}
            ${number('feePct', 'Order fee (%)', d.feePct, { placeholder: `Platform fee: ${db.fees.platformPct}%`, step: '0.1', hint: 'UnieMax’s cut of each order. Empty = the platform fee.' })}
          </div>` })}

          ${card({ title: 'Features', subtitle: `${d.features.length} of ${db.plans.features.length} ticked · add new ones in the feature matrix`, body: html`<div class="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            ${Object.entries(FEATURE_GROUPS).map(([key, title]) => {
              const rows = db.plans.features.filter((f) => f.group === key)
              return rows.length === 0 ? '' : html`<fieldset><legend class="mb-2 text-xs font-semibold text-muted">${title}</legend><div class="space-y-2">
                ${rows.map((f) => html`<label class="flex items-center gap-2.5 text-sm text-fg"><input type="checkbox" class="h-4 w-4 accent-[var(--brand)]" data-change="planFeature" data-args="${args(f.key)}" ${d.features.includes(f.key) ? 'checked' : ''} />${f.label}</label>`)}
              </div></fieldset>`
            })}
          </div>` })}

          ${card({ title: 'Who can see it', body: html`<div class="space-y-2.5">${Object.entries(STATUS.plan).map(([k, meta]) => html`
            <label class="flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm ${d.status === k ? 'border-accent bg-surface-alt' : 'border-line'}">
              <input type="radio" name="status" value="${k}" class="mt-0.5 h-4 w-4 accent-[var(--brand)]" data-change="planField" data-args="${args('status')}" ${d.status === k ? 'checked' : ''} />
              <span><span class="font-medium text-fg">${meta.label}</span><span class="block text-xs text-muted">${meta.desc}</span></span></label>`)}</div>` })}
        </form>

        <div class="min-w-0 space-y-4 lg:sticky lg:top-4 lg:self-start">
          ${card({ title: 'Preview', subtitle: 'What sellers see', action: segmented('planPreviewCycle', cycle, [{ value: 'MONTHLY', label: 'Monthly' }, { value: 'YEARLY', label: 'Yearly' }]), body: html`
            <div class="pt-3">${planCard(pdb, previewPlan, { cycle, preview: true, action: html`<button type="button" disabled class="${btn({ size: 'lg', full: true, variant: d.featured ? 'primary' : 'secondary' })}">${d.cta || (custom ? 'Talk to us' : `Choose ${d.name || 'plan'}`)}</button>` })}</div>
            ${d.status !== 'ACTIVE' ? html`<p class="mt-3 text-xs text-muted">${STATUS.plan[d.status].label}: sellers do not see this plan.</p>` : ''}` })}

          ${card({ title: 'Sellers on this plan', body: html`<dl>
            ${detail('Paying sellers', count(sellers))}
            ${detail('Monthly revenue', Plans.mrr(db, plan) === null ? 'Custom deals' : money(Plans.mrr(db, plan)))}
            ${s.trialPlanId === id ? detail('Free trial', `New shops try this plan for ${s.trialDays} days`) : ''}
            ${s.afterTrialPlanId === id ? detail('After trial', 'Shops land here when the trial ends') : ''}
            ${detail('Price changes', PLAN_RULES[s.priceChangeRule])}</dl>
            ${priceMoved && sellers > 0 ? html`<div class="callout c-warn mt-3 mb-0">${AIcon('alert', 15)}<span class="text-fg">Saving changes the price for ${plural(sellers, 'seller')}. ${s.priceChangeRule === 'NOW' ? 'They pay the new price from today.' : 'They keep today’s price until their renewal.'} Each one is told.</span></div>` : ''}` })}

          ${canDelete ? card({ title: 'Delete draft', subtitle: 'No seller has seen this plan yet', body: html`<button type="button" class="${abtn({ variant: 'danger' })}" data-act="askDeletePlan" data-args="${args(id)}">Delete ${plan.name}</button>` }) : ''}
        </div>
      </div>`
  },
}

/** The store page's "Plan" card (admin.js StorePage). */
function planStoreCard(db, store) {
  const sub = store.subscription
  const plan = sub && Plans.get(db, sub.planId)
  if (!plan) return ''
  const pending = sub.pending && Plans.get(db, sub.pending.planId)
  return card({
    cls: 'mt-4',
    title: 'Plan',
    subtitle: 'What this seller pays UnieMax',
    action: html`<a href="#/plans/${plan.id}" class="lnk sm">Open ${plan.name}</a>`,
    body: html`<dl>
      ${detail('Plan', html`<span class="flex flex-wrap items-center gap-1.5">${plan.name}${subChip(sub)}</span>`)}
      ${sub.status === 'TRIAL'
        ? html`${detail('Trial ends', `${day(sub.trialEndsAt)} · ${plural(Plans.daysLeft(sub.trialEndsAt), 'day')} left`)}${detail('Then', planName(db, db.plans.settings.afterTrialPlanId) + ' unless they choose')}`
        : html`${detail('Billing', sub.cycle === 'YEARLY' ? 'Yearly' : 'Monthly')}
          ${detail('Pays', `${money(sub.amount)} ${sub.cycle === 'YEARLY' ? 'a year' : 'a month'} + GST`)}
          ${detail('Renews on', day(sub.renewsAt))}`}
      ${pending ? detail('Next plan', `${pending.name} from ${day(sub.renewsAt)}`) : ''}
    </dl>`,
  })
}
const planName = (db, id) => (Plans.get(db, id) || { name: '—' }).name

// ===========================================================================
// Act
// ===========================================================================

Object.assign(Act, {
  async newPlan() {
    const plan = await run('newPlan', () => Store.change((db) => World.addPlan(db)), { ok: 'Draft plan created', ms: 400 })
    if (plan) App.go('plan', { id: plan.id })
  },
  movePlan(id, dir) {
    return run(`move:${id}`, () => Store.change((db) => World.movePlan(db, id, dir)), { ms: 200 })
  },
  toggleFeature(on, key, planId) {
    return run(`feat:${key}:${planId}`, () => Store.change((db) => World.setFeature(db, key, planId, on)), { ms: 250, ok: on ? 'Feature added to the plan' : 'Feature removed from the plan' })
  },
  async addFeature(values) {
    const key = await run('addFeature', () => Store.change((db) => World.addFeature(db, values)), { ok: 'Feature added' })
    if (!key) return
    Store.ui.drafts.feature = ''
    if (document.activeElement) document.activeElement.blur() // so the re-render clears the field
    Act.commit()
  },
  askRemoveFeature(key) {
    const f = S().plans.features.find((x) => x.key === key)
    if (!f) return
    UI.ask({ title: `Remove “${f.label}”?`, message: `It disappears from every plan and from the sellers’ comparison table. Sellers lose access when their plan renews.`, confirmLabel: 'Remove feature', tone: 'danger', act: 'removeFeature', args: [key] })
  },
  removeFeature(key) {
    return run(`feat:${key}`, () => Store.change((db) => World.removeFeature(db, key)), { ok: 'Feature removed' })
  },
  savePlanSettings(values) {
    return run('planSettings', () => Store.change((db) => World.savePlanSettings(db, values)), { ok: 'Billing rules saved — sellers see them now' })
  },

  // ---- plan editor (Store.ui.planDraft) ----
  planInput(value, field) {
    const d = Store.ui.planDraft
    if (!d) return
    const numeric = ['monthly', 'yearly', 'feePct', 'limits.products', 'limits.staff', 'limits.storageGb']
    const v = numeric.includes(field) ? numOrNull(value) : value
    if (field.startsWith('limits.')) d.limits[field.slice(7)] = v
    else d[field] = v
    Act.commit()
  },
  planField(value, field) {
    Store.ui.planDraft[field] = value
    Act.commit()
  },
  planPricing(value) {
    Store.ui.planDraft.pricing = value
    if (value === 'FIXED' && Store.ui.planDraft.monthly === null) Store.ui.planDraft.monthly = 999
    Act.commit()
  },
  planFeature(on, key) {
    const d = Store.ui.planDraft
    d.features = on ? [...new Set([...d.features, key])] : d.features.filter((k) => k !== key)
    Act.commit()
  },
  planPreviewCycle(cycle) {
    Store.ui.previewCycle = cycle
    Act.commit()
  },
  discardPlan() {
    Store.ui.planDraft = null
    Store.ui.errors[`plan:${App.current.params.id}`] = null
    Act.commit()
  },
  async savePlan(values, id) {
    // Text from the form itself (a debounced input may not have reached the draft yet).
    const d = { ...Store.ui.planDraft, limits: { ...Store.ui.planDraft.limits } }
    for (const k of ['name', 'tier', 'audience', 'pitch', 'cta', 'badge']) if (values[k] !== undefined) d[k] = values[k]
    for (const k of ['monthly', 'yearly', 'feePct']) if (values[k] !== undefined) d[k] = numOrNull(values[k])
    for (const k of ['products', 'staff', 'storageGb']) if (values[`limits.${k}`] !== undefined) d.limits[k] = numOrNull(values[`limits.${k}`])
    const plan = await run(`plan:${id}`, () => Store.change((db) => World.savePlan(db, id, d)), { ok: 'Plan saved — sellers see it now' })
    if (!plan) return
    Store.ui.planDraft = null
    Act.commit()
  },
  askDeletePlan(id) {
    const plan = Plans.get(S(), id)
    UI.ask({ title: `Delete ${plan.name}?`, message: 'The draft and its feature ticks are removed. This cannot be undone.', confirmLabel: 'Delete draft', tone: 'danger', act: 'deletePlan', args: [id] })
  },
  async deletePlan(id) {
    const done = await run(`plan:${id}`, () => Store.change((db) => (World.deletePlan(db, id), true)), { ok: 'Draft deleted' })
    if (done) {
      Store.ui.planDraft = null
      App.replace('plansAdmin')
    }
  },

  // ---- simulate (control panel) ----
  simSellerUpgrade() {
    const db = S()
    const sub = Q.myStore(db).subscription
    const target = Plans.live(db).filter((p) => !Plans.isCustom(p)).find((p) => sub.status === 'TRIAL' || p.order > Plans.get(db, sub.planId).order)
    if (!target) return UI.toast('Lakshmi Silk Sarees is already on the top plan')
    try {
      Store.change((d) => World.choosePlan(d, target.id, 'MONTHLY'))
      UI.toast(`Lakshmi Silk Sarees chose ${target.name}`)
    } catch (err) {
      UI.toast(err.message, 'danger')
    }
    Act.commit()
  },
})

// ===========================================================================
// Nav + routes
// ===========================================================================

{
  const item = { to: '/plans', label: 'Plans & pricing', ico: 'gem' }
  NAV_GROUPS.find((g) => g.title === 'Finance').items.push(item)
  NAV_ITEMS.push(item)
}
App.reg('plansAdmin', { path: '/plans', title: 'Plans & pricing', parent: 'dashboard', ...PlansAdminPage, skeleton: adminSkeleton })
App.reg('plan', { path: '/plans/:id', title: 'Plan', parent: 'plansAdmin', ...PlanAdminPage, skeleton: adminSkeleton })

AppConfig.jumps.push(['plansAdmin', 'Plans (new)'], ['plan', 'Edit Growth', { id: 'growth' }])
AppConfig.simulate.push({ act: 'simSellerUpgrade', label: 'Seller upgrades their plan' })
const baseAdminUi = AppConfig.freshUi
AppConfig.freshUi = () => ({ ...baseAdminUi(), planDraft: null, previewCycle: 'MONTHLY', drafts: { reply: '', feature: '' } })
