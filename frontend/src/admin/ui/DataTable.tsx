import type { ReactNode } from 'react'
import { Button, EmptyState, ErrorState, Skeleton } from './primitives'

/**
 * The console's one table.
 *
 * **Responsiveness is the whole point of this component.** A data table
 * cannot simply shrink — below `md` each row re-renders as a stacked card
 * (label + value per cell), which is why every column declares a `header`
 * string: on a wide screen it labels the column, on a phone it labels the
 * value inside the card. One column may be marked `primary` — it becomes the
 * card's heading — and columns marked `hideOnMobile` drop out of the card.
 *
 * That keeps ONE definition of a table per page instead of a desktop table
 * plus a separate mobile list that drifts out of sync.
 */

export interface Column<T> {
  /** Column heading, and the label of this cell inside a mobile card. */
  header: string
  /** Cell renderer. */
  cell: (row: T) => ReactNode
  /** Promote to the mobile card's heading (at most one column). */
  primary?: boolean
  /** Detail that a phone card omits. */
  hideOnMobile?: boolean
  /** Extra classes for the cell (e.g. `text-right`). */
  className?: string
}

export interface DataTableProps<T> {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  onRowClick?: (row: T) => void
  empty?: { title: string; hint?: string }
  /**
   * Optional phone row. When given, the phone view is a native-style list —
   * this content on the left, a chevron on the right when rows open — instead
   * of the generic label/value card. Use it for the busy lists (orders,
   * payments) where repeating "Store", "Status"… on every row is noise.
   */
  mobileRow?: (row: T) => ReactNode
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading,
  error,
  onRetry,
  onRowClick,
  empty,
  mobileRow,
}: DataTableProps<T>) {
  if (error) return <ErrorState message={error} {...(onRetry ? { onRetry } : {})} />
  if (loading && rows.length === 0) return <Skeleton rows={6} className="p-4" />
  if (rows.length === 0) {
    return <EmptyState title={empty?.title ?? 'Nothing here yet'} {...(empty?.hint ? { description: empty.hint } : {})} />
  }

  const interactive = Boolean(onRowClick)
  const rowClasses = `border-b border-line last:border-0 ${
    interactive ? 'cursor-pointer hover:bg-surface-alt' : ''
  }`

  return (
    <>
      {/* Desktop: a real table. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              {columns.map((column) => (
                <th
                  key={column.header}
                  scope="col"
                  className={`px-3 py-2.5 text-xs font-medium text-muted ${column.className ?? ''}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={rowClasses}
                {...(interactive
                  ? {
                      onClick: () => onRowClick?.(row),
                      tabIndex: 0,
                      onKeyDown: (event: React.KeyboardEvent) => {
                        if (event.key === 'Enter') onRowClick?.(row)
                      },
                    }
                  : {})}
              >
                {columns.map((column) => (
                  <td
                    key={column.header}
                    className={`px-3 py-3 align-middle text-fg ${column.className ?? ''}`}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone / small tablet, custom row: a native-style list. */}
      {mobileRow ? (
        <ul className="divide-y divide-line md:hidden">
          {rows.map((row) => (
            <li
              key={rowKey(row)}
              className={`flex items-center gap-3 px-4 py-3 ${
                interactive ? 'cursor-pointer transition-colors active:bg-surface-alt' : ''
              }`}
              {...(interactive
                ? {
                    onClick: () => onRowClick?.(row),
                    tabIndex: 0,
                    role: 'link',
                    onKeyDown: (event: React.KeyboardEvent) => {
                      if (event.key === 'Enter') onRowClick?.(row)
                    },
                  }
                : {})}
            >
              <div className="min-w-0 flex-1">{mobileRow(row)}</div>
              {interactive ? (
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 shrink-0 text-muted"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Phone / small tablet: one card per row. */}
      {mobileRow ? null : (
      <ul className="divide-y divide-line md:hidden">
        {rows.map((row) => {
          const primary = columns.find((column) => column.primary)
          const rest = columns.filter((column) => !column.primary && !column.hideOnMobile)
          return (
            <li
              key={rowKey(row)}
              className={`px-4 py-3 ${interactive ? 'cursor-pointer active:bg-surface-alt' : ''}`}
              // Same keyboard behaviour as the desktop row: focusable, Enter opens.
              {...(interactive
                ? {
                    onClick: () => onRowClick?.(row),
                    tabIndex: 0,
                    onKeyDown: (event: React.KeyboardEvent) => {
                      if (event.key === 'Enter') onRowClick?.(row)
                    },
                  }
                : {})}
            >
              {primary ? <div className="mb-2 text-sm font-medium text-fg">{primary.cell(row)}</div> : null}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {rest.map((column) => (
                  <div key={column.header} className="min-w-0">
                    <dt className="text-xs text-muted">{column.header}</dt>
                    <dd className="truncate text-sm text-fg">{column.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          )
        })}
      </ul>
      )}
    </>
  )
}

/**
 * Server pagination controls. Page numbers rather than infinite scroll: an
 * admin needs to jump, come back, and share "page 4" with a colleague.
 */
export function Pagination({
  page,
  totalPages,
  total,
  onPage,
  busy,
}: {
  page: number
  totalPages: number
  total: number
  onPage: (page: number) => void
  busy?: boolean
}) {
  if (total === 0) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
      <p className="text-xs text-muted">
        Page {page} of {Math.max(totalPages, 1)} · {total.toLocaleString('en-IN')} total
      </p>
      {/* Full-width, thumb-sized halves on a phone; compact on desktop. */}
      <div className="flex w-full gap-2 sm:w-auto">
        <Button
          className="flex-1 sm:flex-none"
          disabled={busy || page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          className="flex-1 sm:flex-none"
          disabled={busy || page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
