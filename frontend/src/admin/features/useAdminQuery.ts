import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toApiError } from '../../shared/auth/http'
import type { ListMeta } from '../../shared/auth/http'

/**
 * The console's two data hooks. Small on purpose — the API is REST with a
 * uniform envelope, and a caching library would add more concepts than it
 * removes for screens an admin refreshes anyway.
 *
 * Both guard against the same two hazards:
 *   - **out-of-order responses** — a request counter discards anything but
 *     the newest, so fast typing can't leave stale rows on screen;
 *   - **updates after unmount** — the same counter check covers it.
 */

export interface QueryResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/** One resource. `deps` re-runs the fetch, exactly like `useEffect`. */
export function useAdminQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): QueryResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const latest = useRef(0)

  useEffect(() => {
    const requestId = ++latest.current
    setLoading(true)
    setError(null)
    fetcher()
      .then((result) => {
        if (latest.current !== requestId) return
        setData(result)
        setLoading(false)
      })
      .catch((err) => {
        if (latest.current !== requestId) return
        setError(toApiError(err).message)
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers declare their own deps
  }, [...deps, nonce])

  const refresh = useCallback(() => setNonce((value) => value + 1), [])
  return { data, loading, error, refresh }
}

/**
 * A paginated list whose filters live in the URL.
 *
 * The URL is the state: back/forward work, a filtered view is shareable, and
 * a refresh lands where the admin was. `setFilter` resets to page 1 — a
 * filter change makes the old page number meaningless.
 *
 * `M` widens the meta envelope for the endpoints that return more than the
 * pagination counters (support tickets add `openCount`). It defaults to
 * `ListMeta`, so every plain list call site is untouched.
 */
export function useAdminList<T, M extends ListMeta = ListMeta>(
  fetcher: (query: Record<string, string | number>) => Promise<{ items: T[]; meta: M }>,
  options: { pageSize?: number; keys: string[] },
) {
  const [searchParams, setSearchParams] = useSearchParams()
  const pageSize = options.pageSize ?? 20
  const page = Number(searchParams.get('page') ?? 1)

  // Only the declared keys become query params, so an unrelated URL param
  // (a highlight anchor, an analytics tag) is never sent to the API.
  const filters: Record<string, string> = {}
  for (const key of options.keys) {
    const value = searchParams.get(key)
    if (value) filters[key] = value
  }
  const filterSignature = JSON.stringify(filters)

  const query = useAdminQuery(
    () => fetcher({ ...filters, page, pageSize }),
    [filterSignature, page, pageSize],
  )

  const setFilter = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams)
      if (value) next.set(key, value)
      else next.delete(key)
      next.delete('page')
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const setPage = useCallback(
    (nextPage: number) => {
      const next = new URLSearchParams(searchParams)
      next.set('page', String(nextPage))
      setSearchParams(next)
      window.scrollTo({ top: 0 })
    },
    [searchParams, setSearchParams],
  )

  return {
    rows: query.data?.items ?? [],
    // Before the first response lands there are no counters — the extra keys
    // of a widened `M` are simply absent, which reads as falsy in the UI.
    meta: query.data?.meta ?? ({ total: 0, page, pageSize, totalPages: 0 } as M),
    loading: query.loading,
    error: query.error,
    refresh: query.refresh,
    filters,
    setFilter,
    page,
    setPage,
  }
}
