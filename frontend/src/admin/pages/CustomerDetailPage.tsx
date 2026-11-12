import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { adminApi } from '../features/adminApi'
import { useAdminQuery } from '../features/useAdminQuery'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import {
  Button,
  Card,
  CardHeader,
  Chip,
  Detail,
  ErrorState,
  PageHeader,
  Skeleton,
  TextArea,
} from '../ui/primitives'
import { OrderStatusChip, PaymentChip, StoreStatusChip } from '../ui/statusMeta'
import { formatCount, formatDate, formatDateTime, formatMoney } from '../ui/format'
import { StoreAvatar } from './StoresPage'
import { BackIcon } from '../layout/icons'

/**
 * One customer account, with the platform's account-level power: blocking.
 *
 * Blocking does two things at once, and both are stated in the dialog because
 * an admin should know exactly what they are about to do: the account can no
 * longer sign in by ANY method, and every existing session is revoked, so a
 * browser already holding a refresh token is cut off rather than left running
 * until the token happens to expire.
 */
export default function CustomerDetailPage() {
  const { customerId = '' } = useParams()
  const navigate = useNavigate()
  const { data: customer, loading, error, refresh } = useAdminQuery(
    () => adminApi.getCustomer(customerId),
    [customerId],
  )

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  if (error) return <ErrorState message={error} onRetry={refresh} />
  if (!customer || loading) return <Skeleton rows={10} />

  const blocked = customer.blockedAt !== null

  const runBlock = async () => {
    setBusy(true)
    setActionError(null)
    try {
      await adminApi.blockCustomer(customer.id, {
        blocked: !blocked,
        reason: reason.trim() || null,
      })
      setConfirmOpen(false)
      setReason('')
      refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update the account')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => navigate('/customers')}
        className="ph-back"
      >
        <BackIcon />
        All customers
      </button>

      <PageHeader
        title={customer.name ?? 'Unnamed customer'}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {blocked ? <Chip tone="danger">Blocked</Chip> : <Chip tone="success">Active</Chip>}
            {customer.isSeller ? <Chip tone="brand">Seller</Chip> : <Chip>Buyer</Chip>}
            <span>{customer.email ?? customer.phone}</span>
          </span>
        }
        actions={
          <Button
            variant={blocked ? 'secondary' : 'danger'}
            onClick={() => {
              setConfirmOpen(true)
              setReason('')
              setActionError(null)
            }}
          >
            {blocked ? 'Unblock account' : 'Block account'}
          </Button>
        }
      />

      {blocked ? (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          <p className="font-medium text-fg">
            Blocked on {formatDate(customer.blockedAt)} — cannot sign in by any method.
          </p>
          {customer.blockedReason ? (
            <p className="mt-1 text-muted">Reason: {customer.blockedReason}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Account" />
          <dl>
            <Detail label="Email">
              {customer.email ?? '—'}
              {customer.emailVerifiedAt ? (
                <Chip tone="success" className="ml-2">
                  Verified
                </Chip>
              ) : null}
            </Detail>
            <Detail label="Phone">
              {customer.phone ?? 'Not linked'}
              {customer.phoneVerifiedAt ? (
                <Chip tone="success" className="ml-2">
                  Verified
                </Chip>
              ) : null}
            </Detail>
            <Detail label="Alternate phone">{customer.altPhone ?? '—'}</Detail>
            <Detail label="Joined">{formatDate(customer.createdAt)}</Detail>
            <Detail label="Saved addresses">{formatCount(customer.counts.addresses)}</Detail>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Purchases" />
          <dl className="bill">
            <Detail label="Orders placed">{formatCount(customer.spend.orders)}</Detail>
            <Detail label="Lifetime value">{formatMoney(customer.spend.total)}</Detail>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Stores owned" />
          {customer.stores.length === 0 ? (
            <p className="py-4 text-sm text-muted">This account doesn't sell on UnieMax.</p>
          ) : (
            <ul className="space-y-2">
              {customer.stores.map((store) => (
                <li key={store.id}>
                  <Link
                    to={`/stores/${store.id}`}
                    className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-surface-alt"
                  >
                    <StoreAvatar logoUrl={store.logoUrl} name={store.name} size="h-8 w-8" />
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">{store.name}</span>
                    <StoreStatusChip
                      isPublished={store.isPublished}
                      suspendedAt={store.suspendedAt}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Recent orders" />
        {customer.recentOrders.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No orders yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {customer.recentOrders.map((order) => (
              <li key={order.id}>
                <Link
                  to={`/orders/${order.id}`}
                  className="-mx-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-3 hover:bg-surface-alt"
                >
                  <span className="font-medium text-fg">{order.orderNumber}</span>
                  <span className="text-sm text-muted">{order.storeName}</span>
                  <span className="ml-auto flex items-center gap-2">
                    <OrderStatusChip status={order.status} />
                    <PaymentChip status={order.paymentStatus} method={order.paymentMethod} />
                    <span className="font-medium text-fg">{formatMoney(order.total)}</span>
                  </span>
                  <span className="w-full text-xs text-muted">
                    {formatDateTime(order.placedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        busy={busy}
        title={blocked ? 'Unblock this account?' : 'Block this account?'}
        tone={blocked ? 'neutral' : 'danger'}
        confirmLabel={blocked ? 'Unblock account' : 'Block account'}
        description={
          <div className="space-y-3">
            <p>
              {blocked ? (
                <>They will be able to sign in again immediately.</>
              ) : (
                <>
                  <strong className="text-fg">{customer.email ?? customer.phone}</strong> will be
                  unable to sign in by any method, and every device currently signed in is
                  logged out at once. Their stores stay online — suspend those separately if
                  that's what you mean.
                </>
              )}
            </p>
            {!blocked ? (
              <TextArea
                label="Internal reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. Repeated fraudulent orders"
                maxLength={300}
              />
            ) : null}
            {actionError ? <p className="text-sm text-danger">{actionError}</p> : null}
          </div>
        }
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void runBlock()}
      />
    </>
  )
}
