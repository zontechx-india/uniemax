import { Link, useParams } from 'react-router-dom'
import { MediaImg } from '../../../shared/media/MediaImg'
import { adminApi } from '../../features/adminApi'
import { useAdminQuery } from '../../features/useAdminQuery'
import { Card, CardHeader, Chip, Detail, PageHeader } from '../../ui/primitives'
import { OrderStatusChip } from '../../ui/statusMeta'
import { formatDateTime, formatMoneyExact } from '../../ui/format'
import { BILL_STAGE, BILL_STATE } from './SellerBillsPage'

/** One seller bill — read-only (modules/bills). */

const VIA = { WHATSAPP: 'WhatsApp', COPY: 'Copied link', SHARE: 'Share menu' } as const

export default function SellerBillPage() {
  const { billId = '' } = useParams()
  const { data: bill, loading, error } = useAdminQuery(() => adminApi.getBill(billId), [billId])

  if (loading && !bill) return <PageHeader title="Bill" back={{ to: '/bills', label: 'Seller bills' }} />
  if (error || !bill) {
    return <PageHeader title="Bill not found" subtitle={error ?? undefined} back={{ to: '/bills', label: 'Seller bills' }} />
  }

  return (
    <>
      <PageHeader
        title={`Bill ${bill.number}`}
        back={{ to: '/bills', label: 'Seller bills' }}
        badge={<Chip tone={BILL_STATE[bill.state].tone}>{BILL_STATE[bill.state].label}</Chip>}
        subtitle={`${bill.store.name} · made ${formatDateTime(bill.createdAt)}${bill.state === 'OPEN' ? ` · ${BILL_STAGE[bill.stage]}` : ''}`}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title={`Items (${bill.itemCount})`} subtitle="Prices are fixed when the bill is made" />
            <ul className="divide-y divide-line">
              {bill.items.map((item) => (
                <li key={`${item.productId}:${item.variantId ?? ''}`} className="flex items-center gap-3 py-3">
                  {item.imageUrl ? (
                    <MediaImg sizes="48px" src={item.imageUrl} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-md border border-line object-cover" />
                  ) : (
                    <span className="h-12 w-12 shrink-0 rounded-md bg-surface-alt" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium text-fg">{item.productName}</p>
                    {item.variantName && <Chip className="mt-1">{item.variantName}</Chip>}
                    {item.sku && <p className="mt-1 font-mono text-xs text-muted">SKU {item.sku}</p>}
                  </div>
                  <div className="shrink-0 text-right text-sm">
                    <p className="text-muted">
                      {item.quantity} × {formatMoneyExact(item.unitPrice)}
                    </p>
                    <p className="font-medium text-fg">{formatMoneyExact(item.lineTotal)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <dl className="bill total mt-3">
              <Detail label="Items">{formatMoneyExact(bill.subtotal)}</Detail>
              <Detail label="Delivery">{bill.fulfilment === 'PICKUP' ? 'Store pickup' : formatMoneyExact(bill.shippingCharge)}</Detail>
              {Number(bill.discount) > 0 && <Detail label="Seller discount">− {formatMoneyExact(bill.discount)}</Detail>}
              <Detail label="Total">{formatMoneyExact(bill.total)}</Detail>
            </dl>
            {bill.note && <p className="mt-3 text-sm text-muted">Note to the customer: “{bill.note}”</p>}
          </Card>
          <Card>
            <CardHeader title="Shared by the seller" subtitle="From the seller's own WhatsApp — UnieMax records the tap, not the chat" />
            {bill.shares.length === 0 ? (
              <p className="text-sm text-muted">Not shared yet.</p>
            ) : (
              <dl>
                {bill.shares.map((s, i) => (
                  <Detail key={i} label={VIA[s.via]}>
                    {formatDateTime(s.at)}
                  </Detail>
                ))}
              </dl>
            )}
          </Card>
        </div>
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="Customer" />
            <dl>
              <Detail label="Name">{bill.customerName ?? '—'}</Detail>
              <Detail label="Phone">{bill.customerPhone}</Detail>
              <Detail label="Delivery">{bill.fulfilment === 'PICKUP' ? 'Store pickup' : 'Address added when paying'}</Detail>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Timeline" />
            <dl>
              <Detail label="Made">{formatDateTime(bill.createdAt)}</Detail>
              <Detail label="Shared">{bill.sharedAt ? formatDateTime(bill.sharedAt) : '—'}</Detail>
              <Detail label="Opened">{bill.openedAt ? formatDateTime(bill.openedAt) : '—'}</Detail>
              {bill.paidAt && <Detail label="Paid">{formatDateTime(bill.paidAt)}</Detail>}
              {bill.cancelledAt && <Detail label="Cancelled">{formatDateTime(bill.cancelledAt)}</Detail>}
              <Detail label={bill.state === 'EXPIRED' ? 'Expired' : 'Link open till'}>{formatDateTime(bill.expiresAt)}</Detail>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Order" />
            {bill.order ? (
              <dl>
                <Detail label="Order">
                  <Link to={`/orders/${bill.order.id}`} className="lnk">
                    {bill.order.orderNumber}
                  </Link>
                </Detail>
                <Detail label="Status">
                  <OrderStatusChip status={bill.order.status} />
                </Detail>
                {bill.order.paymentRef && <Detail label="Payment ref">{bill.order.paymentRef}</Detail>}
              </dl>
            ) : (
              <p className="text-sm text-muted">{bill.state === 'OPEN' ? 'No order yet — made when the customer pays.' : 'Never paid, so no order was made.'}</p>
            )}
          </Card>
          <Card>
            <CardHeader title="Link" />
            <p className="font-mono text-xs break-all text-fg">{bill.link}</p>
            <p className="mt-2 text-xs text-muted">Only the seller can share or cancel a bill.</p>
          </Card>
        </div>
      </div>
    </>
  )
}
