import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSeo } from '../../../shared/seo'
import { policyApi, policyPath, type PolicySummary } from '../../../shared/policy/policyApi'
import { SegmentedControl } from '../../../shared/ui/SegmentedControl'
import { EmptyState, ErrorState, Skeleton } from '../../../shared/ui/states'
import { ListingHeader } from '../../features/discovery/MarketListing'
import { CONTENT_COLUMN } from '../../layout/contentWidth'
import { MarketChrome } from '../../layout/MarketChrome'
import { ChevronRightIcon } from '../../layout/icons'
import { POLICIES_SEO, policyDay } from './policySeo'

/**
 * `/policies` — every UnieMax platform policy, one tab per reader: sellers,
 * customers, suppliers (PolicyHub, docs/policyhub/README.md §9). The list
 * comes from `GET /api/v1/policies`, so a policy published in the admin
 * console appears here with no code change.
 *
 * The tab is the URL hash (`#customers`), not a query: a query would be a
 * second indexable copy of this page. The customers tab also lists the
 * policy pages written by hand before PolicyHub (Refund & Returns, Shipping,
 * and the Privacy / Terms holding pages). The footer links only here, so this
 * is how those pages stay reachable; they keep their URLs because Merchant
 * Center points at `/refund-policy` and the payment gateway checks them.
 *
 * These are UnieMax's own rules. A store's own return or shipping terms live
 * on that store's site — the customers tab says so.
 */

type Audience = 'seller' | 'customer' | 'supplier'

const TABS: { value: Audience; hash: string; label: string; lead: string }[] = [
  { value: 'seller', hash: 'sellers', label: 'Sellers', lead: 'How UnieMax works with you when you sell here — payouts and more.' },
  {
    value: 'customer',
    hash: 'customers',
    label: 'Customers',
    lead: 'UnieMax’s own rules for shoppers. A store may add its own terms — you’ll find them on that store’s site.',
  },
  { value: 'supplier', hash: 'suppliers', label: 'Suppliers', lead: 'For suppliers who ship products for UnieMax stores.' },
]

/** Platform policy pages that predate PolicyHub — written in `InfoComingSoonPage`. */
const FIXED: Record<Audience, { name: string; to: string; note: string }[]> = {
  seller: [],
  customer: [
    { name: 'Refund & Returns Policy', to: '/refund-policy', note: 'Returns within 7 days of delivery, and how refunds are paid.' },
    { name: 'Shipping Policy', to: '/shipping-policy', note: 'How stores ship your order, delivery areas and charges.' },
    { name: 'Privacy Policy', to: '/privacy', note: 'Being finalised. Questions about your data? Contact support.' },
    { name: 'Terms & Conditions', to: '/terms', note: 'Being finalised. Questions? Contact support.' },
  ],
  supplier: [],
}

export function PoliciesPage() {
  const { hash } = useLocation()
  const navigate = useNavigate()
  const tab = TABS.find((t) => `#${t.hash}` === hash) ?? TABS[0]!
  const [policies, setPolicies] = useState<PolicySummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useSeo({ ...POLICIES_SEO, canonical: '/policies' })

  useEffect(() => {
    let live = true
    setFailed(false)
    policyApi
      .list()
      .then((list) => live && setPolicies(list))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [attempt])

  const shown = policies?.filter((p) => p.audience === tab.value) ?? []
  const fixed = FIXED[tab.value]

  return (
    <MarketChrome>
      <div className={`${CONTENT_COLUMN} py-6 sm:py-8`}>
        <div className="mx-auto max-w-3xl">
          <ListingHeader title="Policies" lead="The rules UnieMax works by. Every change is a new version, and earlier versions stay readable." />

          <SegmentedControl
            label="Who the policies are for"
            className="mt-6 w-full sm:w-fit"
            options={TABS.map((t) => ({ value: t.value, label: t.label }))}
            value={tab.value}
            onChange={(value) => {
              const next = TABS.find((t) => t.value === value)
              if (next) navigate({ hash: next.hash }, { replace: true })
            }}
          />
          <p className="mt-3 text-sm text-muted">{tab.lead}</p>

          <div className="mt-5">
            {failed ? (
              <ErrorState message="Policies could not load. Check your connection and try again." onRetry={() => setAttempt((n) => n + 1)} />
            ) : policies === null ? (
              <Skeleton rows={3} />
            ) : shown.length === 0 && fixed.length === 0 ? (
              <EmptyState compact title={`No policies for ${tab.label.toLowerCase()} yet`} description="When UnieMax publishes one, it appears here." />
            ) : (
              <ul className="space-y-3">
                {shown.map((p) => (
                  <PolicyRow
                    key={p.code}
                    to={policyPath(p.code)}
                    name={p.name}
                    meta={`Version ${p.version} · since ${policyDay(p.effectiveFrom)}`}
                    note={p.version > 1 ? p.changeSummary : null}
                  />
                ))}
                {fixed.map((f) => (
                  <PolicyRow key={f.to} to={f.to} name={f.name} meta={null} note={f.note} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </MarketChrome>
  )
}

function PolicyRow({ to, name, meta, note }: { to: string; name: string; meta: string | null; note: string | null }) {
  return (
    <li>
      <Link
        to={to}
        className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-4 transition-colors hover:border-fg/30"
      >
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-fg">{name}</p>
          {meta ? <p className="text-sm text-muted">{meta}</p> : null}
          {note ? <p className="mt-1 text-sm text-fg">{note}</p> : null}
        </div>
        <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
      </Link>
    </li>
  )
}
