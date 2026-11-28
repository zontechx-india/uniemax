// Seller app — /mystores/{slug}/** of the real app, as plain JS screens.
//
// Same shell and class names as the React code:
//   AppLayout (top bar) → StoreManageLayout (sidebar + section) → a section page
//   StoreSectionNav (grouped, collapsible, icon rail) · StoreMobileNav (phone tab bar)
//
// Built: Dashboard, Orders, Order, Products, Business details, Earnings,
// Help from UnieMax (+ ticket). The other sections show a placeholder page.
// Screens are registered with App.reg() at the bottom of this file.

// ===========================================================================
// Components (shared/ui + stores/ui, as plain functions)
// ===========================================================================

const BADGE = {
  neutral: ['bg-surface-alt text-muted', 'bg-muted'],
  brand: ['bg-brand-soft text-brand', 'bg-brand'],
  success: ['bg-success/12 text-success', 'bg-success'],
  warning: ['bg-warning/12 text-warning', 'bg-warning'],
  pending: ['bg-pending-soft text-pending', 'bg-pending'],
  danger: ['bg-danger/12 text-danger', 'bg-danger'],
  info: ['bg-accent/10 text-accent', 'bg-accent'],
}
/** shared/ui/Badge.tsx (StatusPill = dot on). */
const badge = (tone, label, dot = true) => html`
  <span class="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-pill px-2.5 text-xs font-semibold whitespace-nowrap ${BADGE[tone][0]}">
    ${dot ? html`<span aria-hidden="true" class="h-1.5 w-1.5 shrink-0 rounded-full ${BADGE[tone][1]}"></span>` : ''}${label}
  </span>`

/** stores/ui/PageHeader.tsx */
const pageHeader = ({ ico, title, description, action }) => html`
  <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div class="flex min-w-0 items-start gap-2.5 sm:gap-3">
      ${ico ? html`<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand sm:h-10 sm:w-10">${Icon(ico, 'h-4 w-4 sm:h-5 sm:w-5')}</span>` : ''}
      <div class="min-w-0">
        <h2 class="font-heading text-lg font-semibold leading-tight text-fg sm:text-xl">${title}</h2>
        <p class="mt-0.5 text-hint leading-snug text-muted sm:mt-1 sm:text-sm sm:leading-relaxed">${description}</p>
      </div>
    </div>
    ${action ? html`<div class="flex shrink-0 [&>*]:w-full sm:[&>*]:w-auto">${action}</div>` : ''}
  </header>`

/** stores/ui/PanelCard.tsx */
const panel = ({ title, description, ico, aside, padded = true, cls = '', id, body }) => html`
  <section ${id ? raw(`id="${id}" tabindex="-1"`) : ''} class="ws-card rounded-lg outline-none ${cls}">
    ${title !== undefined || aside
      ? html`<header class="flex items-center gap-3 px-4 py-3 sm:px-5 ${body !== undefined ? 'border-b border-line' : ''}">
          ${ico ? html`<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">${Icon(ico, 'h-[18px] w-[18px]')}</span>` : ''}
          <div class="min-w-0 flex-1">
            ${title !== undefined ? html`<h3 class="font-heading text-base font-semibold leading-snug text-fg">${title}</h3>` : ''}
            ${description ? html`<p class="mt-0.5 text-sm leading-relaxed text-muted">${description}</p>` : ''}
          </div>
          ${aside ? html`<div class="shrink-0">${aside}</div>` : ''}
        </header>`
      : ''}
    ${body !== undefined ? html`<div class="${padded ? 'p-4 sm:p-5' : ''}">${body}</div>` : ''}
  </section>`

const AREA = FIELD.replace('h-field', 'min-h-24 py-3')

/** The "All orders" style back link — pops the stack (App.back). */
const backLink = (label) => html`
  <button type="button" data-back class="-ml-2 inline-flex min-h-tap items-center gap-1.5 rounded-xl px-2 text-base font-semibold text-muted transition hover:bg-fg/5 hover:text-fg">
    ${Icon('arrowLeft', 'h-5 w-5')}${label}
  </button>`

// ===========================================================================
// Order presentation (stores/orderMeta.tsx)
// ===========================================================================

const orderChip = (status) => badge(STATUS.order[status].tone, STATUS.order[status].label)

function paymentLabel(method, status) {
  if (status === 'REFUNDED') return 'Refunded'
  if (status === 'FAILED') return 'Payment failed'
  if (method === 'ONLINE') return status === 'PAID' ? 'Paid online' : 'Payment pending'
  return status === 'PAID' ? 'Cash received' : 'Cash on delivery'
}

const itemCount = (o) => o.items.reduce((sum, i) => sum + i.qty, 0)

const orderRow = (order) => html`
  <a href="#/orders/${order.id}" class="flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors hover:bg-fg/5 sm:px-5">
    <div class="min-w-0 flex-1">
      <div class="flex items-baseline justify-between gap-3">
        <p class="min-w-0 truncate text-base font-medium text-fg">${order.customer.name}</p>
        <span class="shrink-0 font-figure text-base font-semibold tabular-nums text-fg">${money(order.total)}</span>
      </div>
      <p class="mt-0.5 text-hint text-muted">${timeAgo(order.placedAt)} · ${plural(itemCount(order), 'item')} · ${order.number}</p>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        ${orderChip(order.status)}
        <span class="inline-flex h-6 items-center rounded-pill bg-fg/6 px-2.5 text-xs font-semibold text-muted">${paymentLabel(order.paymentMethod, order.paymentStatus)}</span>
        ${order.source === 'BILL' ? html`<span class="inline-flex h-6 items-center gap-1 rounded-pill bg-fg/6 px-2.5 text-xs font-semibold text-muted">${Icon('receipt', 'h-3.5 w-3.5')}From a bill</span>` : ''}
      </div>
    </div>
    ${Icon('chevronRight', 'h-5 w-5 shrink-0 text-muted')}
  </a>`

/** Dashboard numbers, worked out from the orders (the API's /dashboard). */
function dashStats(db) {
  const orders = Q.orders(db, db.me.storeId)
  const today = new Date().toDateString()
  const by = (s) => orders.filter((o) => o.status === s).length
  return {
    totalOrders: orders.length,
    today: orders.filter((o) => new Date(o.placedAt).toDateString() === today).length,
    pending: by('PENDING'),
    processing: by('CONFIRMED') + by('PACKED'),
    shipped: by('SHIPPED'),
    completed: by('DELIVERED'),
    cancelled: by('CANCELLED'),
    refunded: orders.filter((o) => o.paymentStatus === 'REFUNDED').length,
    revenue: orders.filter((o) => o.status !== 'CANCELLED').reduce((sum, o) => sum + o.total, 0),
  }
}

/** Live / Not live / Paused — suspension outranks publishing. */
function liveState(store) {
  if (store.suspendedAt) return { tone: 'danger', label: 'Paused by UnieMax', text: 'text-danger', dot: 'bg-danger' }
  return store.isPublished
    ? { tone: 'success', label: 'Live', text: 'text-success', dot: 'bg-success' }
    : { tone: 'pending', label: 'Not live yet', text: 'text-pending', dot: 'bg-pending' }
}

// ===========================================================================
// Section nav (StoreSectionNav.tsx)
// ===========================================================================

const SECTION_GROUPS = [
  { key: 'overview', caption: 'Overview', items: [
    { label: 'Dashboard', to: '/', ico: 'chart', end: true },
    { label: 'Orders', to: '/orders', ico: 'cart', badge: true },
    { label: 'Bills', to: '/bills', ico: 'receipt' }, // new — js/screens/seller-bills.js
  ] },
  { key: 'catalog', caption: 'Catalog', items: [
    { label: 'Categories', to: '/categories', ico: 'tag' },
    { label: 'Products', to: '/products', ico: 'box' },
  ] },
  { key: 'storefront', caption: 'Storefront', items: [
    { label: 'Shop name & logo', to: '/details', ico: 'store' },
    { label: 'Business details', to: '/business', ico: 'shieldCheck' },
    { label: 'Design your shop', to: '/builder', ico: 'palette' },
  ] },
  { key: 'settings', caption: 'Payments & delivery', items: [
    { label: 'Earnings', to: '/earnings', ico: 'rupee' },
    { label: 'Payments', to: '/payments', ico: 'card' },
    { label: 'Bank account', to: '/bank-accounts', ico: 'bank' },
    { label: 'Delivery', to: '/shipping', ico: 'truck' },
    { label: 'Checkout', to: '/checkout', ico: 'clipboard' },
  ] },
  { key: 'marketing', caption: 'Marketing', items: [{ label: 'Affiliate marketing', to: '/affiliate', ico: 'megaphone' }] },
  { key: 'help', caption: 'Help', items: [
    { label: 'Customer messages', to: '/customer-support', ico: 'chat' },
    { label: 'Help from UnieMax', to: '/support', ico: 'lifebuoy' },
  ] },
]
const ALL_SECTIONS = SECTION_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g })))

function activeSection() {
  const path = App.current.path
  let best = ALL_SECTIONS[0]
  for (const item of ALL_SECTIONS) {
    if (item.to === '/') continue
    if ((path === item.to || path.startsWith(item.to + '/')) && item.to.length > (best.to === '/' ? 0 : best.to.length)) best = item
  }
  return path === '/' ? ALL_SECTIONS[0] : best
}

const orderBadge = (count, cls = '') => html`
  <span aria-label="${count} pending" class="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-pill bg-brand px-1.5 text-xs font-semibold tabular-nums text-brand-contrast ${cls}">${count > 99 ? '99+' : count}</span>`

function sectionRow(item, pending, large = false) {
  const on = activeSection().to === item.to
  return html`
    <a href="#${item.to}" ${on ? raw('aria-current="page"') : ''} data-act="closeMore"
      class="group/row flex items-center gap-3 rounded-md transition-colors ${large ? 'min-h-[52px] px-2.5 text-base' : 'min-h-10 px-3 text-sm'} ${on ? 'bg-brand-soft font-semibold text-brand' : 'font-medium text-fg/80 hover:bg-surface-alt hover:text-fg'}">
      ${large
        ? html`<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-brand text-brand-contrast' : 'bg-fg/5'}">${Icon(item.ico, 'h-[18px] w-[18px]')}</span>`
        : Icon(item.ico, `h-[18px] w-[18px] shrink-0 ${on ? 'text-brand' : 'text-muted'}`)}
      <span class="min-w-0 flex-1 truncate">${item.label}</span>
      ${item.badge && pending > 0 ? orderBadge(pending) : ''}
    </a>`
}

function sectionNav(pending) {
  const ui = Store.ui
  const activeKey = activeSection().group.key
  if (ui.rail) {
    return html`<nav aria-label="Store sections"><div class="flex flex-col items-center gap-1 p-2">
      ${SECTION_GROUPS.map((group, index) => html`
        <div class="flex w-full flex-col items-center gap-1 ${index > 0 ? 'mt-1 border-t border-line/70 pt-2' : ''}">
          ${group.items.map((item) => {
            const on = activeSection().to === item.to
            return html`<a href="#${item.to}" title="${group.caption} · ${item.label}" class="relative flex h-11 w-11 items-center justify-center rounded-md transition-colors ${on ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-fg/5 hover:text-fg'}">
              ${Icon(item.ico, 'h-[18px] w-[18px]')}<span class="sr-only">${item.label}</span>
              ${item.badge && pending > 0 ? orderBadge(pending, 'absolute -top-1 -right-1') : ''}
            </a>`
          })}
        </div>`)}
    </div></nav>`
  }
  return html`<nav aria-label="Store sections"><div class="p-2">
    ${SECTION_GROUPS.map((group) => {
      const open = !ui.collapsed.includes(group.key)
      const hidden = group.items.some((i) => i.badge) ? pending : 0
      return html`<div class="border-t border-line/70 first:border-t-0">
        <button type="button" data-act="toggleGroup" data-args="${args(group.key)}" aria-expanded="${open}"
          class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-surface-alt ${group.key === activeKey && !open ? 'text-brand' : 'text-fg'}">
          ${Icon('chevronDown', `h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-200 ${open ? '' : '-rotate-90'}`)}
          <span class="min-w-0 flex-1 truncate text-xs font-semibold">${group.caption}</span>
          ${!open ? html`${hidden > 0 ? orderBadge(hidden) : ''}<span class="shrink-0 text-xs font-medium text-muted" aria-hidden="true">${group.items.length}</span>` : ''}
        </button>
        ${open ? html`<div class="pb-1.5">${group.items.map((item) => sectionRow(item, pending))}</div>` : ''}
      </div>`
    })}
  </div></nav>`
}

/** The sidebar's Publish & share card (StorePublishCard, simplified). */
function publishCard(store) {
  const live = liveState(store)
  const url = `uniemax.com/store/${store.slug}`
  return html`<div class="border-t border-line p-4"><div class="space-y-3">
    <div class="flex items-center gap-2">
      ${badge(live.tone, live.label)}
      <p class="min-w-0 text-hint text-muted">${store.suspendedAt ? 'Hidden' : 'Customers can see it'}</p>
    </div>
    ${store.suspendedAt
      ? html`<div class="rounded-xl bg-danger/10 px-3 py-2.5">
          <p class="text-sm font-semibold text-fg">UnieMax paused your shop</p>
          <p class="mt-1 text-hint text-muted">${store.suspendedReason || 'Ask UnieMax support to know why.'}</p>
          <a href="#/support" class="${btn({ variant: 'secondary', size: 'sm', full: true, cls: 'mt-2.5' })}">Ask UnieMax</a>
        </div>`
      : html`<a href="#" data-act="fakeShare" class="flex h-field w-full items-center justify-center gap-2 rounded-md bg-whatsapp px-3 text-base whitespace-nowrap font-semibold text-whatsapp-contrast transition-[filter] duration-150 hover:brightness-95">
          ${Icon('chat', 'h-5 w-5')}Share on WhatsApp
        </a>`}
    <span class="ws-well flex min-h-tap items-center gap-2 rounded-md px-3 text-hint text-muted">${Icon('store', 'h-4 w-4 shrink-0')}<span class="truncate">${url}</span></span>
  </div></div>`
}

// ===========================================================================
// Shell (AppLayout + StoreManageLayout + StoreMobileNav)
// ===========================================================================

function topBar(db) {
  const owner = Q.owner(db, Q.myStore(db))
  const unread = Q.unread(db, 'seller')
  const ui = Store.ui
  const notes = db.notifications.filter((n) => n.to === 'seller').slice(0, 8)
  return html`
  <header class="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6 lg:px-8">
    <a href="#/" aria-label="UnieMax home" class="flex shrink-0 items-center"><span role="img" aria-label="UnieMax" class="logo-lockup block h-8 shrink-0"></span></a>
    <div class="ml-auto flex shrink-0 items-center gap-2">
      <div class="relative" data-popover="bell">
        <button type="button" data-act="togglePopover" data-args='["bell"]' aria-label="Notifications" class="relative flex size-tap items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-alt hover:text-fg">
          ${Icon('bell', 'h-5 w-5')}
          ${unread > 0 ? html`<span class="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-danger px-1 text-xs font-semibold text-white">${unread}</span>` : ''}
        </button>
        ${ui.popover === "bell" ? html`
          <div class="absolute right-0 z-30 mt-2 w-[min(21rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-line bg-surface shadow-floating">
            <div class="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span class="text-sm font-medium text-fg">Notifications</span>
              ${unread > 0 ? html`<button type="button" data-act="readAll" class="text-xs font-medium text-brand hover:underline">Mark all read</button>` : ''}
            </div>
            ${notes.length === 0
              ? html`<p class="px-4 py-8 text-center text-sm text-muted">No notifications yet.</p>`
              : html`<ul class="max-h-96 divide-y divide-line overflow-y-auto">${notes.map((n) => html`
                  <li><button type="button" data-act="openNote" data-args="${args(n.id)}" class="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-alt">
                    <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-brand'}"></span>
                    <span class="min-w-0 flex-1">
                      <span class="block text-sm font-medium text-fg">${n.title}</span>
                      <span class="block truncate text-xs text-muted">${n.body}</span>
                      <span class="mt-0.5 block text-xs text-muted">${timeAgo(n.at)}</span>
                    </span>
                  </button></li>`)}</ul>`}
          </div>` : ''}
      </div>
      <button type="button" data-act="toggleTheme" aria-label="${Theme.mode === 'dark' ? 'Light theme' : 'Dark theme'}" class="inline-flex size-tap items-center justify-center rounded-xl border border-line text-muted transition-colors hover:text-fg hover:border-fg/30">
        ${Icon(Theme.mode === 'dark' ? 'sun' : 'moon', 'h-[18px] w-[18px]')}
      </button>
      <div class="relative" data-popover="account">
        <button type="button" data-act="togglePopover" data-args='["account"]' class="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-surface-alt sm:pl-3">
          <span class="hidden max-w-36 truncate whitespace-nowrap text-sm font-medium text-fg sm:block">${owner.name}</span>
          <span class="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">${initials(owner.name)}</span>
          ${Icon('chevronDown', `hidden h-3.5 w-3.5 text-muted transition-transform sm:block ${ui.popover === 'account' ? 'rotate-180' : ''}`)}
        </button>
        ${ui.popover === 'account' ? html`<div class="absolute right-0 top-full z-30 pt-2">
          <div class="w-64 overflow-hidden rounded-lg border border-line bg-surface py-2 shadow-floating">
            <div class="flex items-center gap-3 px-4 pb-3 pt-2">
              <span class="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">${initials(owner.name)}</span>
              <div class="min-w-0"><p class="truncate text-sm font-semibold text-fg">${owner.name}</p><p class="truncate text-xs text-muted">${owner.email}</p></div>
            </div>
            <button type="button" data-act="signOut" class="flex w-full items-center gap-3 border-t border-line px-4 py-2.5 text-left text-sm text-fg transition-colors hover:bg-surface-alt">${Icon('logout', 'h-4 w-4 text-muted')}Sign out</button>
          </div></div>` : ''}
      </div>
    </div>
  </header>`
}

function mobileNav(pending) {
  const tabs = [
    { to: '/', label: 'Home', ico: 'chart' },
    { to: '/orders', label: 'Orders', ico: 'cart' },
    { to: '/products', label: 'Products', ico: 'box' },
    { to: '/builder', label: 'Design', ico: 'palette' },
  ]
  const active = activeSection().to
  const onMore = !tabs.some((t) => t.to === active)
  return html`
  <nav aria-label="Store sections" class="pointer-events-none fixed inset-x-0 bottom-0 z-30 bg-bg/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden">
    <div class="ws-dock pointer-events-auto mx-auto grid max-w-md grid-cols-5 gap-1 rounded-sheet p-1.5">
      ${tabs.map((t) => {
        const on = active === t.to
        return html`<a href="#${t.to}" ${on ? raw('aria-current="page"') : ''} class="flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-semibold transition-colors ${on ? 'text-brand' : 'text-muted hover:text-fg'}">
          <span class="relative flex h-7 w-12 items-center justify-center rounded-pill transition-colors ${on ? 'bg-brand-soft' : ''}">
            ${Icon(t.ico, 'h-[22px] w-[22px]')}
            ${t.to === '/orders' && pending > 0 ? orderBadge(pending, 'absolute -top-1.5 right-0') : ''}
          </span>${t.label}
        </a>`
      })}
      <button type="button" data-act="openMore" class="flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-semibold transition-colors ${onMore ? 'text-brand' : 'text-muted hover:text-fg'}">
        <span class="flex h-7 w-12 items-center justify-center rounded-pill ${onMore ? 'bg-brand-soft' : ''}">${Icon('dots', 'h-[22px] w-[22px]')}</span>More
      </button>
    </div>
  </nav>`
}

function moreSheet(store, pending) {
  return UI.modal({
    title: 'All sections',
    subtitle: store.name,
    body: html`<div class="-mx-4 -mt-4 space-y-3 px-3 py-3 sm:-mx-5">
      ${SECTION_GROUPS.map((group) => html`<section>
        <h3 class="px-2.5 pb-1 text-xs font-semibold text-muted">${group.caption}</h3>
        <div class="space-y-0.5">${group.items.map((item) => sectionRow(item, pending, true))}</div>
      </section>`)}
    </div>`,
  })
}

function sellerView() {
  const db = S()
  const ui = Store.ui
  const store = Q.myStore(db)
  const pending = dashStats(db).pending
  const live = liveState(store)
  const screen = App.screens[App.current.name]
  const onHome = App.current.path === '/'
  if (App.current.name === 'login') return html`${App.body()}${ui.dialog ? renderDialog(ui.dialog, store, pending) : ''}`

  return html`
  <div class="min-h-screen bg-bg">
    ${topBar(db)}
    <main class="px-3 py-4 sm:px-5 lg:px-8">
      <div class="mx-auto w-full max-w-[1920px]">
        <div class="mx-auto max-w-7xl space-y-3 pb-[var(--seller-dock)] [--seller-dock:calc(84px+env(safe-area-inset-bottom))] lg:pb-0 lg:[--seller-dock:0px]">
          <a href="#/" data-act="allStores" class="hidden min-h-tap items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-fg lg:inline-flex">
            ${Icon('arrowLeft', 'h-4 w-4')}All stores
          </a>

          <div class="ws-card flex items-center gap-2 rounded-lg p-1 pr-2 lg:hidden">
            <button type="button" ${onHome ? raw('data-act="allStores"') : raw('data-back')} aria-label="${onHome ? 'All stores' : 'Back'}" class="flex size-tap shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-fg/5 hover:text-fg">
              ${Icon('arrowLeft', 'h-5 w-5')}
            </button>
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">${Icon('store', 'h-4 w-4')}</span>
            <div class="min-w-0 flex-1">
              <p class="truncate font-heading text-sm font-semibold leading-tight text-fg">${store.name}</p>
              <span class="inline-flex items-center gap-1.5 text-xs font-medium ${live.text}"><span aria-hidden="true" class="h-1.5 w-1.5 rounded-full ${live.dot}"></span>${live.label}</span>
            </div>
            <button type="button" data-act="fakeShare" class="${btn({ variant: store.isPublished ? 'secondary' : 'primary', size: 'sm', cls: 'px-3' })}">${Icon('share', 'h-4 w-4')}Share</button>
          </div>

          <div class="items-start gap-3 space-y-3 lg:grid lg:space-y-0 ${ui.rail ? 'lg:grid-cols-[64px_1fr]' : 'lg:grid-cols-[264px_1fr]'}">
            <aside class="ws-card hidden min-w-0 rounded-lg lg:sticky lg:top-[4.5rem] lg:block">
              <div class="max-h-[calc(100dvh-5.5rem)] overflow-y-auto">
                <div class="flex items-center gap-3 border-b border-line p-4 ${ui.rail ? 'lg:flex-col lg:gap-2 lg:p-2' : ''}">
                  <div title="${ui.rail ? store.name : ''}" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand ${ui.rail ? 'lg:h-10 lg:w-10' : ''}">${Icon('store', 'h-5 w-5')}</div>
                  <div class="min-w-0 flex-1 ${ui.rail ? 'lg:hidden' : ''}">
                    <p class="text-xs text-muted">Managing</p>
                    <h1 class="truncate font-body text-sm font-semibold tracking-normal text-fg">${store.name}</h1>
                  </div>
                  <button type="button" data-act="toggleRail" aria-pressed="${ui.rail}" title="${ui.rail ? 'Expand sections' : 'Minimise sections'}" class="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-alt hover:text-fg lg:inline-flex">
                    ${Icon('panelLeft', 'h-4 w-4')}<span class="sr-only">${ui.rail ? 'Expand sections' : 'Minimise sections'}</span>
                  </button>
                </div>
                ${sectionNav(pending)}
                ${ui.rail
                  ? html`<div class="hidden justify-center border-t border-line py-3 lg:flex" title="${live.label}"><span class="h-2.5 w-2.5 rounded-full ${live.dot}"></span></div>`
                  : publishCard(store)}
              </div>
            </aside>

            <section class="min-h-[400px] min-w-0">${App.body()}</section>
          </div>
        </div>
      </div>
    </main>
    ${screen.tab ? mobileNav(pending) : ''}
    ${ui.dialog ? renderDialog(ui.dialog, store, pending) : ''}
  </div>`
}

// ===========================================================================
// Screens
// ===========================================================================

const PIPELINE = [
  ['pending', 'Waiting', '/orders?status=PENDING', 'bg-pending'],
  ['processing', 'Getting ready', '/orders', 'bg-accent'],
  ['shipped', 'Sent', '/orders?status=SHIPPED', 'bg-brand'],
  ['completed', 'Delivered', '/orders?status=DELIVERED', 'bg-success'],
  ['cancelled', 'Cancelled', '/orders?status=CANCELLED', 'bg-muted'],
  ['refunded', 'Refunded', null, 'bg-muted'],
]

const DashboardScreen = {
  render() {
    const db = S()
    const store = Q.myStore(db)
    const s = dashStats(db)
    const hasOrders = s.totalOrders > 0
    const recent = Q.orders(db, store.id).slice(0, 5)

    const heroStat = (label, value, { small = false, dot, cls = '' } = {}) => html`
      <div class="min-w-0 ${cls} rounded-md border border-line bg-surface px-3 py-3">
        <dt class="flex items-center gap-1.5 text-xs font-medium text-muted">${dot ? html`<span aria-hidden="true" class="h-1.5 w-1.5 rounded-full ${dot}"></span>` : ''}${label}</dt>
        <dd class="mt-1 font-figure leading-tight font-semibold tabular-nums text-fg ${small ? 'break-words text-xl' : 'truncate text-2xl'}">${value}</dd>
      </div>`

    let next
    if (store.suspendedAt) {
      next = { ico: 'alert', title: 'Your shop is paused', detail: store.suspendedReason || 'UnieMax paused your shop. Customers cannot see it or order.', action: html`<a href="#/support" class="${btn({ size: 'lg', full: true })}">Ask UnieMax why${Icon('arrowRight', 'h-4 w-4')}</a>` }
    } else if (s.pending > 0) {
      next = { ico: 'cart', title: `${s.pending} order${s.pending === 1 ? ' is' : 's are'} waiting`, detail: 'Confirm them so your customers know their order is coming', action: html`<a href="#/orders?status=PENDING" class="${btn({ size: 'lg', full: true })}">See waiting orders${Icon('arrowRight', 'h-4 w-4')}</a>` }
    } else {
      const first = !hasOrders
      next = {
        ico: first ? 'share' : 'check',
        title: first ? 'Get your first order' : 'All caught up',
        detail: first ? 'Send your shop link to your customers on WhatsApp' : 'No orders are waiting — share your shop to get more',
        action: html`<a href="#" data-act="fakeShare" class="flex h-field w-full items-center justify-center gap-2 rounded-md bg-whatsapp px-6 text-base font-semibold text-whatsapp-contrast transition-[filter] duration-150 hover:brightness-95">${Icon('chat', 'h-5 w-5')}Share on WhatsApp</a>`,
      }
    }

    return html`<div class="space-y-5">
      <section class="ws-tint rounded-lg p-4 sm:p-6">
        <p class="text-sm text-muted">${todayLabel()}</p>
        <h2 class="mt-1 flex flex-wrap items-center gap-2 font-heading text-2xl leading-tight font-semibold break-words text-fg">
          ${store.name}${store.verifiedAt ? badge('success', 'Verified') : ''}
        </h2>
        ${store.isPublished && hasOrders ? html`<dl class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          ${heroStat('Today', s.today)}
          ${heroStat('Waiting', s.pending, { dot: s.pending > 0 ? 'bg-pending' : '' })}
          ${heroStat('Total sales', money(s.revenue), { small: true, cls: 'col-span-2 sm:col-span-1' })}
        </dl>` : ''}
        <div class="mt-4 rounded-md border border-line bg-surface p-4">
          <div class="flex items-start gap-3">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${store.suspendedAt ? 'bg-danger/10 text-danger' : 'bg-brand-soft text-brand'}">${Icon(next.ico, 'h-5 w-5')}</span>
            <div class="min-w-0">
              <p class="text-xs font-medium ${store.suspendedAt ? 'text-danger' : 'text-brand'}">Next step</p>
              <p class="text-base leading-snug font-semibold text-fg">${next.title}</p>
              <p class="mt-1 text-hint text-muted">${next.detail}</p>
            </div>
          </div>
          <div class="mt-3">${next.action}</div>
        </div>
      </section>

      ${hasOrders ? html`
        <section>
          <h3 class="mb-3 text-base font-semibold text-fg">Your orders</h3>
          <div class="-mx-4 [mask-image:linear-gradient(to_right,#000_85%,transparent)] sm:mx-0 sm:[mask-image:none]">
            <div class="flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-6">
              ${PIPELINE.map(([key, label, to, dot]) => {
                const body = html`<span class="flex items-center gap-1.5 text-hint font-medium text-muted"><span aria-hidden="true" class="h-2 w-2 rounded-full ${dot}"></span>${label}</span>
                  <span class="mt-2 block font-figure text-3xl leading-none font-semibold tabular-nums text-fg">${s[key]}</span>`
                const chip = 'ws-card block min-w-[124px] shrink-0 snap-start rounded-xl px-4 py-3 sm:min-w-0'
                return to ? html`<a href="#${to}" class="${chip} transition-colors hover:border-brand/40">${body}</a>` : html`<div class="${chip}">${body}</div>`
              })}
            </div>
          </div>
        </section>
        <section>
          <div class="mb-3 flex items-center justify-between gap-3">
            <h3 class="text-base font-semibold text-fg">Latest orders</h3>
            <a href="#/orders" class="inline-flex min-h-tap items-center gap-1 rounded-md px-2 text-sm font-medium text-brand transition-colors hover:bg-brand-soft">See all${Icon('arrowRight', 'h-4 w-4')}</a>
          </div>
          <ul class="ws-card divide-y divide-line overflow-hidden rounded-lg">${recent.map((o) => html`<li>${orderRow(o)}</li>`)}</ul>
        </section>`
      : html`<div class="ws-card rounded-lg">${UI.empty({ ico: 'cart', title: 'No orders yet', description: 'When a customer orders, it shows up here straight away' })}</div>`}
    </div>`
  },
}

const ORDER_TABS = ['ALL', 'PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED']

const OrdersScreen = {
  render(params, query) {
    const db = S()
    const status = ORDER_TABS.includes(query.status) ? query.status : 'ALL'
    const q = (Store.ui.ordersQuery || '').trim().toLowerCase()
    const all = Q.orders(db, db.me.storeId)
    const s = dashStats(db)
    const counts = { ALL: s.totalOrders, PENDING: s.pending, SHIPPED: s.shipped, DELIVERED: s.completed, CANCELLED: s.cancelled }
    const rows = all.filter(
      (o) =>
        (status === 'ALL' || o.status === status) &&
        (!q || o.customer.name.toLowerCase().includes(q) || o.number.toLowerCase().includes(q) || (o.customer.phone || '').replace(/\s/g, '').includes(q.replace(/\s/g, ''))),
    )
    const filtered = q !== '' || status !== 'ALL'

    return html`<div class="space-y-4">
      ${pageHeader({ ico: 'cart', title: 'Orders', description: 'New orders show here. Open one to confirm it, then mark it packed and sent.', action: html`<a href="#/bills/new" class="${btn({ size: 'lg' })}">${Icon('receipt', 'h-5 w-5')}Create a bill</a>` })}
      <div class="-mx-4 [mask-image:linear-gradient(to_right,#000_88%,transparent)] sm:mx-0 sm:[mask-image:none]">
        <div role="group" aria-label="Show orders" class="flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:flex-wrap sm:px-0">
          ${ORDER_TABS.map((key) => {
            const on = status === key
            const n = counts[key]
            return html`<a href="#/orders${key === 'ALL' ? '' : '?status=' + key}" aria-pressed="${on}" class="inline-flex min-h-tap shrink-0 items-center gap-1.5 rounded-pill border px-4 text-sm font-semibold transition ${on ? 'border-brand bg-brand text-brand-contrast' : 'border-line bg-surface/70 text-fg hover:border-brand/50'}">
              ${key === 'ALL' ? 'All' : STATUS.order[key].label}
              ${n ? html`<span class="rounded-pill px-1.5 text-xs font-bold ${on ? 'bg-brand-contrast/20' : key === 'PENDING' ? 'bg-pending text-brand-contrast' : 'bg-fg/8 text-muted'}">${n}</span>` : ''}
            </a>`
          })}
        </div>
      </div>
      <label class="relative block">
        <span class="sr-only">Search orders</span>
        ${Icon('search', 'pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-muted')}
        <input id="orders-search" type="search" value="${Store.ui.ordersQuery || ''}" data-search="ordersQuery" placeholder="Search by name, phone or order number"
          class="h-field w-full rounded-xl border border-line bg-input pr-4 pl-11 text-base text-fg outline-none placeholder:text-muted focus:border-accent" />
      </label>
      ${rows.length === 0
        ? html`<div class="ws-card rounded-lg">${UI.empty({ ico: 'cart', title: filtered ? 'No orders here' : 'No orders yet', description: filtered ? 'Try another status, or search for a different name or number.' : 'Share your shop link. Orders show up here the moment customers place them.' })}</div>`
        : html`<ul class="ws-card divide-y divide-line overflow-hidden rounded-lg">${rows.map((o) => html`<li>${orderRow(o)}</li>`)}</ul>`}
    </div>`
  },
}

const OrderScreen = {
  render({ id }) {
    const db = S()
    const order = Q.order(db, id)
    if (!order || order.storeId !== db.me.storeId) {
      return html`<div class="space-y-4">${backLink('All orders')}<div class="ws-card rounded-lg">${UI.empty({ ico: 'cart', title: 'Order not found', description: 'It may have been removed. Go back to your orders.' })}</div></div>`
    }
    const step = World.NEXT[order.status]
    const busy = Store.ui.busy[`order:${order.id}`]
    const canCancel = ['PENDING', 'CONFIRMED', 'PACKED'].includes(order.status)
    const payout = Q.payoutFor(db, order.id)
    const share = sellerShare(order, db.fees)
    const line = (label, value) => html`<div class="flex justify-between gap-3"><dt class="text-muted">${label}</dt><dd class="text-fg">${value}</dd></div>`
    const tl = (label, at, last = false, cancelled = false) => html`
      <li class="relative flex gap-3 ${last ? '' : 'pb-4'}">
        ${last ? '' : html`<span aria-hidden="true" class="absolute top-5 left-[9px] h-[calc(100%-12px)] w-px ${at ? 'bg-brand/40' : 'bg-line'}"></span>`}
        <span class="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${at ? (cancelled ? 'bg-danger text-white' : 'bg-brand text-brand-contrast') : 'border-2 border-line bg-surface'}">${at ? Icon(cancelled ? 'x' : 'check', 'h-3 w-3') : ''}</span>
        <div class="min-w-0"><p class="text-base font-medium ${at ? 'text-fg' : 'text-muted'}">${label}</p>${at ? html`<p class="text-hint text-muted">${dateTime(at)}</p>` : ''}</div>
      </li>`

    return html`<div class="space-y-4">
      ${backLink('All orders')}
      <section class="ws-tint rounded-lg p-4 sm:p-5">
        <div class="flex flex-wrap items-center gap-2">${orderChip(order.status)}<span class="text-hint text-muted">${timeAgo(order.placedAt)} · ${dateTime(order.placedAt)}</span></div>
        <h2 class="mt-2 font-figure text-3xl leading-tight font-bold text-fg">${money(order.total)}</h2>
        <p class="mt-0.5 text-base text-fg">${plural(order.items.length, 'item')} · <span class="font-semibold">${paymentLabel(order.paymentMethod, order.paymentStatus)}</span></p>
        <p class="mt-0.5 text-hint text-muted">Order ${order.number}${order.billId ? html` · <a href="#/bills/${order.billId}" class="font-semibold text-brand hover:underline">made from a bill</a>` : ''}</p>
      </section>
      ${UI.errorNote(Store.ui.errors[`order:${order.id}`])}
      ${order.status === 'CANCELLED' ? UI.infoNote(`This order was cancelled on ${dateTime(order.cancelledAt)}${order.cancelReason ? ` — “${order.cancelReason}”` : ''}. Its items were put back in stock.`) : ''}

      <div class="items-start gap-4 space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:space-y-0">
        <div class="space-y-4">
          ${panel({ ico: 'user', title: order.customer.name, body: html`<div class="space-y-3">
            <p class="text-base text-fg">${order.customer.phone}${order.customer.email ? html`<span class="block text-hint text-muted">${order.customer.email}</span>` : ''}</p>
            <div class="grid grid-cols-2 gap-2">
              <a href="tel:${order.customer.phone}" class="${btn({ variant: 'secondary', size: 'lg', full: true })}">${Icon('phone', 'h-5 w-5')}Call</a>
              <a href="#" data-act="fakeShare" class="flex h-field w-full items-center justify-center gap-2 rounded-md bg-whatsapp text-base font-bold text-whatsapp-contrast transition hover:opacity-90">${Icon('chat', 'h-5 w-5')}WhatsApp</a>
            </div>
            <div class="border-t border-line pt-3">
              <p class="flex items-center gap-2 text-sm font-semibold text-fg">${Icon('mapPin', 'h-4 w-4 text-muted')}${order.fulfilment === 'IN_SHOP' ? 'Handed over' : 'Send to'}</p>
              <p class="mt-1 text-base leading-relaxed text-fg">${order.fulfilment === 'IN_SHOP' ? 'They took it from your shop.' : order.customer.address}</p>
            </div>
          </div>` })}

          ${order.shippedAt ? panel({ ico: 'truck', title: 'Parcel', body: html`<dl class="space-y-1.5 text-base">${line('Courier', order.courier)}${line('Tracking number', order.tracking || 'Not added')}</dl>` }) : ''}

          ${panel({ ico: 'box', title: `What they ordered (${order.items.length})`, padded: false, body: html`
            <ul class="divide-y divide-line px-4 sm:px-5">${order.items.map((item) => html`
              <li class="flex items-center gap-3 py-3">
                <div class="h-14 w-14 shrink-0 rounded-xl border border-line" style="background:${item.tone}"></div>
                <div class="min-w-0 flex-1">
                  <p class="text-base leading-snug font-semibold break-words text-fg">${item.name}</p>
                  <p class="mt-0.5 text-hint text-muted">${item.variantName ? html`<span class="font-medium text-fg">${item.variantName}</span> · ` : ''}<span class="font-semibold text-fg">${item.qty}</span> × ${money(item.price)}</p>
                </div>
                <span class="shrink-0 text-base font-bold text-fg">${money(item.qty * item.price)}</span>
              </li>`)}</ul>
            <dl class="space-y-1.5 border-t border-line px-4 py-3 text-base sm:px-5">
              ${line('Items', money(order.subtotal))}
              ${line('Delivery', order.fulfilment === 'IN_SHOP' ? 'None — in the shop' : order.shipping === 0 ? 'Free' : money(order.shipping))}
              ${order.discount ? line('Discount', '− ' + money(order.discount)) : ''}
              <div class="flex justify-between border-t border-line pt-2"><dt class="font-bold text-fg">Total</dt><dd class="font-bold text-fg">${money(order.total)}</dd></div>
            </dl>` })}

          ${order.paymentMethod === 'ONLINE' && order.status !== 'CANCELLED' ? panel({ ico: 'rupee', title: 'Your money for this order', body: html`
            <dl class="space-y-1.5 text-base">
              ${line('Order total', moneyExact(order.total))}
              ${line(`UnieMax fee (${db.fees.platformPct}%)`, '− ' + moneyExact(share.platform))}
              ${line(`Payment fee (${db.fees.gatewayPct}%)`, '− ' + moneyExact(share.gateway))}
              <div class="flex justify-between border-t border-line pt-2"><dt class="font-bold text-fg">You get</dt><dd class="font-bold text-fg">${moneyExact(share.net)}</dd></div>
            </dl>
            <p class="mt-3 text-hint text-muted">${payout ? html`Payout ${payout.number}: <span class="font-semibold text-fg">${STATUS.payout[payout.status].label}</span>` : order.status === 'DELIVERED' ? 'UnieMax sends this to your bank after delivery.' : 'Paid to your bank after the order is delivered.'}</p>` }) : ''}
        </div>

        ${panel({ title: 'What has happened', body: html`<ol>
          ${tl('Order placed', order.placedAt)}
          ${order.status === 'CANCELLED'
            ? html`${order.confirmedAt ? tl('Confirmed', order.confirmedAt) : ''}${order.packedAt ? tl('Packed', order.packedAt) : ''}${tl('Cancelled', order.cancelledAt, true, true)}`
            : html`${tl('Confirmed', order.confirmedAt)}${tl('Packed', order.packedAt)}${tl('Sent', order.shippedAt)}${tl('Delivered', order.deliveredAt, true)}`}
        </ol>` })}
      </div>

      ${step || canCancel ? html`
        <div class="sticky bottom-[calc(var(--seller-dock,0px)+0.75rem)] z-20">
          <div class="ws-bar flex items-center gap-2 rounded-lg p-2 sm:p-3">
            ${step
              ? html`<button type="button" data-act="askAdvance" data-args="${args(order.id)}" ${busy ? 'disabled' : ''} class="${btn({ size: 'lg', cls: 'min-w-0 flex-1 text-base' })}">${busy ? spinner() : Icon('check', 'h-5 w-5')}${busy ? 'Saving…' : step.label}</button>`
              : html`<p class="min-w-0 flex-1 px-2 text-hint text-muted">Waiting for the order to be delivered.</p>`}
            ${canCancel ? html`<button type="button" data-act="askCancel" data-args="${args(order.id)}" ${busy ? 'disabled' : ''} class="${btn({ variant: 'ghost', size: 'lg', cls: 'text-danger' })}">Cancel</button>` : ''}
          </div>
        </div>` : ''}
      ${order.status === 'SHIPPED' ? html`<p class="text-hint text-muted">A sent order can no longer be cancelled.</p>` : ''}
    </div>`
  },
}

const ProductsScreen = {
  render() {
    const db = S()
    const all = db.products.filter((p) => p.storeId === db.me.storeId)
    // The demo catalog has ~1,050 products (js/catalog.js); the prototype lists the newest 40.
    const products = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 40)
    return html`<div class="space-y-4">
      ${pageHeader({ ico: 'box', title: 'Products', description: 'What you sell. Hide a product to stop new orders without deleting it.', action: html`<button type="button" data-act="notBuilt" data-args="${args('Add product')}" class="${btn({ size: 'lg' })}">${Icon('plus', 'h-5 w-5')}Add product</button>` })}
      ${all.length > products.length ? html`<p class="text-sm text-muted">Showing the newest ${products.length} of ${count(all.length)} products (prototype).</p>` : ''}
      <ul class="ws-card divide-y divide-line overflow-hidden rounded-lg">${products.map((p) => html`
        <li class="flex items-center gap-3 px-4 py-3 sm:px-5">
          <div class="h-14 w-14 shrink-0 rounded-xl border border-line ${p.visible ? '' : 'opacity-50'}" style="background:${p.tone}"></div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-base font-semibold text-fg ${p.visible ? '' : 'text-muted'}">${p.name}</p>
            <p class="mt-0.5 text-hint text-muted"><span class="font-figure font-semibold text-fg">${money(p.price)}</span> <span class="line-through">${money(p.mrp)}</span> · ${p.category}</p>
            <div class="mt-1.5 flex flex-wrap gap-2">
              ${p.stock === 0 ? badge('danger', 'Out of stock') : p.stock <= 5 ? badge('pending', `${p.stock} left`) : badge('neutral', `${p.stock} in stock`, false)}
              ${p.visible ? '' : badge('neutral', 'Hidden')}
            </div>
          </div>
          <button type="button" role="switch" aria-checked="${p.visible}" aria-label="Show ${p.name}" data-act="toggleProduct" data-args="${args(p.id)}"
            class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill transition-colors ${p.visible ? 'bg-success' : 'bg-fg/20'}">
            <span class="inline-block h-5 w-5 rounded-full bg-white shadow-floating transition-transform ${p.visible ? 'translate-x-6' : 'translate-x-1'}"></span>
          </button>
        </li>`)}</ul>
    </div>`
  },
}

const BusinessScreen = {
  render() {
    const store = Q.myStore(S())
    const b = store.business
    const field = (label, value) => html`<label class="block"><span class="${FIELD_LABEL}">${label}</span><input class="${FIELD}" value="${value || ''}" readonly /></label>`
    return html`<div class="space-y-4">
      ${pageHeader({ ico: 'shieldCheck', title: 'Business details', description: 'Who you are. Invoices and payouts use these details.' })}
      ${panel({
        ico: 'shieldCheck',
        title: 'Verification',
        description: store.verifiedAt ? `Checked by UnieMax on ${day(store.verifiedAt)}. Customers see the Verified badge.` : 'UnieMax checks your GST and PAN. This usually takes one working day.',
        aside: store.verifiedAt ? badge('success', 'Verified') : badge('pending', 'Waiting for check'),
        body: store.verifyNote ? html`<p class="text-sm text-muted">Note from UnieMax: <span class="text-fg">${store.verifyNote}</span></p>` : undefined,
      })}
      ${panel({ title: 'Your business', body: html`<div class="grid gap-4 sm:grid-cols-2">
        ${field('Business name', b.businessName)}${field('Your name', b.sellerName)}${field('GSTIN', b.gstin)}${field('PAN', b.pan)}
        <div class="sm:col-span-2">${field('Business address', b.address)}</div>
      </div>
      <p class="mt-4 text-hint text-muted">Editing is not part of the prototype.</p>` })}
    </div>`
  },
}

const EarningsScreen = {
  render() {
    const db = S()
    const mine = db.me.storeId
    const payouts = db.payouts.filter((p) => p.storeId === mine).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const waiting = Q.toPay(db).filter((o) => o.storeId === mine)
    const notDelivered = Q.orders(db, mine).filter((o) => o.paymentMethod === 'ONLINE' && o.paymentStatus === 'PAID' && !['DELIVERED', 'CANCELLED'].includes(o.status))
    const sum = (list) => list.reduce((s, x) => s + x, 0)
    const willPay = sum(waiting.map((o) => sellerShare(o, db.fees).net))
    const onWay = sum(payouts.filter((p) => p.status === 'PROCESSING').map((p) => p.amount))
    const paid = sum(payouts.filter((p) => p.status === 'SUCCEEDED').map((p) => p.amount))
    const later = sum(notDelivered.map((o) => sellerShare(o, db.fees).net))
    const tile = (label, value, hint, tone = '') => html`
      <div class="ws-card min-w-0 rounded-lg px-4 py-3 ${tone}">
        <p class="text-hint font-medium text-muted">${label}</p>
        <p class="mt-1 font-figure text-2xl font-semibold tabular-nums text-fg">${moneyExact(value)}</p>
        <p class="mt-0.5 text-xs text-muted">${hint}</p>
      </div>`

    return html`<div class="space-y-4">
      ${pageHeader({ ico: 'rupee', title: 'Earnings', description: 'Money UnieMax collected for you online, and what has been sent to your bank.' })}
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        ${tile('UnieMax will pay you', willPay, `${plural(waiting.length, 'delivered order')}`)}
        ${tile('On its way', onWay, 'Sent, reaching your bank')}
        ${tile('Paid to you', paid, `${plural(payouts.filter((p) => p.status === 'SUCCEEDED').length, 'payout')}`)}
        ${tile('After delivery', later, `${plural(notDelivered.length, 'order')} not delivered yet`)}
      </div>
      ${panel({
        title: 'Payouts',
        description: `UnieMax keeps ${db.fees.platformPct}% and the payment fee (${db.fees.gatewayPct}%) on each online order.`,
        padded: false,
        body: payouts.length === 0
          ? UI.empty({ ico: 'bank', title: 'No payouts yet', description: 'When a paid online order is delivered, UnieMax sends your money to your bank.', compact: true })
          : html`<ul class="divide-y divide-line">${payouts.map((p) => {
              const order = Q.order(db, p.orderId)
              return html`<li class="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div class="min-w-0 flex-1">
                  <p class="text-base font-medium text-fg">${order ? order.number : p.number} · ${order ? order.customer.name : ''}</p>
                  <p class="mt-0.5 text-hint text-muted">${p.number} · ${p.paidAt ? 'Paid ' + dateTime(p.paidAt) : 'Started ' + dateTime(p.createdAt)}</p>
                  ${p.failReason ? html`<p class="mt-1 text-hint text-danger">${p.failReason}</p>` : ''}
                </div>
                <div class="flex shrink-0 flex-col items-end gap-1.5">
                  <span class="font-figure text-base font-semibold tabular-nums text-fg">${moneyExact(p.amount)}</span>
                  ${badge(STATUS.payout[p.status].tone, STATUS.payout[p.status].label)}
                </div>
              </li>`
            })}</ul>`,
      })}
    </div>`
  },
}

const SELLER_CATEGORIES = ['ORDERS', 'PAYMENTS', 'PAYOUTS', 'PRODUCTS', 'STORE_SETUP', 'ACCOUNT', 'TECHNICAL', 'OTHER']
/** features/support/ticketMeta.tsx chip colours, by tone. */
const TICKET_TONE = { warning: 'bg-warning/10 text-warning', info: 'bg-accent/10 text-accent', success: 'bg-success/10 text-success', neutral: 'bg-surface-alt text-muted' }
const ticketChip = (s) => html`<span class="rounded-pill px-2.5 py-0.5 text-xs font-semibold ${TICKET_TONE[STATUS.ticket[s].tone]}">${STATUS.ticket[s].label}</span>`

const SupportScreen = {
  render() {
    const db = S()
    const store = Q.myStore(db)
    const owner = Q.owner(db, store)
    const tickets = Q.tickets(db, store.id)
    const ui = Store.ui
    const d = ui.drafts.ticket || {}
    const busy = ui.busy.createTicket

    return html`<div>
      ${pageHeader({ ico: 'lifebuoy', title: 'Help from UnieMax', description: 'Talk to the UnieMax team about your shop — payments, products, settings, or anything that is not working.' })}
      <p class="mt-2 text-hint text-muted">Messages from your own customers are in <a href="#/customer-support" class="font-semibold text-brand hover:underline">Customer messages</a>.</p>

      <div class="mt-5">${panel({ ico: 'phone', title: 'Call or email us', description: 'Mon–Sat, 9 am to 7 pm · support@uniemax.com · +91 80 4567 1234' })}</div>

      <div class="mt-7 flex flex-wrap items-center justify-between gap-3">
        <h3 class="font-heading text-lg font-bold text-fg">Your questions to UnieMax</h3>
        ${!ui.composing ? html`<button type="button" data-act="startTicket" class="${btn({ size: 'lg' })}">${Icon('plus', 'h-5 w-5')}Ask a question</button>` : ''}
      </div>

      ${ui.composing ? html`
        <form data-submit="createTicket" class="mt-4 space-y-4 rounded-lg border border-line p-4">
          <p class="text-sm text-muted">About <span class="font-medium text-fg">${store.name}</span>. Tell us what happened — order numbers and specifics help us answer in one reply instead of three.</p>
          <label class="block"><span class="mb-2 block text-sm font-medium text-muted">What is it about?</span>
            <select name="category" data-model="drafts.ticket.category" class="${FIELD}">
              ${SELLER_CATEGORIES.map((c) => html`<option value="${c}" ${d.category === c ? 'selected' : ''}>${STATUS.category[c]}</option>`)}
            </select></label>
          <label class="block"><span class="mb-2 block text-sm font-medium text-muted">Subject</span>
            <input name="subject" data-model="drafts.ticket.subject" value="${d.subject || ''}" required minlength="4" maxlength="140" class="${FIELD}" /></label>
          <label class="block"><span class="mb-2 block text-sm font-medium text-muted">Details</span>
            <textarea name="body" data-model="drafts.ticket.body" required minlength="10" rows="4" class="${AREA}">${d.body || ''}</textarea></label>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block"><span class="mb-2 block text-sm font-medium text-muted">Reply-to email</span><input name="email" type="email" value="${d.email ?? owner.email}" data-model="drafts.ticket.email" class="${FIELD}" /></label>
            <label class="block"><span class="mb-2 block text-sm font-medium text-muted">Phone</span><input name="phone" value="${d.phone ?? owner.phone}" data-model="drafts.ticket.phone" class="${FIELD}" /></label>
          </div>
          ${UI.errorNote(ui.errors.createTicket)}
          <div class="flex flex-wrap gap-2">
            <button type="submit" ${busy ? 'disabled' : ''} class="${btn()}">${busy ? spinner() : ''}${busy ? 'Sending…' : 'Send to UnieMax'}</button>
            <button type="button" data-act="cancelTicket" class="h-11 rounded-md border border-line px-5 text-sm font-semibold text-fg transition hover:bg-surface-alt">Cancel</button>
          </div>
        </form>` : ''}

      <div class="mt-4">
        ${tickets.length === 0
          ? html`<div class="rounded-lg border border-dashed border-line px-4 py-10 text-center">
              ${Icon('lifebuoy', 'mx-auto h-7 w-7 text-muted')}
              <p class="mt-2 text-sm font-medium text-fg">No tickets yet</p>
              <p class="mx-auto mt-1 max-w-sm text-sm text-muted">Raise one when something needs the UnieMax team — an order, a payout, or anything that looks broken.</p>
            </div>`
          : html`<ul class="divide-y divide-line rounded-lg border border-line">${tickets.map((t) => html`
              <li><a href="#/support/${t.id}" class="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-alt">
                <span class="min-w-0 flex-1">
                  <span class="flex flex-wrap items-center gap-2"><span class="truncate text-sm font-semibold text-fg">${t.subject}</span>${ticketChip(t.status)}</span>
                  <span class="mt-0.5 block truncate text-xs text-muted">${t.number} · ${STATUS.category[t.category]} · Updated ${dateTime(t.lastMessageAt)}</span>
                </span>
                <span class="flex shrink-0 items-center gap-1 text-xs text-muted">${Icon('chat', 'h-4 w-4')}${t.messages.length}</span>
                ${Icon('chevronRight', 'h-4 w-4 shrink-0 text-muted')}
              </a></li>`)}</ul>`}
      </div>
    </div>`
  },
}

const TicketScreen = {
  render({ id }) {
    const db = S()
    if (Store.ui.drafts.replyFor !== id) Object.assign(Store.ui.drafts, { reply: '', replyFor: id })
    const t = Q.ticket(db, id)
    if (!t || t.storeId !== db.me.storeId) return html`<div class="space-y-4">${backLink('Help from UnieMax')}${UI.infoNote('This ticket was not found.')}</div>`
    const closed = t.status === 'CLOSED'
    const busy = Store.ui.busy[`reply:${t.id}`]
    return html`<div class="space-y-4">
      ${backLink('Help from UnieMax')}
      <header class="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2"><h2 class="font-body text-lg font-semibold tracking-normal text-fg">${t.subject}</h2>${ticketChip(t.status)}</div>
          <p class="mt-1 text-xs text-muted">${t.number} · ${STATUS.category[t.category]} · Raised ${dateTime(t.createdAt)}</p>
        </div>
        ${!closed ? html`<button type="button" data-act="askCloseTicket" data-args="${args(t.id)}" class="h-9 rounded-md border border-line px-3 text-sm font-medium text-muted transition hover:bg-surface-alt hover:text-fg">Close ticket</button>` : ''}
      </header>
      <ol class="space-y-3">${t.messages.map((m) => {
        const support = m.author === 'ADMIN'
        return html`<li class="rounded-lg border p-4 ${support ? 'border-brand/30 bg-brand/5' : 'border-line bg-surface-alt'}">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <p class="text-sm font-semibold text-fg">${support ? 'UnieMax Support' : 'You'}</p>
            <p class="text-xs text-muted">${dateTime(m.at)}</p>
          </div>
          <p class="mt-2 whitespace-pre-wrap text-sm text-fg">${m.body}</p>
        </li>`
      })}</ol>
      ${Store.ui.typing === t.id ? html`<p class="text-sm text-muted">UnieMax Support is typing…</p>` : ''}
      ${closed
        ? UI.infoNote('This is closed. Raise a new one from Help & Support if you still need help.')
        : html`<form data-submit="sendReply" data-args="${args(t.id)}" class="space-y-3">
            <label class="block"><span class="mb-2 block text-sm font-medium text-muted">Add a reply</span>
              <textarea name="body" data-model="drafts.reply" rows="4" minlength="10" maxlength="4000" required placeholder="Anything new since you wrote in?"
                class="w-full rounded-md border border-line bg-input px-4 py-3 text-sm text-fg outline-none transition-colors placeholder:text-muted hover:border-fg/30 focus:border-accent">${Store.ui.drafts.reply || ''}</textarea></label>
            ${t.status === 'RESOLVED' ? UI.infoNote('This was marked resolved — replying reopens it.') : ''}
            ${UI.errorNote(Store.ui.errors[`reply:${t.id}`])}
            <button type="submit" ${busy ? 'disabled' : ''} class="${btn({ size: 'md' })}">${busy ? spinner() : ''}${busy ? 'Sending…' : 'Send reply'}</button>
          </form>`}
    </div>`
  },
}

/** Sections the prototype does not build yet. */
const StubScreen = {
  render() {
    const item = activeSection()
    return html`<div class="space-y-4">
      ${pageHeader({ ico: item.ico, title: item.label, description: 'This section is in the real app but not in the prototype yet.' })}
      <div class="ws-card rounded-lg">${UI.empty({ ico: item.ico, title: 'Not in the prototype', description: 'Build it in seller/app.js — add a screen and a route. The nav, layout and data are ready.' })}</div>
    </div>`
  },
}

// ===========================================================================
// Dialogs
// ===========================================================================

function renderDialog(d, store, pending) {
  const db = S()
  if (d.kind === 'confirm') return UI.confirm(d)
  if (d.kind === 'more') return moreSheet(store, pending)
  const order = d.orderId && Q.order(db, d.orderId)
  if (d.kind === 'advance' && order) {
    const step = World.NEXT[order.status]
    if (!step) return ''
    const ship = step.to === 'SHIPPED'
    return UI.modal({
      title: `${step.label}?`,
      subtitle: ship ? 'Your customer gets this straight away by email and notification.' : `Order ${order.number} · ${order.customer.name}`,
      body: ship
        ? html`<form id="ship-form" data-submit="advance" data-args="${args(order.id)}" class="space-y-4">
            <label class="block"><span class="${FIELD_LABEL}">Courier</span>
              <select name="courier" class="${FIELD}">${['DTDC', 'India Post', 'Delhivery', 'Professional Couriers', 'Blue Dart'].map((c) => html`<option>${c}</option>`)}</select></label>
            <label class="block"><span class="${FIELD_LABEL}">Tracking number <span class="font-normal text-muted">(optional)</span></span><input name="tracking" class="${FIELD}" /></label>
          </form>`
        : html`<p class="text-base text-fg">${step.to === 'CONFIRMED' ? 'Your customer is told their order is coming.' : step.to === 'DELIVERED' ? 'The customer sees this straight away.' : 'This tells your customer the parcel is ready.'}</p>`,
      footer: html`<button type="button" data-act="closeDialog" class="${btn({ variant: 'secondary' })}">Not now</button>
        ${ship
          ? html`<button type="submit" form="ship-form" class="${btn()}">${step.label}</button>`
          : html`<button type="button" data-act="advance" data-args="${args({}, order.id)}" class="${btn()}">${step.label}</button>`}`,
    })
  }
  if (d.kind === 'cancel' && order) {
    return UI.modal({
      title: 'Cancel this order?',
      subtitle: `Order ${order.number} · ${order.customer.name}`,
      body: html`<form id="cancel-form" data-submit="cancelOrder" data-args="${args(order.id)}" class="space-y-3">
        <p class="text-base text-fg">The customer is told, and the items go back in stock.${order.paymentMethod === 'ONLINE' ? ' Their online payment is refunded.' : ''}</p>
        <label class="block"><span class="${FIELD_LABEL}">Reason <span class="font-normal text-muted">(the customer sees this)</span></span><input name="reason" class="${FIELD}" /></label>
      </form>`,
      footer: html`<button type="button" data-act="closeDialog" class="${btn({ variant: 'secondary' })}">Keep order</button>
        <button type="submit" form="cancel-form" class="${btn({ variant: 'danger' })}">Cancel order</button>`,
    })
  }
  if (DIALOGS[d.kind]) return DIALOGS[d.kind](d)
  return ''
}

// ===========================================================================
// Act — every change goes through here and ends with Act.commit()
// ===========================================================================

Object.assign(Act, {
  // ---- shell ----
  toggleRail() {
    Store.ui.rail = !Store.ui.rail
    Act.commit()
  },
  toggleGroup(key) {
    const c = Store.ui.collapsed
    Store.ui.collapsed = c.includes(key) ? c.filter((k) => k !== key) : [...c, key]
    Act.commit()
  },
  openMore() {
    Store.ui.dialog = { kind: 'more' }
    Act.commit()
  },
  closeMore() {
    if (Store.ui.dialog && Store.ui.dialog.kind === 'more') {
      Store.ui.dialog = null
      Act.commit()
    }
  },
  allStores() {
    UI.toast('The "All stores" list is not part of the prototype')
  },
  fakeShare() {
    UI.toast('Would open WhatsApp with your shop link')
  },
  notBuilt(what) {
    UI.toast(`${what} is not part of the prototype yet`)
  },


  // ---- orders ----
  ordersQuery(value) {
    Store.ui.ordersQuery = value
    Act.commit()
  },
  askAdvance(orderId) {
    Store.ui.dialog = { kind: 'advance', orderId }
    Act.commit()
  },
  askCancel(orderId) {
    Store.ui.dialog = { kind: 'cancel', orderId }
    Act.commit()
  },
  advance(values, orderId) {
    Store.ui.dialog = null
    return run(`order:${orderId}`, () => Store.change((db) => World.advanceOrder(db, orderId, values)), { ok: (step) => step.done })
  },
  cancelOrder(values, orderId) {
    Store.ui.dialog = null
    return run(`order:${orderId}`, () => Store.change((db) => World.cancelOrder(db, orderId, values.reason.trim())), { ok: 'Order cancelled' })
  },

  // ---- products ----
  toggleProduct(productId) {
    return run(`product:${productId}`, () => Store.change((db) => World.toggleProduct(db, productId)), {
      ok: (p) => (p.visible ? 'Shown in your shop' : 'Hidden from your shop'),
      ms: 300,
    })
  },

  // ---- support ----
  startTicket() {
    Store.ui.composing = true
    Store.ui.drafts.ticket = Store.ui.drafts.ticket || { category: 'ORDERS' }
    Act.commit()
  },
  cancelTicket() {
    Store.ui.composing = false
    Act.commit()
  },
  async createTicket(values) {
    const ticket = await run('createTicket', () =>
      Store.change((db) =>
        World.createTicket(db, {
          subject: values.subject.trim(),
          category: values.category,
          body: values.body.trim(),
          email: values.email.trim(),
          phone: values.phone.trim(),
        }),
      ),
    )
    if (!ticket) return
    Store.ui.composing = false
    Store.ui.drafts.ticket = { category: 'ORDERS' }
    UI.toast('Sent — UnieMax will reply here')
    Act.commit()
    maybeAutoAnswer(ticket.id, `Hi, thanks for writing to UnieMax. We have your question about “${ticket.subject}” and someone from the team is looking at it now.`)
  },
  async sendReply(values, ticketId) {
    const body = values.body.trim()
    const owner = Q.owner(S(), Q.myStore(S()))
    const done = await run(`reply:${ticketId}`, () => Store.change((db) => (World.reply(db, ticketId, 'SELLER', owner.name, body), true)), { ok: 'Reply sent' })
    if (!done) return
    Store.ui.drafts.reply = ''
    Act.commit()
    maybeAutoAnswer(ticketId, 'Thanks, noted. We will update you here as soon as we have checked.')
  },
  askCloseTicket(ticketId) {
    UI.ask({ title: 'Close this ticket?', message: 'You will not be able to reply to it again. Raise a new one if you still need help.', confirmLabel: 'Close ticket', act: 'closeTicket', args: [ticketId] })
  },
  closeTicket(ticketId) {
    return run(`reply:${ticketId}`, () => Store.change((db) => World.setTicket(db, ticketId, { status: 'CLOSED' })), { ok: 'Ticket closed' })
  },

  // ---- simulate (control panel) ----
  simNewOrder() {
    Store.change((db) => World.newOrder(db))
    UI.toast('A customer placed an order')
    Act.commit()
  },
  /** "Other side replies now": support answers my latest open ticket. */
  simAdminReply() {
    const t = Q.tickets(S(), S().me.storeId).find((x) => x.status !== 'CLOSED')
    if (!t) return UI.toast('No open ticket to answer')
    Store.change((db) => World.reply(db, t.id, 'ADMIN', 'Anita', 'Hi Priya, an update from our side: we have checked this and fixed it. Please look again and tell us if anything is still wrong.'))
    Act.commit()
  },
  simSuspend() {
    const store = Q.myStore(S())
    Store.change((db) => World.suspend(db, store.id, !store.suspendedAt, 'Customer complaints about late delivery are being reviewed.'))
    Act.commit()
  },
})

/** When the admin app is closed, play support: "typing…", then an answer. */
function maybeAutoAnswer(ticketId, text) {
  if (!Store.ui.dev.autoReply || Store.isOnline('admin')) return
  setTimeout(() => {
    Store.ui.typing = ticketId
    Act.commit()
  }, 1200)
  later(4000, () => {
    Store.ui.typing = null
    const t = Q.ticket(S(), ticketId)
    if (!t || t.status === 'CLOSED') return // closed meanwhile: support stays quiet
    Store.change((db) => World.reply(db, ticketId, 'ADMIN', 'Anita', text))
  })
}

// ===========================================================================
// Screens — App.reg(name, { path, title, render, tab, skeleton, parent })
// ===========================================================================

const cards = (...rows) => () => UI.skeleton(rows)

App.reg('dashboard', { path: '/', title: 'Dashboard', tab: true, ...DashboardScreen, skeleton: cards('h-56', 'h-24', 'h-72') })
App.reg('orders', { path: '/orders', title: 'Orders', tab: true, parent: 'dashboard', ...OrdersScreen, skeleton: cards('h-12', 'h-[88px]', 'h-[88px]', 'h-[88px]') })
App.reg('order', { path: '/orders/:id', title: 'Order', tab: true, parent: 'orders', ...OrderScreen, skeleton: cards('h-32', 'h-48', 'h-48') })
App.reg('products', { path: '/products', title: 'Products', tab: true, parent: 'dashboard', ...ProductsScreen, skeleton: cards('h-[480px]') })
App.reg('business', { path: '/business', title: 'Business details', tab: true, parent: 'dashboard', ...BusinessScreen, skeleton: cards('h-24', 'h-72') })
App.reg('earnings', { path: '/earnings', title: 'Earnings', tab: true, parent: 'dashboard', ...EarningsScreen, skeleton: cards('h-24', 'h-64') })
App.reg('support', { path: '/support', title: 'Help from UnieMax', tab: true, parent: 'dashboard', ...SupportScreen, skeleton: cards('h-24', 'h-40') })
App.reg('ticket', { path: '/support/:id', title: 'Ticket', tab: true, parent: 'support', ...TicketScreen, skeleton: cards('h-16', 'h-32', 'h-32') })
for (const [name, path, title] of [
  ['categories', '/categories', 'Categories'], ['details', '/details', 'Shop name & logo'], ['builder', '/builder', 'Design your shop'],
  ['payments', '/payments', 'Payments'], ['bank', '/bank-accounts', 'Bank account'], ['shipping', '/shipping', 'Delivery'],
  ['checkout', '/checkout', 'Checkout'], ['affiliate', '/affiliate', 'Affiliate marketing'], ['customerSupport', '/customer-support', 'Customer messages'],
]) {
  App.reg(name, { path, title, tab: true, parent: 'dashboard', ...StubScreen })
}

/** What js/app.js needs to start this app. */
const AppConfig = {
  home: 'dashboard',
  view: sellerView,
  freshUi: () => ({
    rail: false, collapsed: ['settings', 'help'], ordersQuery: '', composing: false, typing: null,
    drafts: { reply: '', ticket: { category: 'ORDERS' } },
  }),
  replyNow: 'simAdminReply',
  simulate: [
    { act: 'simNewOrder', label: 'A customer places an order' },
    { act: 'simSuspend', label: 'UnieMax pauses / un-pauses my shop' },
  ],
  jumps: [
    ['dashboard', 'Dashboard'], ['orders', 'Orders'], ['order', 'An order', { id: 'ord_1044' }], ['products', 'Products'],
    ['business', 'Business'], ['earnings', 'Earnings'], ['support', 'Help'], ['ticket', 'A ticket', { id: 'tk_2042' }],
  ],
}
