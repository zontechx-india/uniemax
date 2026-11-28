import { useCallback, useEffect, useRef, useState } from 'react'
import { Link as BackLink, useSearchParams } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { Button } from '../../../shared/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '../../../shared/ui/states'
import { PAYOUT_POLICY_CODE, policyApi } from '../../../shared/policy/policyApi'
import type { PolicyHistory, PublicPolicy } from '../../../shared/policy/policyApi'
import { PayoutTimes } from '../../../shared/policy/PayoutTimes'
import { PolicyText } from '../../../shared/policy/PolicyText'
import { ArrowLeftIcon, ClockIcon } from '../../layout/icons'
import { PageHeader } from './ui/PageHeader'
import { PanelCard } from './ui/PanelCard'
import { StatusPill } from './ui/StatusPill'

/**
 * Payout policy — when and how UnieMax pays the seller (PolicyHub PYO-001,
 * docs/policyhub/README.md). Opened from Earnings. Read-only: the version in
 * force (times in plain words, then the full wording) and every earlier
 * version with its dates, each readable in full. `?version=N` (the link on a
 * payout) opens that version. Not published yet → a calm note, not an error.
 */

const day = (value: string) =>
  new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export function StorePayoutPolicyPage() {
  const [params] = useSearchParams()
  const asked = Number(params.get('version')) || null
  const [state, setState] = useState<{ current: PublicPolicy | null; history: PolicyHistory | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    Promise.all([policyApi.current(PAYOUT_POLICY_CODE), policyApi.history(PAYOUT_POLICY_CODE)])
      .then(([current, history]) => setState({ current, history }))
      .catch((err: unknown) => setError(toApiError(err).message))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const earlier = state?.history?.versions.filter((v) => v.version !== state.current?.version) ?? []

  return (
    <div className="space-y-4">
      <BackLink
        to=".."
        relative="path"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted transition hover:text-fg"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Earnings
      </BackLink>
      <PageHeader icon={ClockIcon} title="Payout policy" description="When UnieMax pays you for your online orders." />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !state ? (
        <Skeleton rows={8} />
      ) : !state.current ? (
        <EmptyState
          title="Not published yet"
          description="UnieMax hasn't published its payout policy yet. Your payouts keep coming as they do today."
        />
      ) : (
        <>
          <PanelCard
            title={state.current.name}
            description={`Version ${state.current.version} · in force since ${day(state.current.effectiveFrom)}`}
            aside={<StatusPill tone="success">In force</StatusPill>}
          >
            <div className="space-y-4">
              <PayoutTimes settings={state.current.settings} />
              {state.current.changeSummary && state.current.version > 1 ? (
                <p className="text-sm text-muted">
                  <span className="font-medium text-fg">What changed:</span> {state.current.changeSummary}
                </p>
              ) : null}
              <PolicyText body={state.current.body} className="text-base" />
              <p className="text-sm text-muted">Policy {state.current.code}</p>
            </div>
          </PanelCard>

          {earlier.length > 0 ? (
            <PanelCard
              title="Earlier versions"
              description="A payout follows the version in force when its order was delivered."
              padded={false}
            >
              <ul className="divide-y divide-line">
                {earlier.map((v) => (
                  <EarlierVersion key={v.version} entry={v} openAtStart={asked === v.version} />
                ))}
              </ul>
            </PanelCard>
          ) : null}
        </>
      )}
    </div>
  )
}

function EarlierVersion({
  entry,
  openAtStart,
}: {
  entry: PolicyHistory['versions'][number]
  openAtStart: boolean
}) {
  const [open, setOpen] = useState(openAtStart)
  const [full, setFull] = useState<PublicPolicy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  const row = useRef<HTMLLIElement>(null)

  // The payout's own version (`?version=N`) comes into view once.
  useEffect(() => {
    if (openAtStart) row.current?.scrollIntoView({ block: 'start' })
  }, [openAtStart])

  useEffect(() => {
    if (!open || full) return
    let live = true
    policyApi
      .version(PAYOUT_POLICY_CODE, entry.version)
      .then((v) => {
        if (live) setFull(v)
      })
      .catch((err: unknown) => {
        if (live) setError(toApiError(err).message)
      })
    return () => {
      live = false
    }
  }, [open, full, entry.version, tries])

  return (
    <li className="scroll-mt-20 px-4 py-3" ref={row}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-semibold text-fg">Version {entry.version}</p>
          <p className="text-sm text-muted">
            {day(entry.effectiveFrom)} – {entry.effectiveTo ? day(entry.effectiveTo) : 'now'}
          </p>
          {entry.changeSummary ? <p className="text-sm text-fg">{entry.changeSummary}</p> : null}
        </div>
        <Button variant="ghost" size="md" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Read'}
        </Button>
      </div>
      {open ? (
        <div className="mt-3 space-y-4">
          {error ? (
            <ErrorState
              message={error}
              onRetry={() => {
                setError(null)
                setTries((t) => t + 1)
              }}
            />
          ) : !full ? (
            <Skeleton rows={4} />
          ) : (
            <>
              <PayoutTimes settings={full.settings} />
              <PolicyText body={full.body} className="text-base" />
            </>
          )}
        </div>
      ) : null}
    </li>
  )
}
