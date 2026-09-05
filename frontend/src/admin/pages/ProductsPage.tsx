import { useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../features/adminApi'
import type { ProductRow } from '../features/adminApi'
import { useAdminList, useAdminQuery } from '../features/useAdminQuery'
import { Button, Card, Chip, PageHeader } from '../ui/primitives'
import { DataTable, Pagination } from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import { SearchInput, Tabs, Toolbar } from '../ui/Toolbar'
import { ActiveChip } from '../ui/statusMeta'
import { formatCount, formatPriceRange } from '../ui/format'
import { ProductDetailDialog } from './products/ProductDetailDialog'
import { ProductVisibilityDialog } from './products/ProductVisibilityDialog'

/**
 * The catalog across every store — inventory oversight plus the one
 * moderation lever the platform holds.
 *
 * The console does NOT edit a seller's product: name, price and stock are
 * theirs. It can only **hide** a listing that breaks the rules, which flips
 * the very same `isActive` flag the seller toggles — one visibility rule in
 * the system, not two that can contradict each other.
 *
 * A row is a summary; clicking it opens the listing in full (every image,
 * the copy, the option matrix, specs, delivery area) in a dialog over the
 * table, so the admin keeps their filters and page when they close it.
 * `?storeId=` scopes the table to one store — that is how a store's page
 * hands over to "all of this seller's products".
 */

const TABS = [
  { value: '', label: 'All' },
  { value: 'ACTIVE', label: 'Visible' },
  { value: 'DISABLED', label: 'Hidden' },
  { value: 'LOW_STOCK', label: 'Low stock' },
  { value: 'OUT_OF_STOCK', label: 'Out of stock' },
] as const

export default function ProductsPage() {
  const list = useAdminList<ProductRow>((query) => adminApi.listProducts(query), {
    keys: ['q', 'status', 'storeId'],
  })
  const storeId = list.filters['storeId'] ?? ''
  // The store's name for the filter banner. The rows carry it too, but an
  // empty result (store with no hidden products, say) would leave the banner
  // with nothing to show — so the store is looked up on its own.
  const { data: scopedStore } = useAdminQuery(
    () => (storeId ? adminApi.getStore(storeId) : Promise.resolve(null)),
    [storeId],
  )

  const [openId, setOpenId] = useState<string | null>(null)
  const [target, setTarget] = useState<ProductRow | null>(null)

  const columns: Column<ProductRow>[] = [
    {
      header: 'Product',
      primary: true,
      cell: (product) => (
        <div className="flex min-w-0 items-center gap-2.5">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-md border border-line object-cover"
              loading="lazy"
            />
          ) : (
            <span className="h-9 w-9 shrink-0 rounded-md bg-surface-alt" aria-hidden />
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{product.name}</p>
            <p className="truncate text-xs text-muted">{product.category.name}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Store',
      cell: (product) => <span className="truncate text-sm">{product.store.name}</span>,
    },
    {
      header: 'Price',
      cell: (product) => (
        <span className="text-sm">{formatPriceRange(product.priceMin, product.priceMax)}</span>
      ),
    },
    {
      header: 'Stock',
      className: 'text-right',
      cell: (product) =>
        product.stockTotal === 0 ? (
          <Chip tone="danger">Out of stock</Chip>
        ) : product.stockTotal <= 5 ? (
          <Chip tone="warning">{product.stockTotal} left</Chip>
        ) : (
          <span className="text-sm">{formatCount(product.stockTotal)}</span>
        ),
    },
    {
      header: 'Options',
      hideOnMobile: true,
      cell: (product) => (
        <span className="text-sm text-muted">
          {product.variantCount > 1 ? `${product.variantCount} variants` : 'Single'}
        </span>
      ),
    },
    { header: 'Visibility', cell: (product) => <ActiveChip isActive={product.isActive} /> },
    {
      header: '',
      className: 'text-right',
      hideOnMobile: true,
      cell: (product) => (
        <div className="flex justify-end gap-1.5">
          <Button
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation()
              setOpenId(product.id)
            }}
          >
            View
          </Button>
          <Button
            variant={product.isActive ? 'danger' : 'secondary'}
            onClick={(event) => {
              event.stopPropagation()
              setTarget(product)
            }}
          >
            {product.isActive ? 'Hide' : 'Restore'}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Seller listings across every store — inventory and moderation"
      />

      {storeId ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm">
          <span className="text-fg">
            Showing products from{' '}
            <Link to={`/stores/${storeId}`} className="font-medium text-accent hover:underline">
              {scopedStore?.name ?? 'one store'}
            </Link>
          </span>
          <button
            type="button"
            onClick={() => list.setFilter('storeId', '')}
            className="ml-auto text-muted hover:text-fg hover:underline"
          >
            Show all stores
          </button>
        </div>
      ) : null}

      <Card padded={false}>
        <Tabs
          value={list.filters['status'] ?? ''}
          onChange={(value) => list.setFilter('status', value)}
          options={[...TABS]}
        />
        <Toolbar>
          <SearchInput
            value={list.filters['q'] ?? ''}
            onChange={(value) => list.setFilter('q', value)}
            placeholder={storeId ? 'Product name…' : 'Product or store name…'}
          />
        </Toolbar>

        <DataTable
          rows={list.rows}
          columns={columns}
          rowKey={(product) => product.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.refresh}
          onRowClick={(product) => setOpenId(product.id)}
          empty={{
            title: 'No products match these filters',
            ...(storeId ? { hint: 'This store has nothing in this view.' } : {}),
          }}
        />
        <Pagination
          page={list.meta.page}
          totalPages={list.meta.totalPages}
          total={list.meta.total}
          onPage={list.setPage}
          busy={list.loading}
        />
      </Card>

      <ProductDetailDialog
        productId={openId}
        onClose={() => setOpenId(null)}
        onChanged={list.refresh}
      />

      <ProductVisibilityDialog
        product={target}
        onClose={() => setTarget(null)}
        onDone={list.refresh}
      />
    </>
  )
}
