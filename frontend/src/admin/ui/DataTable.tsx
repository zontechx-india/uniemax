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
                  className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted ${column.className ?? ''}`}
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

      {/* Phone / small tablet: one card per row. */}
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
      <div className="flex gap-2">
        <Button disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button disabled={busy || page >= totalPages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  )
}
