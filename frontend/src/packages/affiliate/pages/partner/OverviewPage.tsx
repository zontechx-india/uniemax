import { Link } from 'react-router-dom'
import { StatTile, money, shortDate } from '../../ui'
import { usePartner } from './PartnerLayout'

export function OverviewPage() {
  const { me } = usePartner()

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Stores" value={me.stores} />
        <StatTile label="Clicks" value={me.clicks} />
        <StatTile label="Orders" value={me.orders} />
        <StatTile label="Sales" value={money(me.sales)} hint="through your links" />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Pending" value={money(me.pending)} hint="waiting on delivery + return window" />
        <StatTile label="Approved" value={money(me.approved)} hint="ready for payout" />
        <StatTile label="Paid" value={money(me.paid)} />
      </div>

      <div className="mt-6 rounded-lg border border-line p-4 text-sm text-muted">
        <p>
          Partner since {shortDate(me.joinedAt)}. To earn, open{' '}
          <Link to="stores" className="font-semibold text-brand hover:underline">
            Stores &amp; products
          </Link>
          , pick a product and share its link. A commission is created the moment an order is
          placed through it, and approved once the order is delivered and the store&apos;s return
          window has passed.
        </p>
      </div>
    </div>
  )
}
