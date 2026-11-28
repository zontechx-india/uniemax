// Admin console — admin.uniemax.com, as plain JS screens.
//
// Uses the REAL admin.css (served by server.js), so the class names below are
// the console's own: shell, sidebar, top, page, ph, card, card-h, stats, tbl…
// Same structure as admin/layout/AdminLayout.tsx and admin/ui/*.
//
// Built: Dashboard, Orders (+ order), Stores & sellers (+ store), Seller payouts,
// Support (+ ticket). Every other nav item shows a placeholder page.
// Screens are registered with App.reg() at the bottom of this file.

// ===========================================================================
// Console primitives (admin/ui/primitives.tsx)
// ===========================================================================

const abtn = ({ variant = 'secondary', size = 'sm', cls = '' } = {}) => btn({ variant, size, cls })

const CHIP_CLASS = { neutral: 'st-neutral', success: 'st-success', warning: 'st-warn', danger: 'st-danger', info: 'st-info', brand: 'st-brand', pending: 'st-pending' }
const chip = (tone, label) => html`<span class="st ${CHIP_CLASS[tone]}"><i aria-hidden="true"></i>${label}</span>`

const pageHead = ({ title, subtitle, actions, back, badge }) => html`
  <header class="ph">
    ${back ? html`<button type="button" class="ph-back" data-back>${AIcon('back', 14)}${back.label}</button>` : ''}
    <div class="ph-row">
      <div class="ph-t"><h1>${title}${badge || ''}</h1>${subtitle ? html`<div>${subtitle}</div>` : ''}</div>
      ${actions ? html`<div class="ph-a">${actions}</div>` : ''}
    </div>
  </header>`

const card = ({ title, subtitle, action, count, pad = 'md', cls = '', body }) => html`
  <section class="card ${pad === 'none' ? '' : pad === 'lg' ? 'pad-lg' : 'pad'} ${cls}">
    ${title ? html`<header class="card-h"><div class="min-w-0"><h2>${title}${count !== undefined ? html`<span class="cnt">${count}</span>` : ''}</h2>${subtitle ? html`<p>${subtitle}</p>` : ''}</div>${action || ''}</header>` : ''}
    ${body}
  </section>`

const detail = (label, value) => html`<div class="kv-row"><dt>${label}</dt><dd>${value}</dd></div>`

const ibtn = (name, label, actAttrs = '', cls = '') =>
  html`<button type="button" aria-label="${label}" title="${label}" class="ibtn ${cls}" ${raw(actAttrs)}>${AIcon(name)}</button>`

const tabs = (act, value, options) => html`
  <div class="tabs sticky-sm" role="tablist">${options.map(
    (o) => html`<button type="button" role="tab" aria-selected="${o.value === value}" class="${o.value === value ? 'on' : ''}" data-act="${act}" data-args="${args(o.value)}">
      ${o.label}${o.count !== undefined ? html`<span class="cnt">${count(o.count)}</span>` : ''}</button>`,
  )}</div>`

const searchBox = (act, value, placeholder, id) => html`
  <label class="fsearch">${AIcon('search', 15)}<span class="sr-only">Search</span>
    <input id="${id}" type="search" value="${value || ''}" placeholder="${placeholder}" data-search="${act}" /></label>`

const filterSelect = (act, label, value, options, idle = '') => {
  const selected = (options.find((o) => o.value === value) || options[0]).label
  return html`<label class="fsel ${value !== idle ? 'set' : ''}"><span>${label}:</span><b>${selected}</b>${AIcon('chevronDown', 14)}
    <select data-change="${act}" aria-label="${label}">${options.map((o) => html`<option value="${o.value}" ${o.value === value ? 'selected' : ''}>${o.label}</option>`)}</select></label>`
}

const segmented = (act, value, options) => html`
  <div class="segc" role="group">${options.map((o) => html`<button type="button" aria-pressed="${o.value === value}" class="${o.value === value ? 'on' : ''}" data-act="${act}" data-args="${args(o.value)}">${o.label}</button>`)}</div>`

/**
 * DataTable — a real table from 720px, a stacked list below (admin/ui/DataTable).
 * columns: [{ header, cell(row), primary?, hideOnMobile?, cls? }]
 */
function dataTable({ rows, columns, link, mobileRow, emptyTitle = 'Nothing here yet', emptyHint }) {
  if (rows.length === 0) return UI.empty({ title: emptyTitle, description: emptyHint })
  const primary = columns.find((c) => c.primary)
  const rest = columns.filter((c) => !c.primary && !c.hideOnMobile)
  return html`
    <div class="tscroll dt-wide"><table class="tbl min-w-[720px]">
      <thead><tr>${columns.map((c) => html`<th scope="col" class="${c.cls || ''}">${c.header}</th>`)}</tr></thead>
      <tbody>${rows.map((r) => html`<tr class="${link ? 'link' : ''}" ${link ? raw(`data-go="${esc(link(r))}" tabindex="0"`) : ''}>
        ${columns.map((c) => html`<td data-label="${c.header}" class="${c.cls || ''}">${c.cell(r)}</td>`)}</tr>`)}</tbody>
    </table></div>
    <ul class="mlist dt-narrow">${rows.map((r) => html`<li class="${link ? 'link' : ''}" ${link ? raw(`data-go="${esc(link(r))}"`) : ''}>
      ${mobileRow
        ? html`<div class="min-w-0 flex-1">${mobileRow(r)}</div>${link ? AIcon('chevron') : ''}`
        : html`<div class="min-w-0 flex-1">${primary ? html`<div class="mb-1.5 font-medium text-fg">${primary.cell(r)}</div>` : ''}
            <dl class="dt-card">${rest.map((c) => html`<div><dt>${c.header}</dt><dd>${c.cell(r)}</dd></div>`)}</dl></div>`}
    </li>`)}</ul>
    <div class="tfoot"><span>Page 1 of 1 · ${count(rows.length)} total</span>
      <div class="pager">${ibtn('back', 'Previous page', 'disabled')}${ibtn('chevron', 'Next page', 'disabled')}</div></div>`
}

const FIELD_A =
  'w-full rounded-md border border-line bg-input text-fg outline-none transition-colors placeholder:text-muted ' +
  'hover:border-fg/30 focus:border-accent disabled:cursor-not-allowed disabled:opacity-60 h-tap px-3 text-sm'
const AREA_A = FIELD_A.replace('h-tap', 'min-h-24 py-3') + ' resize-y'
const LABEL_A = 'mb-1.5 block text-sm font-medium text-fg'

// ===========================================================================
// Status meta (admin/ui/statusMeta.tsx)
// ===========================================================================

const orderStatusChip = (s) => chip(STATUS.order[s].adminTone, STATUS.order[s].admin)
function paymentChip(status, method) {
  if (status === 'PENDING' && method === 'COD') return chip('neutral', 'Pay on delivery')
  const meta = { PENDING: ['Payment pending', 'warning'], PAID: ['Paid', 'success'], FAILED: ['Payment failed', 'danger'], REFUNDED: ['Refunded', 'neutral'] }[status]
  return chip(meta[1], meta[0] + (status === 'PAID' ? ` · ${method === 'ONLINE' ? 'Online' : 'Cash'}` : ''))
}
const payoutChip = (s) => chip(STATUS.payout[s].adminTone, STATUS.payout[s].admin)
function storeChip(store) {
  if (store.suspendedAt) return chip('danger', 'Suspended')
  return store.isPublished ? chip('success', 'Published') : chip('neutral', 'Draft')
}
function setupChip(store) {
  const [first, ...rest] = store.setupPending
  return first ? chip('pending', first + (rest.length ? ` +${rest.length}` : '')) : chip('success', 'Setup complete')
}
const ticketChipA = (s) => chip(STATUS.ticket[s].adminTone, STATUS.ticket[s].admin)
const priorityChip = (p) => chip(STATUS.priority[p].tone, STATUS.priority[p].label)
const scopeChip = (t) => (t.storeId ? chip('brand', 'Seller') : chip('info', 'Shopper'))

function storeAvatar(store, size = 'h-9 w-9') {
  return html`<span class="${size} flex shrink-0 items-center justify-center rounded-pill text-sm font-semibold text-white" style="background:${store.tone}" aria-hidden="true">${store.name.charAt(0)}</span>`
}

// ===========================================================================
// Charts (admin/ui/charts.tsx, simplified: same frame, same colours)
// ===========================================================================

function sparkline(values, series = 1) {
  const max = Math.max(...values, 1)
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(1)},${(26 - (v / max) * 24).toFixed(1)}`).join(' ')
  return html`<svg viewBox="0 0 100 28" preserveAspectRatio="none" class="h-7 w-full" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--chart-${series})" stroke-width="1.5" vector-effect="non-scaling-stroke" /></svg>`
}

function trendChart(points, series, fmt) {
  const max = Math.max(...points.map((p) => p.value), 1)
  const W = 600
  const Hh = 180
  const xy = points.map((p, i) => [(i / (points.length - 1)) * W, Hh - 8 - (p.value / max) * (Hh - 24)])
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${W},${Hh} L0,${Hh} Z`
  const ticks = points.filter((_, i) => i % Math.ceil(points.length / 6) === 0)
  return html`<div>
    <svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" class="h-48 w-full" role="img" aria-label="Trend, peak ${fmt(max)}">
      ${[0.25, 0.5, 0.75].map((f) => html`<line x1="0" x2="${W}" y1="${Hh * f}" y2="${Hh * f}" stroke="var(--chart-grid)" stroke-width="1" vector-effect="non-scaling-stroke" />`)}
      <path d="${area}" fill="color-mix(in srgb, var(--chart-${series}) 12%, transparent)" />
      <path d="${line}" fill="none" stroke="var(--chart-${series})" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
    </svg>
    <div class="mt-1 flex justify-between text-xs text-muted">${ticks.map((t) => html`<span>${t.label}</span>`)}</div>
    <p class="mt-2 text-xs text-muted">Peak ${fmt(max)} a day</p>
  </div>`
}

function donut(slices, centerLabel, centerValue) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1
  const C = 2 * Math.PI * 40
  let offset = 0
  return html`<div class="flex flex-col items-center gap-4">
    <div class="relative h-40 w-40">
      <svg viewBox="0 0 100 100" class="h-40 w-40 -rotate-90">${slices.map((s) => {
        const len = (s.value / total) * C
        const el = html`<circle cx="50" cy="50" r="40" fill="none" stroke="${s.color}" stroke-width="14" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" />`
        offset += len
        return el
      })}</svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center"><span class="text-lg font-semibold text-fg">${centerValue}</span><span class="text-xs text-muted">${centerLabel}</span></div>
    </div>
    <ul class="w-full space-y-1.5">${slices.map((s) => html`<li class="flex items-center justify-between gap-2 text-sm">
      <span class="flex items-center gap-2"><span class="h-2.5 w-2.5 rounded-sm" style="background:${s.color}"></span>${s.label}</span>
      <span class="font-medium text-fg">${money(s.value)} · ${Math.round((s.value / total) * 100)}%</span></li>`)}</ul>
  </div>`
}

function barList(items, fmt = count) {
  if (items.length === 0) return html`<p class="py-8 text-center text-sm text-muted">Nothing to show yet.</p>`
  const max = Math.max(...items.map((i) => i.value), 1)
  return html`<ul class="space-y-2.5">${items.map((i) => html`<li>
    <${raw(i.to ? 'a' : 'div')} ${i.to ? raw(`href="#${esc(i.to)}"`) : ''} class="block w-full text-left ${i.to ? 'group cursor-pointer' : ''}">
      <div class="mb-1 flex items-baseline justify-between gap-2 text-sm"><span class="truncate text-fg group-hover:text-brand">${i.label}</span><span class="shrink-0 font-medium text-fg">${fmt(i.value)}</span></div>
      <div class="h-2 overflow-hidden rounded-pill bg-surface-alt"><div class="h-full rounded-pill transition-[width] duration-500" style="width:${Math.max((i.value / max) * 100, i.value ? 2 : 0)}%;background:${i.color || 'var(--chart-1)'}"></div></div>
    </${raw(i.to ? 'a' : 'div')}></li>`)}</ul>`
}

// ===========================================================================
// Shell (admin/layout/AdminLayout.tsx)
// ===========================================================================

const NAV_GROUPS = [
  { title: 'Overview', items: [{ to: '/', label: 'Dashboard', ico: 'dashboard', end: true }] },
  { title: 'Commerce', items: [
    { to: '/orders', label: 'Orders', ico: 'orders' },
    { to: '/payments', label: 'Payments', ico: 'card' },
    { to: '/products', label: 'Products', ico: 'tag' },
    { to: '/categories', label: 'Categories', ico: 'layers' },
    { to: '/category-mapping', label: 'Category mapping', ico: 'shuffle' },
  ] },
  { title: 'Finance', items: [
    { to: '/seller-payouts', label: 'Seller payouts', ico: 'wallet' },
    { to: '/finance/sellers', label: 'Seller balances', ico: 'scale' },
    { to: '/finance/fees', label: 'Fee settings', ico: 'percent' },
  ] },
  { title: 'Accounts', items: [
    { to: '/stores', label: 'Stores & sellers', ico: 'store' },
    { to: '/customers', label: 'Customers', ico: 'users' },
    { to: '/affiliates', label: 'Affiliates', ico: 'link' },
  ] },
  { title: 'Platform', items: [
    { to: '/support', label: 'Support', ico: 'help' },
    { to: '/whatsapp', label: 'WhatsApp', ico: 'chat' },
    { to: '/banners', label: 'Homepage banners', ico: 'image' },
    { to: '/home-sections', label: 'Homepage sections', ico: 'layout' },
    { to: '/theme-templates', label: 'Store themes', ico: 'palette' },
    { to: '/notifications', label: 'Notifications', ico: 'bell' },
    { to: '/activity', label: 'Activity log', ico: 'activity' },
    { to: '/admins', label: 'Admin users', ico: 'shield' },
  ] },
  { title: 'Documents', items: [{ to: '/docs/whatsapp-templates', label: 'WhatsApp templates', ico: 'file' }] },
]
const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items)

function adminView() {
  const db = S()
  const ui = Store.ui
  const admin = db.admin
  const unread = Q.unread(db, 'admin')
  const notes = db.notifications.filter((n) => n.to === 'admin').slice(0, 8)
  const term = (ui.pageQuery || '').trim().toLowerCase()
  const found = term ? NAV_ITEMS.filter((i) => i.label.toLowerCase().includes(term)) : []
  document.body.classList.toggle('nav-open', !!ui.drawer)
  if (App.current.name === 'login') return html`${App.body()}`

  return html`
  <div class="shell">
    <aside class="sidebar" aria-label="Main navigation">
      <div class="brandmark">
        <span role="img" aria-label="UnieMax" class="logo-lockup block shrink-0 -mr-5 h-6"></span><b>Admin</b>
        ${ibtn('x', 'Close menu', 'data-act="closeDrawer"', 'only-sm ml-auto')}
      </div>
      <nav class="nav">${NAV_GROUPS.map((g, i) => html`<div>
        ${i > 0 ? html`<div class="nav-sec">${g.title}</div>` : ''}
        ${g.items.map((item) => html`<a href="#${item.to}" class="${App.isOn(item.to, item.end) ? 'on' : ''}" data-act="closeDrawer">${AIcon(item.ico)}<span>${item.label}</span></a>`)}
      </div>`)}</nav>
      <div class="side-foot">
        <span class="av av-28" style="--av: var(--brand)">${initials(admin.name)}</span>
        <div><b title="${admin.email}">${admin.name}</b><span>Super admin</span></div>
        ${ibtn('logout', 'Sign out', 'data-act="signOut"', 'danger')}
      </div>
    </aside>
    <div class="side-back" aria-hidden="true" data-act="closeDrawer"></div>

    <div class="shell-body">
      <header class="top">
        ${ibtn('menu', 'Open navigation', 'data-act="openDrawer"', 'only-sm')}
        <form class="gsearch" role="search" data-submit="pageSearchGo" data-popover="search">
          <label>${AIcon('search', 15)}<span class="sr-only">Search pages</span>
            <input id="gsearch" type="search" value="${ui.pageQuery || ''}" placeholder="Search pages…" autocomplete="off" data-search="pageSearch" /><kbd>/</kbd></label>
          ${term ? html`<div class="gres">${found.length === 0
            ? html`<p class="gr-empty">No page called “${ui.pageQuery.trim()}”.</p>`
            : found.map((item, i) => html`<a href="#${item.to}" class="${i === 0 ? 'on' : ''}" data-act="pageSearchClear"><span class="flex items-center gap-2.5">${AIcon(item.ico)}<b>${item.label}</b></span><em>Open</em></a>`)}</div>` : ''}
        </form>
        <div class="top-r">
          <a href="seller.html" target="_blank" class="lnk">View marketplace</a>
          <div class="relative" data-popover="bell">
            <button type="button" class="ibtn relative" aria-label="Notifications" title="Notifications" data-act="togglePopover" data-args='["bell"]'>${AIcon('bell')}${unread > 0 ? html`<span class="nbadge">${unread}</span>` : ''}</button>
            ${ui.popover === 'bell' ? html`<div class="gres" style="left:auto;right:0;width:340px;top:38px">
              <div class="gr-g flex items-center justify-between">Notifications${unread ? html`<button type="button" class="lnk sm" data-act="readAll">Mark all read</button>` : ''}</div>
              ${notes.length === 0 ? html`<p class="gr-empty">Nothing new.</p>` : notes.map((n) => html`
                <a href="#" data-act="openNote" data-args="${args(n.id)}" class="${n.read ? '' : 'on'}">
                  <span class="min-w-0"><b class="block truncate">${n.title}</b><span class="block truncate text-xs text-muted">${n.body}</span></span><em>${relative(n.at)}</em>
                </a>`)}
            </div>` : ''}
          </div>
          ${ibtn(Theme.mode === 'dark' ? 'sun' : 'moon', Theme.mode === 'dark' ? 'Light theme' : 'Dark theme', 'data-act="toggleTheme"')}
        </div>
      </header>
      <main class="page">${App.body()}</main>
    </div>
  </div>
  ${ui.dialog ? adminDialog(ui.dialog) : ''}`
}

// ===========================================================================
// Pages
// ===========================================================================

/** A repeatable "platform traffic" curve, plus the real orders on top. */
function daySeries(db, days) {
  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    const key = d.toDateString()
    const real = db.orders.filter((o) => o.status !== 'CANCELLED' && new Date(o.placedAt).toDateString() === key)
    const base = 9000 + 4000 * Math.sin(i / 3) + 2500 * Math.cos(i / 1.7) + (d.getDay() === 0 ? 5000 : 0)
    out.push({
      date: d.toISOString(),
      revenue: Math.max(0, Math.round(base)) + real.reduce((s, o) => s + o.total, 0),
      orders: Math.max(1, Math.round(base / 900)) + real.length,
    })
  }
  return out
}

const DashboardPage = {
  render() {
    const db = S()
    const ui = Store.ui
    const days = ui.days
    const series = daySeries(db, days)
    const orders = Q.orders(db)
    const live = orders.filter((o) => o.status !== 'CANCELLED')
    const by = (s) => orders.filter((o) => o.status === s).length
    const today = new Date().toDateString()
    const revenueAll = db.stores.reduce((s, st) => s + Q.stats(db, st).revenue, 0)
    const online = live.filter((o) => o.paymentMethod === 'ONLINE').reduce((s, o) => s + o.total, 0) + 812000
    const cod = live.filter((o) => o.paymentMethod === 'COD').reduce((s, o) => s + o.total, 0) + 367000
    const open = db.tickets.filter((t) => t.status === 'OPEN').length
    const toPay = Q.toPay(db)
    const topStores = db.stores.map((s) => ({ label: s.name, value: Q.stats(db, s).revenue, to: `/stores/${s.id}` })).sort((a, b) => b.value - a.value).slice(0, 5)
    const low = db.products.filter((p) => p.stock <= 5)
    const pts = series.map((p) => ({ label: dayTick(p.date), value: ui.measure === 'revenue' ? p.revenue : p.orders }))

    return html`
      ${pageHead({ title: 'Dashboard', subtitle: `Platform activity over the last ${days} days`, actions: segmented('setDays', days, [7, 30, 90].map((d) => ({ value: d, label: `${d} days` }))) })}

      ${open || toPay.length ? html`<div class="callout c-warn" role="status">${AIcon('alert', 15)}<span class="font-medium text-fg">Needs you:</span>
        ${open ? html`<a href="#/support" class="st st-warn"><i></i>${plural(open, 'open ticket')}</a>` : ''}
        ${toPay.length ? html`<a href="#/seller-payouts" class="st st-warn"><i></i>${plural(toPay.length, 'seller payout')} to send</a>` : ''}
      </div>` : ''}

      <div class="stats">
        <div class="stat"><span class="stat-l">Revenue</span><span class="stat-v">${money(revenueAll)}</span><span class="stat-s">All time, excluding cancelled</span><span class="spark block">${sparkline(series.map((p) => p.revenue), 1)}</span></div>
        <a href="#/orders" class="stat"><span class="stat-l">Orders</span><span class="stat-v">${count(db.stores.reduce((s, st) => s + Q.stats(db, st).orders, 0))}</span><span class="stat-s">${count(orders.filter((o) => new Date(o.placedAt).toDateString() === today).length)} today</span><span class="spark block">${sparkline(series.map((p) => p.orders), 2)}</span></a>
        <a href="#/stores" class="stat"><span class="stat-l">Stores</span><span class="stat-v">${db.stores.length}</span><span class="stat-s">${db.stores.filter((s) => s.isPublished).length} published · ${db.stores.filter((s) => !s.isPublished).length} draft</span></a>
        <div class="stat"><span class="stat-l">Customers</span><span class="stat-v">${count(1284)}</span><span class="stat-s">${Object.keys(db.owners).length} sellers</span></div>
      </div>

      <div class="grid-3">
        <div class="span-2 min-w-0">${card({ title: ui.measure === 'revenue' ? 'Revenue' : 'Orders', subtitle: `Per day, last ${days} days`, action: segmented('setMeasure', ui.measure, [{ value: 'revenue', label: 'Revenue' }, { value: 'orders', label: 'Orders' }]), body: trendChart(pts, ui.measure === 'revenue' ? 1 : 2, ui.measure === 'revenue' ? money : count) })}</div>
        ${card({ title: 'Payment split', subtitle: 'Revenue by method, all time', body: donut([{ label: 'Online', value: online, color: 'var(--chart-1)' }, { label: 'Cash on delivery', value: cod, color: 'var(--chart-2)' }], 'billed', moneyShort(online + cod)) })}
      </div>

      <div class="grid-3">
        ${card({ title: 'Order pipeline', subtitle: 'Every order, by stage', body: barList([
          ['Pending', 'PENDING'], ['Confirmed', 'CONFIRMED'], ['Packed', 'PACKED'], ['Shipped', 'SHIPPED'], ['Delivered', 'DELIVERED'], ['Cancelled', 'CANCELLED'],
        ].map(([label, s]) => ({ label, value: by(s), to: `/orders?status=${s}`, ...(s === 'CANCELLED' ? { color: 'var(--danger)' } : {}) }))) })}
        ${card({ title: 'Top stores', subtitle: 'By revenue', body: barList(topStores, moneyShort) })}
        ${card({ title: 'Support queue', subtitle: 'Waiting on the team', body: barList(['OPEN', 'IN_PROGRESS', 'RESOLVED'].map((s) => ({ label: STATUS.ticket[s].admin, value: db.tickets.filter((t) => t.status === s).length, to: `/support?status=${s}`, color: s === 'OPEN' ? 'var(--warning)' : undefined }))) })}
      </div>

      <div class="grid-3 mb-0">
        ${card({ cls: 'span-2', pad: 'none', title: 'Latest orders', action: html`<a href="#/orders" class="lnk sm">View all</a>`, body: html`<ul class="mini-list">${orders.slice(0, 6).map((o) => html`
          <li><a href="#/orders/${o.id}"><span class="ml-m"><b>${o.number} · ${Q.store(db, o.storeId).name}</b><em>${o.customer.name} · ${relative(o.placedAt)}</em></span>
            <span class="ml-r"><span class="ml-chips hide-sm">${orderStatusChip(o.status)}${paymentChip(o.paymentStatus, o.paymentMethod)}</span><span class="num font-semibold text-fg">${money(o.total)}</span></span></a></li>`)}</ul>` })}
        ${card({ pad: 'none', title: 'Low stock', subtitle: '5 or fewer left, live listings', body: low.length === 0 ? html`<p class="mini-empty">Nothing running low.</p>` : html`<ul class="mini-list">${low.map((p) => html`
          <li><div class="ml-row"><span class="ml-m"><b>${p.name}</b><em>${Q.store(db, p.storeId).name}</em></span>${p.stock === 0 ? chip('danger', 'Out of stock') : chip('warning', `${p.stock} left`)}</div></li>`)}</ul>` })}
      </div>`
  },
}

const A_ORDER_TABS = ['', 'PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED']

const OrdersPage = {
  render(params, query) {
    const db = S()
    const ui = Store.ui
    const status = A_ORDER_TABS.includes(query.status || '') ? query.status || '' : ''
    const q = (ui.ordersQuery || '').trim().toLowerCase()
    const all = Q.orders(db)
    const rows = all.filter((o) =>
      (!status || o.status === status) &&
      (!ui.ordersStore || o.storeId === ui.ordersStore) &&
      (!ui.ordersSource || (ui.ordersSource === 'BILL') === (o.source === 'BILL')) &&
      (!q || o.number.toLowerCase().includes(q.replace(/^#/, '')) || o.customer.name.toLowerCase().includes(q)))
    return html`
      ${pageHead({ title: 'Orders', subtitle: 'Every order on the marketplace' })}
      ${card({ pad: 'none', cls: 'max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0', body: html`
        ${tabs('ordersTab', status, A_ORDER_TABS.map((s) => ({ value: s, label: s ? STATUS.order[s].admin : 'All', count: s ? all.filter((o) => o.status === s).length : all.length })))}
        <div class="fbar">
          ${searchBox('ordersQuery', ui.ordersQuery, 'Order number or customer…', 'orders-q')}
          ${filterSelect('ordersStore', 'Store', ui.ordersStore || '', [{ value: '', label: 'Any' }, ...db.stores.map((s) => ({ value: s.id, label: s.name }))])}
          ${filterSelect('ordersSource', 'Source', ui.ordersSource || '', [{ value: '', label: 'Any' }, { value: 'SHOP', label: 'Shop checkout' }, { value: 'BILL', label: 'Seller bill' }])}
        </div>
        ${dataTable({
          rows,
          link: (o) => `/orders/${o.id}`,
          emptyTitle: 'No orders match these filters',
          columns: [
            { header: 'Order', primary: true, cell: (o) => html`<span class="flex flex-wrap items-center gap-1.5"><span class="font-medium text-fg">${o.number}</span>${o.source === 'BILL' ? chip('brand', 'Bill') : ''}</span><span class="sub">${relative(o.placedAt)}</span>` },
            { header: 'Store', cell: (o) => Q.store(db, o.storeId).name },
            { header: 'Customer', hideOnMobile: true, cell: (o) => o.customer.name },
            { header: 'Status', cell: (o) => orderStatusChip(o.status) },
            { header: 'Payment', cell: (o) => paymentChip(o.paymentStatus, o.paymentMethod) },
            { header: 'Total', cls: 'text-right', cell: (o) => html`<span class="num font-medium">${money(o.total)}</span>` },
          ],
          mobileRow: (o) => html`<div class="flex items-baseline justify-between gap-3"><p class="min-w-0 truncate font-medium text-fg">${o.number} · ${o.customer.name}</p><p class="shrink-0 font-figure text-sm font-medium text-fg">${money(o.total)}</p></div>
            <p class="mt-0.5 truncate text-sm text-muted">${Q.store(db, o.storeId).name} · ${relative(o.placedAt)}</p>
            <div class="mt-2 flex flex-wrap gap-1.5">${orderStatusChip(o.status)}${paymentChip(o.paymentStatus, o.paymentMethod)}${o.source === 'BILL' ? chip('brand', 'Bill') : ''}</div>`,
        })}` })}`
  },
}

function payoutBlock(db, order) {
  const share = sellerShare(order, db.fees)
  const payout = Q.payoutFor(db, order.id)
  const due = Q.toPay(db).some((o) => o.id === order.id)
  const busy = Store.ui.busy[`pay:${order.id}`]
  return html`
    <dl class="bill total">
      ${detail('Order total', moneyExact(order.total))}
      ${detail(`Platform fee (${db.fees.platformPct}%)`, '− ' + moneyExact(share.platform))}
      ${detail(`Gateway fee (${db.fees.gatewayPct}%)`, '− ' + moneyExact(share.gateway))}
      ${detail('Seller gets', moneyExact(share.net))}
    </dl>
    ${payout ? html`<div class="mt-3 flex flex-wrap items-center gap-2">${payoutChip(payout.status)}<span class="text-xs text-muted">${payout.number} · ${payout.ref}</span></div>
      ${payout.failReason ? html`<p class="mt-2 text-xs text-danger">${payout.failReason}</p>` : ''}` : ''}
    ${due ? html`<button type="button" class="${abtn({ variant: 'primary', size: 'md', cls: 'mt-3 w-full' })}" data-act="payOut" data-args="${args(order.id)}" ${busy ? 'disabled' : ''}>${busy ? spinner() : ''}${busy ? 'Sending…' : payout ? 'Try the payout again' : `Pay seller ${moneyExact(share.net)}`}</button>`
      : !payout ? html`<p class="mt-3 text-xs text-muted">${order.paymentMethod !== 'ONLINE' ? 'Cash order — the seller already holds the money.' : order.status === 'CANCELLED' ? 'Cancelled — nothing to pay.' : 'Payable once the order is delivered.'}</p>` : ''}`
}

const OrderPage = {
  render({ id }) {
    const db = S()
    const o = Q.order(db, id)
    if (!o) return html`${pageHead({ title: 'Order not found', back: { to: '/orders', label: 'Orders' } })}`
    const store = Q.store(db, o.storeId)
    const steps = [['Placed', o.placedAt], ['Confirmed', o.confirmedAt], ['Packed', o.packedAt], ['Shipped', o.shippedAt], ['Delivered', o.deliveredAt]]
    if (o.cancelledAt) steps.push(['Cancelled', o.cancelledAt])
    return html`
      ${pageHead({ title: `Order ${o.number}`, back: { to: '/orders', label: 'Orders' }, subtitle: html`<span class="flex flex-wrap items-center gap-2">${orderStatusChip(o.status)}${paymentChip(o.paymentStatus, o.paymentMethod)}<span class="text-muted">Placed ${dateTime(o.placedAt)}</span></span>` })}
      <div class="grid-main">
        <div class="space-y-4">
          ${card({ pad: 'none', title: 'Items', count: o.items.length, body: html`<table class="tbl"><thead><tr><th>Item</th><th class="text-right">Qty</th><th class="text-right">Price</th><th class="text-right">Total</th></tr></thead>
            <tbody>${o.items.map((i) => html`<tr><td><span class="flex items-center gap-2.5"><span class="h-8 w-8 shrink-0 rounded-md border border-line" style="background:${i.tone}"></span><span class="min-w-0">${i.name}${i.variantName || i.sku ? html`<span class="sub">${[i.variantName, i.sku].filter(Boolean).join(' · ')}</span>` : ''}</span></span></td><td class="text-right num">${i.qty}</td><td class="text-right num">${money(i.price)}</td><td class="text-right num font-medium">${money(i.qty * i.price)}</td></tr>`)}</tbody></table>` })}
          <div class="grid-2 mb-0">
            ${card({ title: 'Customer', body: html`<dl>${detail('Name', o.customer.name)}${detail('Phone', o.customer.phone || '—')}${detail('Email', o.customer.email || '—')}${detail(o.fulfilment === 'IN_SHOP' ? 'Handed over' : 'Address', o.fulfilment === 'IN_SHOP' ? 'In the shop — no delivery' : o.customer.address)}</dl>` })}
            ${card({ title: 'Timeline', body: html`<dl>${steps.map(([label, at]) => detail(label, at ? dateTime(at) : html`<span class="text-muted">—</span>`))}${o.tracking ? detail('Tracking', `${o.courier} · ${o.tracking}`) : ''}</dl>` })}
          </div>
        </div>
        <div class="space-y-4">
          ${card({ title: 'Store', body: html`<div class="flex items-center gap-3">${storeAvatar(store)}<div class="min-w-0"><a href="#/stores/${store.id}" class="lnk">${store.name}</a><span class="sub">/${store.slug}</span></div></div>` })}
          ${o.billId ? orderBillCard(db, o) : ''}
          ${card({ title: 'Payment', body: html`<dl class="bill total">${detail('Items', money(o.subtotal))}${detail('Delivery', o.fulfilment === 'IN_SHOP' ? 'None — in the shop' : o.shipping ? money(o.shipping) : 'Free')}${o.discount ? detail('Discount', '− ' + money(o.discount)) : ''}${detail('Total', money(o.total))}</dl>` })}
          ${card({ title: 'Seller payout', subtitle: 'Online orders are paid to the seller after delivery', body: payoutBlock(db, o) })}
        </div>
      </div>`
  },
}

const StoresPage = {
  render() {
    const db = S()
    const ui = Store.ui
    const q = (ui.storesQuery || '').trim().toLowerCase()
    const status = ui.storesTab
    const rows = db.stores.filter((s) => {
      const st = s.suspendedAt ? 'SUSPENDED' : s.isPublished ? 'PUBLISHED' : 'DRAFT'
      const owner = Q.owner(db, s)
      return (!status || st === status) && (!q || s.name.toLowerCase().includes(q) || s.slug.includes(q) || owner.email.includes(q))
    })
    return html`
      ${pageHead({ title: 'Stores & sellers', subtitle: 'Every store on the marketplace' })}
      ${card({ pad: 'none', cls: 'max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0', body: html`
        ${tabs('storesTab', status, [{ value: '', label: 'All' }, { value: 'PUBLISHED', label: 'Published' }, { value: 'DRAFT', label: 'Draft' }, { value: 'SUSPENDED', label: 'Suspended' }])}
        <div class="fbar">${searchBox('storesQuery', ui.storesQuery, 'Store name, slug or owner email…', 'stores-q')}</div>
        ${dataTable({
          rows,
          link: (s) => `/stores/${s.id}`,
          emptyTitle: 'No stores match these filters',
          columns: [
            { header: 'Store', primary: true, cell: (s) => html`<div class="flex min-w-0 items-center gap-2.5">${storeAvatar(s)}<div class="min-w-0"><p class="truncate font-medium text-fg">${s.name}</p><p class="truncate text-xs text-muted">/${s.slug}</p></div></div>` },
            { header: 'Owner', cell: (s) => { const o = Q.owner(db, s); return html`<div class="min-w-0"><p class="truncate text-sm">${o.name || '—'}</p><p class="truncate text-xs text-muted">${o.email}</p></div>` } },
            { header: 'Status', cell: (s) => storeChip(s) },
            { header: 'Setup', cell: (s) => setupChip(s) },
            { header: 'Catalog', hideOnMobile: true, cell: (s) => { const st = Q.stats(db, s); return html`<span class="text-sm text-muted">${count(st.products)} products · ${count(st.categories)} categories</span>` } },
            { header: 'Orders', cls: 'text-right', cell: (s) => count(Q.stats(db, s).orders) },
            { header: 'Revenue', cls: 'text-right', cell: (s) => html`<span class="font-medium">${money(Q.stats(db, s).revenue)}</span>` },
            { header: 'Created', hideOnMobile: true, cell: (s) => html`<span class="text-sm text-muted">${day(s.createdAt)}</span>` },
          ],
          mobileRow: (s) => html`<div class="flex gap-3">${storeAvatar(s, 'h-11 w-11')}<div class="min-w-0 flex-1">
            <div class="flex items-baseline justify-between gap-3"><p class="min-w-0 truncate font-medium text-fg">${s.name}</p><p class="shrink-0 font-figure text-sm font-medium text-fg">${money(Q.stats(db, s).revenue)}</p></div>
            <p class="mt-0.5 truncate text-sm text-muted">${Q.owner(db, s).name || Q.owner(db, s).email}</p>
            <div class="mt-2 flex flex-wrap items-center gap-1.5">${storeChip(s)}${setupChip(s)}<span class="ml-auto text-xs text-muted">${count(Q.stats(db, s).orders)} orders</span></div></div></div>`,
        })}` })}`
  },
}

const StorePage = {
  render({ id }) {
    const db = S()
    const store = Q.store(db, id)
    if (!store) return pageHead({ title: 'Store not found', back: { to: '/stores', label: 'All stores' } })
    const owner = Q.owner(db, store)
    const st = Q.stats(db, store)
    const suspended = !!store.suspendedAt
    const orders = Q.orders(db, store.id).slice(0, 6)
    const b = store.business
    const set = store.settings
    return html`
      ${pageHead({
        title: store.name,
        back: { to: '/stores', label: 'All stores' },
        subtitle: html`<span class="flex flex-wrap items-center gap-2">${storeChip(store)}${store.verifiedAt ? chip('success', 'Verified') : ''}<a href="seller.html" target="_blank" class="inline-flex items-center gap-1 text-accent hover:underline">/store/${store.slug}${AIcon('external', 14)}</a></span>`,
        actions: html`<div class="flex flex-wrap items-center gap-2">
          ${store.id === db.me.storeId ? html`<a href="seller.html" target="_blank" class="${abtn()}">Manage store</a>` : ''}
          <button type="button" class="${abtn({ variant: suspended ? 'secondary' : 'danger' })}" data-act="askSuspend" data-args="${args(store.id)}">${suspended ? 'Lift suspension' : 'Suspend store'}</button></div>`,
      })}
      ${suspended ? html`<div class="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
        <p class="font-medium text-fg">Suspended on ${day(store.suspendedAt)} — hidden from the marketplace and not accepting orders.</p>
        ${store.suspendedReason ? html`<p class="mt-1 text-muted">Reason: ${store.suspendedReason}</p>` : ''}</div>` : ''}

      <div class="grid gap-4 lg:grid-cols-3">
        ${card({ title: 'Owner', body: html`<div class="flex items-center gap-3">${storeAvatar(store, 'h-12 w-12')}<div class="min-w-0"><p class="truncate font-medium text-fg">${owner.name || 'Unnamed'}</p><p class="truncate text-sm text-muted">${owner.email}</p></div></div>
          <dl class="mt-3">${detail('Phone', owner.phone || '—')}${detail('Store created', day(store.createdAt))}${detail('First published', store.publishedAt ? day(store.publishedAt) : 'Never')}</dl>` })}
        ${card({ title: 'Business', body: html`<dl class="bill">${detail('Revenue', money(st.revenue))}${detail('Orders', count(st.orders))}${detail('Products', count(st.products))}${detail('Categories', count(st.categories))}</dl>` })}
        ${card({ title: 'Checkout settings', subtitle: 'What this store offers customers', body: html`<dl>
          ${detail('Online payment', set.online ? chip('success', 'On') : chip('neutral', 'Off'))}
          ${detail('Cash on delivery', set.cod ? chip('success', 'On') : chip('neutral', 'Off'))}
          ${detail('Fulfilment', 'Delivery only')}
          ${detail('Shipping charge', `Flat ${moneyExact(set.rate.amount)} per order · free above ${moneyExact(set.rate.freeAbove)}`)}</dl>` })}
      </div>

      ${planStoreCard(db, store)}

      ${card({ cls: 'mt-4', title: 'Store verification', subtitle: store.verifiedAt ? `Verified on ${day(store.verifiedAt)}` : 'Check the GST and PAN against the documents before verifying', action: html`<button type="button" class="${abtn({ variant: store.verifiedAt ? 'secondary' : 'primary' })}" data-act="askVerify" data-args="${args(store.id)}">${store.verifiedAt ? 'Remove verification' : 'Mark verified'}</button>`, body: b
        ? html`<dl>${detail('Business name', b.businessName)}${detail('Seller name', b.sellerName)}${detail('GSTIN', html`<span class="font-mono">${b.gstin}</span>`)}${detail('PAN', html`<span class="font-mono">${b.pan}</span>`)}${detail('Business address', b.address)}${store.verifyNote ? detail('Note to seller', store.verifyNote) : ''}</dl>`
        : html`<p class="py-6 text-center text-sm text-muted">The seller hasn't filled in business details yet.</p>` })}

      ${card({ cls: 'mt-4', title: 'Payout accounts', subtitle: 'Only a primary, verified account receives settlements', body: store.bank
        ? html`<dl>${detail('Account holder', store.bank.holder)}${detail('Account number', html`<span class="font-mono">${store.bank.number}</span>`)}${detail('IFSC', html`<span class="font-mono">${store.bank.ifsc}</span>`)}${detail('Bank', `${store.bank.bankName} · ${store.bank.branch}`)}${detail('Bank check', chip('success', 'Verified'))}</dl>`
        : html`<p class="py-6 text-center text-sm text-muted">The seller hasn't added a payout account yet.</p>` })}

      ${card({ cls: 'mt-4', pad: 'none', title: 'Recent orders', action: html`<a href="#/orders" class="lnk sm">All orders</a>`, body: orders.length === 0 ? html`<p class="mini-empty">No orders in the prototype data for this store.</p>` : html`<ul class="mini-list">${orders.map((o) => html`
        <li><a href="#/orders/${o.id}"><span class="ml-m"><b>${o.number} · ${o.customer.name}</b><em>${relative(o.placedAt)}</em></span><span class="ml-r">${orderStatusChip(o.status)}<span class="num font-semibold text-fg">${money(o.total)}</span></span></a></li>`)}</ul>` })}`
  },
}

const PayoutsPage = {
  render() {
    const db = S()
    const ui = Store.ui
    const due = Q.toPay(db)
    const all = [...db.payouts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).filter((p) => !ui.payoutStatus || p.status === ui.payoutStatus)
    return html`
      ${pageHead({ title: 'Seller payouts', subtitle: 'Money sent to sellers for online orders. Pay from here or from the order page.' })}
      ${card({ pad: 'none', title: 'To pay', count: due.length, subtitle: 'Delivered, paid online, not paid out yet', body: dataTable({
        rows: due,
        emptyTitle: 'Nothing to pay',
        emptyHint: 'Every delivered online order has been paid out.',
        columns: [
          { header: 'Order', primary: true, cell: (o) => html`<a href="#/orders/${o.id}" class="lnk">${o.number}</a><span class="sub">${Q.store(db, o.storeId).name}</span>` },
          { header: 'Delivered', cell: (o) => relative(o.deliveredAt) },
          { header: 'Earlier attempts', cell: (o) => { const p = Q.payoutFor(db, o.id); return p ? payoutChip(p.status) : html`<span class="text-muted">None</span>` } },
          { header: 'Order total', cls: 'text-right', cell: (o) => html`<span class="num">${money(o.total)}</span>` },
          { header: 'Seller gets', cls: 'text-right', cell: (o) => html`<span class="num font-medium">${moneyExact(sellerShare(o, db.fees).net)}</span>` },
          { header: '', cls: 'text-right', cell: (o) => { const busy = ui.busy[`pay:${o.id}`]; return html`<button type="button" class="${abtn({ variant: 'primary' })}" data-act="payOut" data-args="${args(o.id)}" ${busy ? 'disabled' : ''}>${busy ? spinner() : ''}${busy ? 'Sending…' : 'Pay'}</button>` } },
        ],
      }) })}
      <div class="mt-4">${card({ pad: 'none', title: 'Payouts', count: db.payouts.length, body: html`
        <div class="fbar">${filterSelect('payoutStatus', 'Status', ui.payoutStatus || '', [{ value: '', label: 'Any' }, ...Object.keys(STATUS.payout).map((k) => ({ value: k, label: STATUS.payout[k].admin }))])}</div>
        ${dataTable({
          rows: all,
          emptyTitle: 'No payouts yet',
          columns: [
            { header: 'Order', primary: true, cell: (p) => { const o = Q.order(db, p.orderId); return html`<a href="#/orders/${p.orderId}" class="lnk">${o ? o.number : p.orderId}</a><span class="sub">${Q.store(db, p.storeId).name}</span>` } },
            { header: 'Status', cell: (p) => payoutChip(p.status) },
            { header: 'Method', cell: () => chip('neutral', 'PaymentHub') },
            { header: 'From / reference', hideOnMobile: true, cell: (p) => html`<span class="font-mono text-xs">${p.ref}</span>` },
            { header: 'Paid on', cell: (p) => (p.paidAt ? dateTime(p.paidAt) : html`<span class="text-muted">—</span>`) },
            { header: 'Amount', cls: 'text-right', cell: (p) => html`<span class="num font-medium">${moneyExact(p.amount)}</span>` },
          ],
        })}` })}</div>`
  },
}

const SupportPage = {
  render(params, query) {
    const db = S()
    const ui = Store.ui
    const status = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', ''].includes(query.status ?? ui.supportTab) ? query.status ?? ui.supportTab : ''
    const q = (ui.supportQuery || '').trim().toLowerCase()
    const all = Q.tickets(db)
    const rows = all.filter((t) => (!status || t.status === status) && (!q || t.subject.toLowerCase().includes(q) || t.number.toLowerCase().includes(q)))
    return html`
      ${pageHead({ title: 'Support', subtitle: 'Questions from sellers about their shop, and from shoppers about their account' })}
      ${card({ pad: 'none', cls: 'max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0', body: html`
        ${tabs('supportTab', status, [
          { value: 'OPEN', label: 'Open', count: all.filter((t) => t.status === 'OPEN').length },
          { value: 'IN_PROGRESS', label: 'In progress', count: all.filter((t) => t.status === 'IN_PROGRESS').length },
          { value: 'RESOLVED', label: 'Resolved' },
          { value: 'CLOSED', label: 'Closed' },
          { value: '', label: 'All' },
        ])}
        <div class="fbar">${searchBox('supportQuery', ui.supportQuery, 'Subject or ticket number…', 'support-q')}</div>
        ${dataTable({
          rows,
          link: (t) => `/support/${t.id}`,
          emptyTitle: 'No tickets here',
          columns: [
            { header: 'Ticket', primary: true, cell: (t) => html`<span class="font-medium text-fg">${t.subject}</span><span class="sub">${t.number} · ${STATUS.category[t.category]}</span>` },
            { header: 'From', cell: (t) => html`<span class="flex flex-wrap items-center gap-1.5">${scopeChip(t)}<span class="text-sm">${t.storeId ? Q.store(db, t.storeId).name : t.messages[0].authorName}</span></span>` },
            { header: 'Status', cell: (t) => ticketChipA(t.status) },
            { header: 'Priority', cell: (t) => priorityChip(t.priority) },
            { header: 'Last activity', cls: 'text-right', cell: (t) => html`<span class="text-sm text-muted">${relative(t.lastMessageAt)}</span>` },
          ],
          mobileRow: (t) => html`<p class="truncate font-medium text-fg">${t.subject}</p><p class="mt-0.5 truncate text-sm text-muted">${t.number} · ${t.storeId ? Q.store(db, t.storeId).name : 'Shopper'} · ${relative(t.lastMessageAt)}</p>
            <div class="mt-2 flex flex-wrap gap-1.5">${ticketChipA(t.status)}${priorityChip(t.priority)}${scopeChip(t)}</div>`,
        })}` })}`
  },
}

const TicketPage = {
  render({ id }) {
    const db = S()
    if (Store.ui.drafts.replyFor !== id) Object.assign(Store.ui.drafts, { reply: '', replyFor: id })
    const t = Q.ticket(db, id)
    if (!t) return pageHead({ title: 'Ticket not found', back: { to: '/support', label: 'All tickets' } })
    const closed = t.status === 'CLOSED'
    const busy = Store.ui.busy[`ticket:${t.id}`]
    const reply = Store.ui.drafts.reply || ''
    const store = t.storeId ? Q.store(db, t.storeId) : null
    return html`
      ${pageHead({ title: t.subject, back: { to: '/support', label: 'All tickets' }, subtitle: html`<span class="flex flex-wrap items-center gap-2">${ticketChipA(t.status)}${priorityChip(t.priority)}${scopeChip(t)}<span class="text-muted">${t.number} · ${STATUS.category[t.category]}</span></span>` })}
      <div class="grid gap-4 lg:grid-cols-3">
        ${card({ cls: 'lg:col-span-2', title: 'Conversation', subtitle: `Raised ${dateTime(t.createdAt)}`, body: html`
          <ol class="space-y-3">${t.messages.map((m) => {
            const support = m.author === 'ADMIN'
            return html`<li class="rounded-lg border p-3 ${support ? 'border-brand/30 bg-brand/5' : 'border-line bg-surface-alt'}">
              <div class="flex flex-wrap items-baseline justify-between gap-2"><p class="text-sm font-semibold text-fg">${support ? `Support · ${m.authorName}` : m.authorName}</p><p class="text-xs text-muted">${dateTime(m.at)}</p></div>
              <p class="mt-2 whitespace-pre-wrap text-sm text-fg">${m.body}</p></li>`
          })}</ol>
          ${Store.ui.typing === t.id ? html`<p class="mt-3 text-sm text-muted">${store ? store.name : 'The reporter'} is typing…</p>` : ''}
          ${closed
            ? html`<p class="mt-4 rounded-md border border-line bg-surface-alt px-3 py-2 text-sm text-muted">This ticket is closed and takes no further replies.</p>`
            : html`<form class="mt-4 space-y-3" data-submit="sendReply" data-args="${args(t.id)}">
                <label class="block"><span class="${LABEL_A}">Reply</span>
                  <textarea name="body" data-model="drafts.reply" maxlength="4000" placeholder="They are notified in-app and on their devices as soon as you send this." class="${AREA_A}">${reply}</textarea></label>
                ${Store.ui.errors[`ticket:${t.id}`] ? html`<p class="text-sm text-danger">${Store.ui.errors[`ticket:${t.id}`]}</p>` : ''}
                <button type="submit" class="${abtn({ variant: 'primary' })}" ${busy ? 'disabled' : ''}>${busy ? spinner() : ''}${busy ? 'Sending…' : 'Send reply'}</button>
                <p class="text-xs text-muted">At least 10 characters.</p>
              </form>`}` })}
        <div class="space-y-4">
          ${card({ title: 'Triage', body: html`<div class="space-y-3">
            <label class="block"><span class="${LABEL_A}">Status</span><select class="${FIELD_A} appearance-none pr-8" data-change="setTicketStatus" data-args="${args(t.id)}" ${busy ? 'disabled' : ''}>
              ${Object.keys(STATUS.ticket).map((k) => html`<option value="${k}" ${t.status === k ? 'selected' : ''}>${STATUS.ticket[k].admin}</option>`)}</select></label>
            <label class="block"><span class="${LABEL_A}">Priority</span><select class="${FIELD_A} appearance-none pr-8" data-change="setTicketPriority" data-args="${args(t.id)}" ${busy ? 'disabled' : ''}>
              ${Object.keys(STATUS.priority).map((k) => html`<option value="${k}" ${t.priority === k ? 'selected' : ''}>${STATUS.priority[k].label}</option>`)}</select></label>
            <p class="text-xs text-muted">Status changes are saved immediately and the reporter is told. Priority is internal — they never see it.</p>
          </div>` })}
          ${card({ title: 'Raised by', body: html`<dl>
            ${detail('Account', t.messages[0].authorName)}
            ${detail('Store', store ? html`<a href="#/stores/${store.id}" class="text-accent hover:underline">${store.name}</a>` : html`<span class="text-muted">Written as a shopper</span>`)}
            ${detail('Reply-to email', t.contactEmail || '—')}
            ${detail('Phone', t.contactPhone || '—')}
            ${detail('Last activity', dateTime(t.lastMessageAt))}</dl>` })}
        </div>
      </div>`
  },
}

const StubPage = {
  render() {
    const item = NAV_ITEMS.find((i) => App.isOn(i.to, i.end)) || { label: 'Page' }
    return html`${pageHead({ title: item.label, subtitle: 'In the real console, not in the prototype yet' })}
      ${card({ body: UI.empty({ title: 'Not in the prototype', description: 'Add a page in admin/app.js and a route at the bottom of the file. The shell, data and sync are ready.', compact: false }) })}`
  },
}

// ===========================================================================
// Dialogs
// ===========================================================================

function adminDialog(d) {
  const db = S()
  if (d.kind === 'confirm') return UI.confirm(d)
  const store = d.storeId && Q.store(db, d.storeId)
  if (d.kind === 'suspend' && store) {
    const on = !store.suspendedAt
    return UI.modal({
      title: on ? 'Suspend this store?' : 'Lift the suspension?',
      subtitle: store.name,
      body: html`<form id="suspend-form" data-submit="suspend" data-args="${args(store.id)}" class="space-y-3">
        <p class="text-sm text-fg">${on ? 'The store is hidden from the marketplace and stops taking orders. The seller is told.' : 'The store shows on the marketplace again and can take orders.'}</p>
        ${on ? html`<label class="block"><span class="${LABEL_A}">Internal reason</span><textarea name="reason" required minlength="5" class="${AREA_A}" placeholder="Why — the seller sees this in their notification"></textarea></label>` : ''}
      </form>`,
      footer: html`<button type="button" class="${abtn()}" data-act="closeDialog">Cancel</button>
        <button type="submit" form="suspend-form" class="${abtn({ variant: on ? 'danger' : 'primary' })}">${on ? 'Suspend store' : 'Lift suspension'}</button>`,
    })
  }
  if (d.kind === 'verify' && store) {
    const on = !store.verifiedAt
    return UI.modal({
      title: on ? 'Mark this store verified?' : 'Remove verification?',
      subtitle: store.name,
      body: html`<form id="verify-form" data-submit="verify" data-args="${args(store.id)}" class="space-y-3">
        <p class="text-sm text-fg">${on ? 'Customers will see a Verified badge on the shop.' : 'The Verified badge is removed from the shop.'}</p>
        <label class="block"><span class="${LABEL_A}">Note for the seller (optional)</span><textarea name="note" class="${AREA_A}"></textarea></label>
      </form>`,
      footer: html`<button type="button" class="${abtn()}" data-act="closeDialog">Cancel</button>
        <button type="submit" form="verify-form" class="${abtn({ variant: on ? 'primary' : 'danger' })}">${on ? 'Mark verified' : 'Remove verification'}</button>`,
    })
  }
  if (DIALOGS[d.kind]) return DIALOGS[d.kind](d)
  return ''
}

// ===========================================================================
// Act
// ===========================================================================

Object.assign(Act, {
  openDrawer() {
    Store.ui.drawer = true
    Act.commit()
  },
  closeDrawer() {
    if (!Store.ui.drawer) return
    Store.ui.drawer = false
    Act.commit()
  },
  pageSearch(value) {
    Store.ui.pageQuery = value
    Act.commit()
  },
  pageSearchGo() {
    const term = (Store.ui.pageQuery || '').trim().toLowerCase()
    const hit = NAV_ITEMS.find((i) => i.label.toLowerCase().includes(term))
    Store.ui.pageQuery = ''
    Act.commit()
    if (hit) App.go(hit.to)
  },
  pageSearchClear() {
    Store.ui.pageQuery = ''
    Act.commit()
  },

  // ---- lists ----
  setDays(d) {
    Store.ui.days = d
    Act.commit()
  },
  setMeasure(m) {
    Store.ui.measure = m
    Act.commit()
  },
  ordersTab(status) {
    App.replace(status ? `/orders?status=${status}` : '/orders')
  },
  ordersQuery(v) {
    App.set('ordersQuery', v)
  },
  ordersStore(v) {
    App.set('ordersStore', v)
  },
  storesTab(v) {
    App.set('storesTab', v)
  },
  storesQuery(v) {
    App.set('storesQuery', v)
  },
  payoutStatus(v) {
    App.set('payoutStatus', v)
  },
  supportTab(v) {
    Store.ui.supportTab = v
    App.replace(`/support?status=${v}`)
  },
  supportQuery(v) {
    App.set('supportQuery', v)
  },
  // ---- stores ----
  askSuspend(storeId) {
    Store.ui.dialog = { kind: 'suspend', storeId }
    Act.commit()
  },
  suspend(values, storeId) {
    const on = !Q.store(S(), storeId).suspendedAt
    Store.ui.dialog = null
    return run(`store:${storeId}`, () => Store.change((db) => World.suspend(db, storeId, on, (values.reason || '').trim())), { ok: on ? 'Store suspended — the seller was told' : 'Suspension lifted' })
  },
  askVerify(storeId) {
    Store.ui.dialog = { kind: 'verify', storeId }
    Act.commit()
  },
  verify(values, storeId) {
    const on = !Q.store(S(), storeId).verifiedAt
    Store.ui.dialog = null
    return run(`store:${storeId}`, () => Store.change((db) => World.verify(db, storeId, on, (values.note || '').trim())), { ok: on ? 'Store marked verified' : 'Verification removed' })
  },

  // ---- payouts: admin → PaymentHub (simulated) → seller ----
  async payOut(orderId) {
    const payout = await run(`pay:${orderId}`, () => Store.change((db) => World.startPayout(db, orderId)), { ok: 'Payout sent to PaymentHub' })
    if (!payout) return
    const ok = !Store.ui.dev.payoutFails
    Store.ui.dev.payoutFails = false
    // PaymentHub answers a few seconds later.
    later(2500, () => {
      Store.change((db) => World.finishPayout(db, payout.id, ok))
      UI.toast(ok ? `${payout.number} paid` : `${payout.number} failed at the bank`, ok ? 'neutral' : 'danger')
    })
  },

  // ---- support ----
  async sendReply(values, ticketId) {
    const body = (values.body || '').trim()
    if (body.length < 10) {
      Store.ui.errors[`ticket:${ticketId}`] = 'Write at least 10 characters.'
      return Act.commit()
    }
    const done = await run(`ticket:${ticketId}`, () => Store.change((db) => (World.reply(db, ticketId, 'ADMIN', 'Anita', body), true)), { ok: 'Reply sent — the seller was told' })
    if (!done) return
    Store.ui.drafts.reply = ''
    Act.commit()
    maybeSellerAnswer(ticketId)
  },
  setTicketStatus(status, ticketId) {
    return run(`ticket:${ticketId}`, () => Store.change((db) => World.setTicket(db, ticketId, { status })), { ok: 'Status saved', ms: 300 })
  },
  setTicketPriority(priority, ticketId) {
    return run(`ticket:${ticketId}`, () => Store.change((db) => { Q.ticket(db, ticketId).priority = priority }), { ok: 'Priority saved', ms: 300 })
  },

  // ---- simulate (dev panel) ----
  simNewOrder() {
    Store.change((db) => World.newOrder(db))
    UI.toast('A customer ordered from Lakshmi Silk Sarees')
    Act.commit()
  },
  simSellerTicket() {
    Store.change((db) => World.createTicket(db, {
      subject: 'Customer says the parcel was damaged',
      category: 'ORDERS',
      body: 'A customer sent photos of a torn saree. The courier box was fine. What should I do — refund or replace?',
      email: 'priya@lakshmisilks.in',
      phone: '+91 98450 12345',
    }))
    UI.toast('Lakshmi Silk Sarees raised a ticket')
    Act.commit()
  },
  /** "Other side replies now": the seller answers the latest ticket from our shop. */
  simSellerReply() {
    const t = Q.tickets(S(), S().me.storeId).find((x) => x.status !== 'CLOSED')
    if (!t) return UI.toast('No open ticket from Lakshmi Silk Sarees')
    Store.change((db) => World.reply(db, t.id, 'SELLER', 'Priya Raman', 'Thanks! I have shared the details. Please check and confirm.'))
    Act.commit()
  },
  simPayoutFails() {
    Store.ui.dev.payoutFails = !Store.ui.dev.payoutFails
    UI.toast(Store.ui.dev.payoutFails ? 'The next payout will fail at the bank' : 'Payouts will succeed again')
    Act.commit()
  },
})

/** When the seller app is closed, play the seller: "typing…", then a thank-you. */
function maybeSellerAnswer(ticketId) {
  const t = Q.ticket(S(), ticketId)
  if (!Store.ui.dev.autoReply || Store.isOnline('seller') || !t || t.storeId !== S().me.storeId) return
  setTimeout(() => {
    Store.ui.typing = ticketId
    Act.commit()
  }, 1500)
  later(4500, () => {
    Store.ui.typing = null
    const fresh = Q.ticket(S(), ticketId)
    if (!fresh || fresh.status === 'CLOSED') return
    Store.change((db) => World.reply(db, ticketId, 'SELLER', 'Priya Raman', 'Thank you for the quick reply! I will check and let you know.'))
  })
}

// ===========================================================================
// Screens — App.reg(name, { path, title, render, skeleton, parent })
// ===========================================================================

const adminSkeleton = () => UI.skeleton(['h-5 w-1/3', 'h-4', 'h-4', 'h-4', 'h-4', 'h-4'])

App.reg('dashboard', { path: '/', title: 'Dashboard', ...DashboardPage, skeleton: adminSkeleton })
App.reg('orders', { path: '/orders', title: 'Orders', parent: 'dashboard', ...OrdersPage, skeleton: adminSkeleton })
App.reg('order', { path: '/orders/:id', title: 'Order', parent: 'orders', ...OrderPage, skeleton: adminSkeleton })
App.reg('stores', { path: '/stores', title: 'Stores & sellers', parent: 'dashboard', ...StoresPage, skeleton: adminSkeleton })
App.reg('store', { path: '/stores/:id', title: 'Store', parent: 'stores', ...StorePage, skeleton: adminSkeleton })
App.reg('payouts', { path: '/seller-payouts', title: 'Seller payouts', parent: 'dashboard', ...PayoutsPage, skeleton: adminSkeleton })
App.reg('support', { path: '/support', title: 'Support', parent: 'dashboard', ...SupportPage, skeleton: adminSkeleton })
App.reg('ticket', { path: '/support/:id', title: 'Ticket', parent: 'support', ...TicketPage, skeleton: adminSkeleton })
NAV_ITEMS.filter((i) => !['/', '/orders', '/stores', '/seller-payouts', '/support'].includes(i.to)).forEach((i) =>
  App.reg('stub' + i.to.replace(/W+/g, '_'), { path: i.to, title: i.label, parent: 'dashboard', ...StubPage }),
)

// "/" or Ctrl/⌘+K focuses the page search, as in the real console.
document.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)
  if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) {
    const box = document.getElementById('gsearch')
    if (box) {
      e.preventDefault()
      box.focus()
    }
  }
})

/** What js/app.js needs to start this app. */
const AppConfig = {
  home: 'dashboard',
  view: adminView,
  freshUi: () => ({
    days: 30, measure: 'revenue', drawer: false, pageQuery: '',
    ordersQuery: '', ordersStore: '', storesTab: '', storesQuery: '', payoutStatus: '', supportTab: 'OPEN', supportQuery: '',
    drafts: { reply: '' }, typing: null,
  }),
  replyNow: 'simSellerReply',
  simulate: [
    { act: 'simNewOrder', label: 'A customer places an order' },
    { act: 'simSellerTicket', label: 'Seller raises a ticket' },
    { act: 'simPayoutFails', label: 'Next payout fails at the bank (toggle)' },
  ],
  jumps: [
    ['dashboard', 'Dashboard'], ['orders', 'Orders'], ['order', 'An order', { id: 'ord_1051' }], ['stores', 'Stores'],
    ['store', 'Our store', { id: 'st_lakshmi' }], ['payouts', 'Payouts'], ['support', 'Support'], ['ticket', 'A ticket', { id: 'tk_2042' }],
  ],
}
