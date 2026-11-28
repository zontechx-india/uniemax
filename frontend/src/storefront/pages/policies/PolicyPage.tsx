import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { useSeo } from '../../../shared/seo'
import { policyApi } from '../../../shared/policy/policyApi'
import type { PolicyHistory, PublicPolicy } from '../../../shared/policy/policyApi'
import { PayoutTimes } from '../../../shared/policy/PayoutTimes'
import { PolicyText } from '../../../shared/policy/PolicyText'
import { Button, buttonClass } from '../../../shared/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '../../../shared/ui/states'
import { ListingHeader } from '../../features/discovery/MarketListing'
import { CONTENT_COLUMN } from '../../layout/contentWidth'
import { MarketChrome } from '../../layout/MarketChrome'
import { AUDIENCE_READERS, policyDay, policyDescription } from './policySeo'

/**
 * `/policies/:code` — one platform policy, public (PolicyHub,
 * docs/policyhub/README.md §9): the version in force (the payout policy's
 * times in plain words first, then the full wording) and every earlier
 * version with its dates, each readable in full. `?version=N` — the link on
 * a seller's payout — opens and scrolls to that version; it is the same page
 * re-cut, so `noindex, follow` with the canonical on the bare page.
 *
 * The head must match `policyPage` in
 * `backend/src/modules/seo/pageShell.service.ts`.
 */
export function PolicyPage() {
  const { code: rawCode = '' } = useParams()
  const code = rawCode.trim().toUpperCase()
  const [params] = useSearchParams()
  const asked = Number(params.get('version')) || null
  const [state, setState] = useState<{ current: PublicPolicy | null; history: PolicyHistory | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    setState(null)
    Promise.all([policyApi.current(code), policyApi.history(code)])
      .then(([current, history]) => setState({ current, history }))
      .catch((err: unknown) => setError(toApiError(err).message))
  }, [code])

  useEffect(() => {
    load()
  }, [load])

  const current = state?.current ?? null
  useSeo({
    title: [current?.name, 'Policies'],
    description: current ? policyDescription(current.name, current.audience) : null,
    canonical: `/policies/${code}`,
    robots: state && !current ? 'noindex' : asked ? 'noindex, follow' : null,
  })

  const earlier = state?.history?.versions.filter((v) => v.version !== current?.version) ?? []
  const readers = current ? (AUDIENCE_READERS[current.audience] ?? current.audience) : null

  return (
    <MarketChrome>
      <div className={`${CONTENT_COLUMN} py-6 sm:py-8`}>
        <div className="mx-auto max-w-3xl">
          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : !state ? (
            <Skeleton rows={10} />
          ) : !current ? (
            <EmptyState
              title="This policy isn’t published"
              description="It may not be published yet, or the link is wrong."
              action={
                <Link to="/policies" className={buttonClass({ size: 'md' })}>
                  See all policies
                </Link>
              }
            />
          ) : (
            <>
              <ListingHeader
                title={current.name}
                crumbs={[{ name: 'Policies', to: '/policies' }]}
                lead={`For ${readers} · Version ${current.version} · in force since ${policyDay(current.effectiveFrom)}`}
              />

              <article className="mt-6 space-y-5">
                <PayoutTimes settings={current.settings} />
                {current.changeSummary && current.version > 1 ? (
                  <p className="text-sm text-muted">
                    <span className="font-medium text-fg">What changed:</span> {current.changeSummary}
                  </p>
                ) : null}
                <PolicyText body={current.body} className="text-base" />
                <p className="text-sm text-muted">Policy {current.code}</p>
              </article>

              {earlier.length > 0 ? (
                <section className="mt-10">
                  <h2 className="text-lg font-semibold text-fg">Earlier versions</h2>
                  <p className="text-sm text-muted">Each version applied from its start date until the next one began.</p>
                  <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
                    {earlier.map((v) => (
                      <EarlierVersion key={v.version} code={current.code} entry={v} openAtStart={asked === v.version} />
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </MarketChrome>
  )
}

function EarlierVersion({
  code,
  entry,
  openAtStart,
}: {
  code: string
  entry: PolicyHistory['versions'][number]
  openAtStart: boolean
}) {
  const [open, setOpen] = useState(openAtStart)
  const [full, setFull] = useState<PublicPolicy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  const row = useRef<HTMLLIElement>(null)

  // The version a link asked for (`?version=N`) comes into view once.
  useEffect(() => {
    if (openAtStart) row.current?.scrollIntoView({ block: 'start' })
  }, [openAtStart])

  useEffect(() => {
    if (!open || full) return
    let live = true
    policyApi
      .version(code, entry.version)
      .then((v) => {
        if (live) setFull(v)
      })
      .catch((err: unknown) => {
        if (live) setError(toApiError(err).message)
      })
    return () => {
      live = false
    }
  }, [open, full, code, entry.version, tries])

  return (
    <li className="scroll-mt-24 px-4 py-3" ref={row}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-semibold text-fg">Version {entry.version}</p>
          <p className="text-sm text-muted">
            {policyDay(entry.effectiveFrom)} – {entry.effectiveTo ? policyDay(entry.effectiveTo) : 'now'}
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
