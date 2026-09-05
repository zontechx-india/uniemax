import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { adminApi } from '../features/adminApi'
import type { BankAccount, BankVerificationStatus } from '../features/adminApi'
import { useAdminQuery } from '../features/useAdminQuery'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { ActiveChip } from '../ui/statusMeta'
import { formatPriceRange } from '../ui/format'
import { ProductDetailDialog } from './products/ProductDetailDialog'
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
import { BankStatusChip, OrderStatusChip, PaymentChip, StoreStatusChip } from '../ui/statusMeta'
import {
  formatCount,
  formatDate,
  formatDateTime,
  formatMoney,
  formatMoneyExact,
} from '../ui/format'
import { StoreAvatar } from './StoresPage'
import { BackIcon, ExternalIcon } from '../layout/icons'

/**
 * One store, in full — the page an admin lands on from a support ticket or a
 * dashboard row.
 *
 * It carries the platform's two store-level powers:
 *   - **Suspension** — takes the store off the marketplace and blocks new
 *     orders, while leaving the owner's own management access alone so they
 *     can fix whatever caused it.
 *   - **Payout verification** — the MANUAL half of bank-account verification
 *     (the other being a third-party validator). Money settles to a verified
 *     account, so a failure must carry a note the seller can act on.
 *
 * It also shows the store's catalog — the first listings inline, each
 * opening in full — because "what is this store actually selling?" is the
 * first question behind most reports, and the answer shouldn't require
 * leaving the page.
 */

/** Listings shown inline before handing over to the filtered catalog page. */
const PRODUCT_PREVIEW = 6

export default function StoreDetailPage() {
  const { storeId = '' } = useParams()
  const navigate = useNavigate()
  const { data: store, loading, error, refresh } = useAdminQuery(
    () => adminApi.getStore(storeId),
    [storeId],
  )
  // The store's newest listings, a page at a time; the catalog page carries
  // the rest via `?storeId=`. Separate request so a slow product query never
  // delays the store header the admin came here for.
  const products = useAdminQuery(
    () => adminApi.listProducts({ storeId, page: 1, pageSize: PRODUCT_PREVIEW }),
    [storeId],
  )
  const [openProductId, setOpenProductId] = useState<string | null>(null)

  const [suspendOpen, setSuspendOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [bankTarget, setBankTarget] = useState<{
    account: BankAccount
    status: BankVerificationStatus
  } | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  if (error) return <ErrorState message={error} onRetry={refresh} />
  if (!store || loading) return <Skeleton rows={10} />

  const suspended = store.suspendedAt !== null

  const runSuspend = async () => {
    setBusy(true)
    setActionError(null)
    try {
      await adminApi.suspendStore(store.id, {
        suspended: !suspended,
        reason: reason.trim() || null,
      })
      setSuspendOpen(false)
      setReason('')
      refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update the store')
    } finally {
      setBusy(false)
    }
  }

  const runVerification = async () => {
    if (!bankTarget) return
    setBusy(true)
    setActionError(null)
    try {
      await adminApi.verifyBankAccount(store.id, bankTarget.account.id, {
        status: bankTarget.status,
        note: note.trim() || null,
      })
      setBankTarget(null)
      setNote('')
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
        onClick={() => navigate('/stores')}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"
      >
        <BackIcon />
        All stores
      </button>

      <PageHeader
        title={store.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StoreStatusChip isPublished={store.isPublished} suspendedAt={store.suspendedAt} />
            <a
              href={`/store/${store.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              /store/{store.slug}
              <ExternalIcon />
            </a>
          </span>
        }
        actions={
          <Button
            variant={suspended ? 'secondary' : 'danger'}
            onClick={() => {
              setSuspendOpen(true)
              setReason('')
              setActionError(null)
            }}
          >
            {suspended ? 'Lift suspension' : 'Suspend store'}
          </Button>
        }
      />

      {suspended ? (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          <p className="font-medium text-fg">
            Suspended on {formatDate(store.suspendedAt)} — hidden from the marketplace and not
            accepting orders.
          </p>
          {store.suspendedReason ? (
            <p className="mt-1 text-muted">Reason: {store.suspendedReason}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Owner" />
          <div className="flex items-center gap-3">
            <StoreAvatar logoUrl={store.logoUrl} name={store.name} size="h-12 w-12" />
            <div className="min-w-0">
              <p className="truncate font-medium text-fg">{store.owner.name ?? 'Unnamed'}</p>
              <p className="truncate text-sm text-muted">{store.owner.email}</p>
            </div>
          </div>
          <dl className="mt-3">
            <Detail label="Phone">{store.owner.phone ?? '—'}</Detail>
            <Detail label="Store created">{formatDate(store.createdAt)}</Detail>
            <Detail label="First published">
              {store.publishedAt ? formatDate(store.publishedAt) : 'Never'}
            </Detail>
          </dl>
          <Link
            to={`/customers/${store.owner.id}`}
            className="mt-3 inline-block text-sm text-accent hover:underline"
          >
            View owner account
          </Link>
        </Card>

        <Card>
          <CardHeader title="Business" />
          <dl>
            <Detail label="Revenue">{formatMoney(store.revenue)}</Detail>
            <Detail label="Orders">{formatCount(store.counts.orders)}</Detail>
            <Detail label="Products">
              <Link to={`/products?storeId=${store.id}`} className="text-accent hover:underline">
                {formatCount(store.counts.products)}
              </Link>
            </Detail>
            <Detail label="Categories">{formatCount(store.counts.categories)}</Detail>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Checkout settings" subtitle="What this store offers customers" />
          <dl>
            <Detail label="Online payment">
              {store.settings.payments.acceptOnlinePayment ? (
                <Chip tone="success">On</Chip>
              ) : (
                <Chip>Off</Chip>
              )}
            </Detail>
            <Detail label="Cash on delivery">
              {store.settings.payments.acceptCod ? <Chip tone="success">On</Chip> : <Chip>Off</Chip>}
            </Detail>
            <Detail label="Fulfilment">
              {store.settings.shipping.mode === 'BOTH'
                ? 'Delivery & pickup'
                : store.settings.shipping.mode === 'PICKUP'
                  ? 'Store pickup only'
                  : 'Delivery only'}
            </Detail>
            <Detail label="Shipping charge">
              {store.settings.shipping.rate.type === 'FREE'
                ? 'Free'
                : `Flat ${formatMoneyExact(store.settings.shipping.rate.amount)} per order${
                    store.settings.shipping.rate.freeAbove !== null
                      ? ` · free above ${formatMoneyExact(store.settings.shipping.rate.freeAbove)}`
                      : ''
                  }`}
            </Detail>
            <Detail label="Checkout collects">
              {Object.entries(store.settings.checkout)
                .filter(([, enabled]) => enabled)
                .map(([field]) => field)
                .join(', ') || 'Nothing'}
            </Detail>
          </dl>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Payout accounts"
          subtitle="Only a primary, verified account receives settlements"
        />
        {store.bankAccounts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            The seller hasn't added a payout account yet.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {store.bankAccounts.map((account) => (
              <li key={account.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                    {account.bankName} ····{account.accountNumberLast4}
                    {account.isPrimary ? <Chip tone="brand">Primary</Chip> : null}
                    <BankStatusChip status={account.verificationStatus} />
                  </p>
                  <p className="mt-0.5 text-sm text-muted">
                    {account.accountHolderName} · {account.ifsc} · {account.branch}
                    {account.upiId ? ` · ${account.upiId}` : ''}
                  </p>
                  {account.verificationNote ? (
                    <p className="mt-1 text-xs text-muted">Note: {account.verificationNote}</p>
                  ) : null}
                  {account.verifiedAt ? (
                    <p className="mt-1 text-xs text-muted">
                      Verified {formatDateTime(account.verifiedAt)}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  {account.verificationStatus !== 'VERIFIED' ? (
                    <Button
                      onClick={() => {
                        setBankTarget({ account, status: 'VERIFIED' })
                        setNote('')
                        setActionError(null)
                      }}
                    >
                      Mark verified
                    </Button>
                  ) : null}
                  {account.verificationStatus !== 'FAILED' ? (
                    <Button
                      variant="danger"
                      onClick={() => {
                        setBankTarget({ account, status: 'FAILED' })
                        setNote('')
                        setActionError(null)
                      }}
                    >
                      Mark failed
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Products"
          subtitle={
            store.counts.products === 0
              ? 'Nothing listed yet'
              : `${formatCount(store.counts.products)} listed · newest first · click one to see it in full`
          }
          action={
            store.counts.products > PRODUCT_PREVIEW ? (
              <Link
                to={`/products?storeId=${store.id}`}
                className="text-sm text-accent hover:underline"
              >
                View all {formatCount(store.counts.products)}
              </Link>
            ) : null
          }
        />
        {products.error ? (
          <ErrorState message={products.error} onRetry={products.refresh} />
        ) : products.loading && !products.data ? (
          <Skeleton rows={3} />
        ) : !products.data || products.data.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            The seller hasn't added any products yet.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {products.data.items.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => setOpenProductId(product.id)}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-surface-alt"
                >
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-md border border-line object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="h-11 w-11 shrink-0 rounded-md bg-surface-alt" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-fg">{product.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {product.category.name}
                      {product.variantCount > 1 ? ` · ${product.variantCount} variants` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <span className="text-sm font-medium text-fg">
                      {formatPriceRange(product.priceMin, product.priceMax)}
                    </span>
                    {product.stockTotal === 0 ? (
                      <Chip tone="danger">Out of stock</Chip>
                    ) : product.stockTotal <= 5 ? (
                      <Chip tone="warning">{product.stockTotal} left</Chip>
                    ) : (
                      <span className="text-xs text-muted">{formatCount(product.stockTotal)} in stock</span>
                    )}
                    <ActiveChip isActive={product.isActive} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Recent orders"
          action={
            <Link
              to={`/orders?storeId=${store.id}`}
              className="text-sm text-accent hover:underline"
            >
              View all
            </Link>
          }
        />
        {store.recentOrders.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No orders yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {store.recentOrders.map((order) => (
              <li key={order.id}>
                <Link
                  to={`/orders/${order.id}`}
                  className="-mx-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-3 hover:bg-surface-alt"
                >
                  <span className="font-medium text-fg">{order.orderNumber}</span>
                  <span className="text-sm text-muted">{order.customerName ?? 'Customer'}</span>
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
        open={suspendOpen}
        busy={busy}
        title={suspended ? 'Lift the suspension?' : 'Suspend this store?'}
        tone={suspended ? 'neutral' : 'danger'}
        confirmLabel={suspended ? 'Lift suspension' : 'Suspend store'}
        description={
          <div className="space-y-3">
            <p>
              {suspended
                ? `${store.name} will return to the marketplace with the owner's own publish setting restored.`
                : `${store.name} disappears from the marketplace and stops accepting orders immediately. The owner keeps access to fix the problem.`}
            </p>
            {!suspended ? (
              <TextArea
                label="Internal reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. Counterfeit listings reported"
                maxLength={300}
              />
            ) : null}
            {actionError ? <p className="text-sm text-danger">{actionError}</p> : null}
          </div>
        }
        onCancel={() => setSuspendOpen(false)}
        onConfirm={() => void runSuspend()}
      />

      <ConfirmDialog
        open={bankTarget !== null}
        busy={busy}
        title={
          bankTarget?.status === 'VERIFIED'
            ? 'Mark this account verified?'
            : 'Mark verification failed?'
        }
        tone={bankTarget?.status === 'VERIFIED' ? 'neutral' : 'danger'}
        confirmLabel={bankTarget?.status === 'VERIFIED' ? 'Mark verified' : 'Mark failed'}
        description={
          <div className="space-y-3">
            <p>
              {bankTarget?.account.bankName} ····{bankTarget?.account.accountNumberLast4} —{' '}
              {bankTarget?.status === 'VERIFIED'
                ? 'payouts can be settled to this account, and the seller is notified.'
                : 'the seller is told verification failed, with your note.'}
            </p>
            <TextArea
              label={bankTarget?.status === 'FAILED' ? 'Reason (required)' : 'Note (optional)'}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Account holder name doesn't match the bank record"
              maxLength={300}
            />
            {actionError ? <p className="text-sm text-danger">{actionError}</p> : null}
          </div>
        }
        onCancel={() => setBankTarget(null)}
        onConfirm={() => void runVerification()}
      />

      <ProductDetailDialog
        productId={openProductId}
        onClose={() => setOpenProductId(null)}
        onChanged={products.refresh}
      />
    </>
  )
}
