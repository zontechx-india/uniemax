import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toApiError } from '../../../../shared/auth/http'
import { Button } from '../../../../shared/ui/Button'
import { ErrorState, PageSkeleton } from '../../../../shared/ui/states'
import { adminAffiliateApi } from '../../api'
import type { AdminAffiliateDetail, AdminPartnership, Channel } from '../../api'
import { CommissionsTable } from '../CommissionsTable'
import { CommissionActions } from './CommissionActions'
import { CopyButton, Empty, StatusChip, money, rateText, shortDate, useLoad } from '../../ui'

/**
 * One affiliate account, seen from the platform: who the person is, every
 * store they partner with (rate, owner, links, clicks and money per store),
 * every tracking link, the invitations they accepted, fraud flags, and their
 * commissions with the same approve / reject override as the overview.
 */
export default function AffiliateAdminDetailPage() {
  const { affiliateId = '' } = useParams()
  const detail = useLoad(() => adminAffiliateApi.affiliate(affiliateId), [affiliateId])
  const [error, setError] = useState<string | null>(null)

  if (detail.error) return <ErrorState message={detail.error} onRetry={detail.reload} />
  if (!detail.data) return <PageSkeleton label="Loading affiliate" />

  const a = detail.data
  const active = a.status === 'ACTIVE'

  const toggleStatus = async () => {
    setError(null)
    try {
      await adminAffiliateApi.setStatus(a.id, active ? 'SUSPENDED' : 'ACTIVE')
      detail.reload()
    } catch (err) {
      setError(toApiError(err).message)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/affiliates"
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg"
        >
          <ChevronLeft />
          All affiliates
        </Link>

        <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Initial name={a.displayName} size="lg" />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold text-fg">{a.displayName}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                <StatusChip status={a.status} />
                <span>Partner since {shortDate(a.createdAt)}</span>
              </div>
            </div>
          </div>
          <Button variant={active ? 'danger' : 'secondary'} size="sm" onClick={() => void toggleStatus()}>
            {active ? 'Suspend account' : 'Reinstate account'}
          </Button>
        </header>
        {!active && (
          <p className="mt-3 text-sm text-muted">
            Suspended — their links stop working, new orders earn nothing, and they cannot open
            the partner area.
          </p>
        )}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-fg">Contact</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <Row label="Account name">{a.account?.name ?? '—'}</Row>
            <Row label="Email">{a.account?.email ? <Mail value={a.account.email} /> : '—'}</Row>
            <Row label="Phone">{a.account?.phone ? <Tel value={a.account.phone} /> : '—'}</Row>
            <Row label="Customer account">
              <Link to={`/customers/${a.customerId}`} className="text-accent hover:underline">
                Open customer
              </Link>
            </Row>
          </dl>
        </section>

        <section className="rounded-lg border border-line bg-surface p-5 lg:col-span-2">
          <h2 className="text-base font-semibold text-fg">Earnings</h2>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="font-figure text-3xl font-semibold tabular-nums text-fg">
              {money(a.pending + a.approved + a.paid)}
            </p>
            <p className="text-sm text-muted">
              earned on {money(a.sales)} of sales · {a.orders} order{a.orders === 1 ? '' : 's'}
            </p>
          </div>
          <EarningsBar pending={a.pending} approved={a.approved} paid={a.paid} />
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <Figure label="Pending" value={money(a.pending)} dot="bg-warning" />
            <Figure label="Approved" value={money(a.approved)} dot="bg-accent" />
            <Figure label="Paid" value={money(a.paid)} dot="bg-success" />
            <Figure label="Clicks" value={a.clicks.toLocaleString('en-IN')} />
          </dl>
        </section>
      </div>

      <Section title="Stores" count={a.stores.length}>
        {a.stores.length === 0 ? (
          <Empty>Not partnered with any store.</Empty>
        ) : (
          <ul className="space-y-3">
            {a.stores.map((store) => (
              <StoreCard key={store.id} store={store} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Links" count={a.links.length}>
        <LinksList links={a.links} />
      </Section>

      <Section title="Invitations accepted" count={a.invitations.length}>
        {a.invitations.length === 0 ? (
          <Empty>No invitation on record.</Empty>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0">
            {a.invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-fg">{inv.storeName}</p>
                  <p className="mt-0.5 text-muted">
                    Sent to {inv.name} · {inv.email}
                  </p>
                </div>
                <p className="text-muted">
                  {inv.commissionRate == null
                    ? 'Programme rate'
                    : `${rateText(inv.commissionType ?? 'PERCENTAGE', inv.commissionRate)} offered`}{' '}
                  · sent {shortDate(inv.createdAt)} · accepted {shortDate(inv.acceptedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <FraudSection events={a.fraudEvents} stores={a.stores} />

      <Section title="Commissions">
        <CommissionsTable
          load={(q) => adminAffiliateApi.commissions({ ...q, affiliateId: a.id })}
          showStore
          actions={(row, reload) => (
            <CommissionActions
              row={row}
              reload={() => {
                reload()
                detail.reload()
              }}
              onError={setError}
            />
          )}
        />
      </Section>
    </div>
  )
}

// ---- stores ---------------------------------------------------------------

const PARTNER_STATUS_NOTE: Record<AdminPartnership['status'], string | null> = {
  ACTIVE: null,
  PAUSED: 'Paused by the seller — links stop working',
  REMOVED: 'Removed by the seller',
}

function StoreCard({ store }: { store: AdminPartnership }) {
  const note = [
    PARTNER_STATUS_NOTE[store.status],
    store.programEnabled ? null : 'Store programme is off',
    !store.storeExists ? 'Store deleted' : !store.storePublished ? 'Store not published' : null,
  ].filter(Boolean)

  return (
    <li className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Initial name={store.storeName} />
          <div className="min-w-0">
            {store.storeExists ? (
              <Link
                to={`/stores/${store.storeId}`}
                className="block truncate font-medium text-fg hover:underline"
              >
                {store.storeName}
              </Link>
            ) : (
              <p className="truncate font-medium text-fg">{store.storeName}</p>
            )}
            <p className="mt-0.5 truncate text-sm text-muted">
              /{store.storeSlug} · joined {shortDate(store.joinedAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">
            {rateText(store.commissionType, store.commissionRate)}
            {store.hasOverride ? ' · custom rate' : ''}
          </span>
          <StatusChip status={store.status} />
        </div>
      </div>

      {note.length > 0 && <p className="mt-3 text-sm text-warning">{note.join(' · ')}</p>}

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <Figure label="Links" value={store.links} />
        <Figure label="Clicks" value={store.clicks.toLocaleString('en-IN')} />
        <Figure label="Sales" value={money(store.sales)} />
        <Figure label="Pending" value={money(store.pending)} />
        <Figure label="Approved" value={money(store.approved)} />
        <Figure label="Paid" value={money(store.paid)} />
      </dl>

      <div className="mt-4 border-t border-line pt-4 text-sm">
        <p className="text-muted">Seller</p>
        {store.owner ? (
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-fg">
            <Link to={`/customers/${store.owner.id}`} className="font-medium hover:underline">
              {store.owner.name ?? 'Unnamed seller'}
            </Link>
            {store.owner.email && <Mail value={store.owner.email} muted />}
            {store.owner.phone && <Tel value={store.owner.phone} muted />}
          </p>
        ) : (
          <p className="mt-0.5 text-fg">—</p>
        )}
      </div>
    </li>
  )
}

// ---- links ----------------------------------------------------------------

const CHANNEL_LABEL: Record<Channel, string> = {
  YOUTUBE: 'YouTube',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  WEBSITE: 'Website',
  WHATSAPP: 'WhatsApp',
  TELEGRAM: 'Telegram',
  OTHER: 'Other',
}

function LinksList({ links }: { links: AdminAffiliateDetail['links'] }) {
  if (links.length === 0) return <Empty>No links created yet.</Empty>
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-surface max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0">
      {links.map((link) => (
        <li key={link.id} className="px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fg">
                {link.label || link.productName || 'Store home page'}
              </p>
              <p className="mt-0.5 truncate text-sm text-muted">
                {[
                  link.storeName,
                  link.label && link.productName ? link.productName : null,
                  link.channel ? CHANNEL_LABEL[link.channel] : null,
                  `created ${shortDate(link.createdAt)}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="font-figure tabular-nums text-fg">
                {link.clickCount.toLocaleString('en-IN')} click{link.clickCount === 1 ? '' : 's'}
              </p>
              <p className="mt-0.5 text-muted">
                {link.lastClickAt ? `last ${shortDate(link.lastClickAt)}` : 'never clicked'}
              </p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {!link.enabled && <StatusChip status="PAUSED" />}
            <code className="min-w-0 flex-1 truncate rounded-md bg-surface-alt px-2 py-1 text-xs text-muted">
              {link.url}
            </code>
            <CopyButton text={link.url} />
          </div>
        </li>
      ))}
    </ul>
  )
}

// ---- fraud ----------------------------------------------------------------

const FRAUD_LABEL: Record<string, string> = {
  SELF_PURCHASE: 'Bought through their own link',
}

function FraudSection({
  events,
  stores,
}: {
  events: AdminAffiliateDetail['fraudEvents']
  stores: AdminPartnership[]
}) {
  const storeName = new Map(stores.map((s) => [s.storeId, s.storeName]))
  return (
    <Section title="Flags" count={events.length}>
      {events.length === 0 ? (
        <p className="text-sm text-muted">Nothing suspicious recorded.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-danger/30 bg-surface max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0">
          {events.map((event) => (
            <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-fg">{FRAUD_LABEL[event.kind] ?? event.kind}</p>
                <p className="mt-0.5 text-muted">
                  {[
                    event.storeId ? storeName.get(event.storeId) ?? 'Unknown store' : null,
                    event.orderId ? (
                      <Link key="order" to={`/orders/${event.orderId}`} className="text-accent hover:underline">
                        View order
                      </Link>
                    ) : null,
                  ]
                    .filter(Boolean)
                    .map((part, i) => (
                      <span key={i}>
                        {i > 0 && ' · '}
                        {part}
                      </span>
                    ))}
                </p>
              </div>
              <p className="text-muted">{shortDate(event.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

// ---- small pieces -----------------------------------------------------------

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-baseline gap-2 text-lg font-semibold text-fg">
        {title}
        {count != null && <span className="font-figure text-sm font-normal tabular-nums text-muted">{count}</span>}
      </h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-fg">{children}</dd>
    </div>
  )
}

function Figure({ label, value, dot }: { label: string; value: ReactNode; dot?: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-muted">
        {dot && <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />}
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-figure font-medium tabular-nums text-fg">{value}</dd>
    </div>
  )
}

/** Where the earned money stands: one bar split pending → approved → paid. */
function EarningsBar({ pending, approved, paid }: { pending: number; approved: number; paid: number }) {
  const total = pending + approved + paid
  if (total === 0) {
    return <div className="mt-4 h-2 rounded-full bg-surface-alt" aria-hidden />
  }
  const part = (n: number) => `${(n / total) * 100}%`
  return (
    <div
      className="mt-4 flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-alt"
      role="img"
      aria-label={`Pending ${money(pending)}, approved ${money(approved)}, paid ${money(paid)}`}
    >
      {pending > 0 && <span className="bg-warning" style={{ width: part(pending) }} />}
      {approved > 0 && <span className="bg-accent" style={{ width: part(approved) }} />}
      {paid > 0 && <span className="bg-success" style={{ width: part(paid) }} />}
    </div>
  )
}

function Initial({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-surface-alt font-semibold text-muted ${
        size === 'lg' ? 'h-14 w-14 text-lg' : 'h-10 w-10 text-sm'
      }`}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

function Mail({ value, muted = false }: { value: string; muted?: boolean }) {
  return (
    <a href={`mailto:${value}`} className={`hover:underline ${muted ? 'text-muted' : ''}`}>
      {value}
    </a>
  )
}

function Tel({ value, muted = false }: { value: string; muted?: boolean }) {
  return (
    <a href={`tel:${value}`} className={`font-figure tabular-nums hover:underline ${muted ? 'text-muted' : ''}`}>
      {value}
    </a>
  )
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}
