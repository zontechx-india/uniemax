import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { toApiError } from '../../shared/auth/http'
import type { ListMeta } from '../../shared/auth/http'
import type { CommissionStatus, CommissionType } from './api'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import type { BadgeTone } from '../../shared/ui/Badge'
import { fieldClass } from '../../shared/ui/field'

/** Small pieces every affiliate screen shares. */

export function useLoad<T>(fetcher: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const latest = useRef(0)

  useEffect(() => {
    const id = ++latest.current
    setLoading(true)
    setError(null)
    fetcher()
      .then((result) => {
        if (id !== latest.current) return
        setData(result)
        setLoading(false)
      })
      .catch((err) => {
        if (id !== latest.current) return
        setError(toApiError(err).message)
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  return { data, setData, loading, error, reload: () => setNonce((n) => n + 1) }
}

export function money(value: number | null | undefined): string {
  if (value == null) return '—'
  return `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

export function rateText(type: CommissionType | null, rate: number | null): string {
  if (type == null || rate == null) return '—'
  return type === 'PERCENTAGE' ? `${rate}%` : `${money(rate)} / item`
}

export function shortDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="ws-card rounded-lg p-4">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-1 font-figure text-xl font-semibold text-fg">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  )
}

const STATUS_TONE: Record<string, BadgeTone> = {
  PENDING: 'warning',
  APPROVED: 'info',
  PAID: 'success',
  ACTIVE: 'success',
  ACCEPTED: 'success',
  PAUSED: 'warning',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
  REMOVED: 'neutral',
  REVERSED: 'danger',
  REJECTED: 'danger',
  SUSPENDED: 'danger',
}

export function StatusChip({ status }: { status: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  )
}

export const COMMISSION_STATUSES: CommissionStatus[] = [
  'PENDING',
  'APPROVED',
  'PAID',
  'CANCELLED',
  'REVERSED',
  'REJECTED',
]

export function Pager({ meta, onPage }: { meta: ListMeta; onPage: (page: number) => void }) {
  if (meta.totalPages <= 1) return null
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <span>
        Page {meta.page} of {meta.totalPages} · {meta.total} total
      </span>
      {/* Full-width, thumb-sized halves on a phone; compact from `sm`. */}
      <div className="flex w-full gap-2 sm:w-auto">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1 sm:flex-none"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="flex-1 sm:flex-none"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPage(meta.page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}

export function TabNav({ tabs }: { tabs: { label: string; to: string; end?: boolean }[] }) {
  return (
    <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
              isActive ? 'border-brand text-fg' : 'border-transparent text-muted hover:text-fg'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-fg hover:bg-surface-alt bg-surface"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="ws-card rounded-lg px-4 py-10 text-center text-sm text-muted">
      {children}
    </div>
  )
}

export const inputClass = fieldClass({ dense: true })

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}
