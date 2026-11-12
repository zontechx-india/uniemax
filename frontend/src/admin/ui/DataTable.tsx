import type { ReactNode } from 'react'
import { Icon } from '../layout/icons'
import { EmptyState, ErrorState, IconButton } from './primitives'

/**
 * The console's one table (ADMIN_UI_THEME.md §7.4).
 *
 * **Responsiveness is the whole point of this component.** A data table
 * cannot simply shrink — at 720px and below each row re-renders as a stacked
 * card (label on the left, value on the right), which is why every column
 * declares a `header` string: on a wide screen it labels the column, on a
 * phone it labels the value inside the card. One column may be marked
 * `primary` — it becomes the card's title — and columns marked
 * `hideOnMobile` drop out of the card.
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
   * Optional phone row. When given, the phone view is a plain list — this
   * content on the left, a chevron on the right when rows open — instead of
   * the generic label/value card. Use it for the busy lists (orders,
   * payments) where repeating "Store", "Status"… on every row is noise.
   */
  mobileRow?: (row: T) => ReactNode
}

/** Loading bones shaped like the table: a header bar and rows. */
function TableSkeleton() {
  return (
    <div aria-hidden>
      <div className="skel m-3 h-5 w-1/3 rounded-sm" />
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 border-t border-line px-3 py-2.5">
          <div className="skel h-4 flex-[2]" />
          <div className="skel h-4 flex-1" />
          <div className="skel h-4 flex-1" />
          <div className="skel h-5 w-20 rounded-pill" />
        </div>
      ))}
    </div>
  )
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
  if (loading && rows.length === 0) return <TableSkeleton />
  if (rows.length === 0) {
    return (
      <EmptyState
        compact
        title={empty?.title ?? 'Nothing here yet'}
        {...(empty?.hint ? { description: empty.hint } : {})}
      />
    )
  }

  const interactive = Boolean(onRowClick)
  const rowProps = (row: T) =>
    interactive
      ? {
          onClick: () => onRowClick?.(row),
          tabIndex: 0,
          onKeyDown: (event: React.KeyboardEvent) => {
            if (event.key === 'Enter') onRowClick?.(row)
          },
        }
      : {}

  const primary = columns.find((column) => column.primary)
  const rest = columns.filter((column) => !column.primary && !column.hideOnMobile)

  return (
    <>
      {/* Wide: a real table. */}
      <div className="tscroll dt-wide">
        <table className="tbl min-w-[720px]">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.header} scope="col" className={column.className ?? ''}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className={interactive ? 'link' : ''} {...rowProps(row)}>
                {columns.map((column) => (
                  <td key={column.header} data-label={column.header} className={column.className ?? ''}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone: the page's own row, or a stacked label/value card. */}
      <ul className="mlist dt-narrow">
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            className={interactive ? 'link' : ''}
            {...(interactive && mobileRow ? { role: 'link' } : {})}
            {...rowProps(row)}
          >
            {mobileRow ? (
              <div className="min-w-0 flex-1">{mobileRow(row)}</div>
            ) : (
              <div className="min-w-0 flex-1">
                {primary ? <div className="mb-1.5 font-medium text-fg">{primary.cell(row)}</div> : null}
                <dl className="dt-card">
                  {rest.map((column) => (
                    <div key={column.header}>
                      <dt>{column.header}</dt>
                      <dd>{column.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {interactive && mobileRow ? <Icon name="chevron" /> : null}
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * Server pagination — the table footer: "Page 2 of 12 · 240 total" and two
 * arrow buttons. Page numbers rather than infinite scroll: an admin needs to
 * jump, come back, and share "page 4" with a colleague.
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
    <div className="tfoot">
      <span>
        Page {page} of {Math.max(totalPages, 1)} · {total.toLocaleString('en-IN')} total
      </span>
      <div className="pager">
        <IconButton
          icon="back"
          label="Previous page"
          disabled={busy || page <= 1}
          onClick={() => onPage(page - 1)}
        />
        <IconButton
          icon="chevron"
          label="Next page"
          disabled={busy || page >= totalPages}
          onClick={() => onPage(page + 1)}
        />
      </div>
    </div>
  )
}
