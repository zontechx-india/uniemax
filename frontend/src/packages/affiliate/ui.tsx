import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { toApiError } from '../../shared/auth/http'
import type { ListMeta } from '../../shared/auth/http'
import type { CommissionStatus, CommissionType } from './api'

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
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-fg">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  )
}

const STATUS_TONE: Record<string, string> = {
  PENDING: 'bg-warning/10 text-warning border-warning/30',
  APPROVED: 'bg-accent/10 text-accent border-accent/30',
  PAID: 'bg-success/10 text-success border-success/30',
  ACTIVE: 'bg-success/10 text-success border-success/30',
  ACCEPTED: 'bg-success/10 text-success border-success/30',
  PAUSED: 'bg-warning/10 text-warning border-warning/30',
  CANCELLED: 'bg-surface-alt text-muted border-line',
  EXPIRED: 'bg-surface-alt text-muted border-line',
  REMOVED: 'bg-surface-alt text-muted border-line',
  REVERSED: 'bg-danger/10 text-danger border-danger/30',
  REJECTED: 'bg-danger/10 text-danger border-danger/30',
  SUSPENDED: 'bg-danger/10 text-danger border-danger/30',
}

export function StatusChip({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.CANCELLED
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
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
    <div className="mt-3 flex items-center justify-between text-sm text-muted">
      <span>
        Page {meta.page} of {meta.totalPages} · {meta.total} total
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
          className="rounded-md border border-line px-3 py-1 hover:bg-surface-alt disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPage(meta.page + 1)}
          className="rounded-md border border-line px-3 py-1 hover:bg-surface-alt disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  )
}

export function TabNav({ tabs }: { tabs: { label: string; to: string; end?: boolean }[] }) {
  return (
    <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-line">
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
      className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-fg hover:bg-surface-alt"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted">
      {children}
    </div>
  )
}

export const inputClass =
  'h-10 w-full rounded-md border border-line bg-input px-3 text-sm text-fg outline-none transition-colors hover:border-fg/30 focus:border-accent'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}
