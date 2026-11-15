import { useCallback, useEffect, useId, useRef } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useNavigationType,
  useResolvedPath,
} from 'react-router-dom'
import type { RelativeRoutingType } from 'react-router-dom'

/**
 * Back controls that behave like a phone app's back button.
 *
 * A back arrow written as `<Link to={parent}>` PUSHES a new page: the page it
 * left stays in the history, the list loses its filters and scroll, and the
 * phone's own back button then goes "forward" into the page just left. Worse,
 * an arrow that always points at one fixed page (All stores) throws a seller
 * who came from somewhere else all the way out.
 *
 * So the app keeps a small copy of its own history (`NavTrailRecorder`, mounted
 * once at each router root) and the back hooks below use it to STEP BACK
 * when the page they want is the one the seller really came from — and only
 * jump to a fixed page (replacing, not pushing) when it is not: a link opened
 * in a new tab, a page reloaded, a URL typed in.
 *
 * Entries of the SAME page that differ only in the query string (a builder
 * section, a tab) are skipped, so "leave this page" means leave it.
 */

/** Path + query of each history entry this tab has visited, by React Router's `idx`. */
const trail: string[] = []

function historyIdx(): number {
  return (window.history.state as { idx?: number } | null)?.idx ?? 0
}

const pathOf = (entry: string) => entry.split('?')[0]!

/** Records the trail. Render once, inside the router, at the root. */
export function NavTrailRecorder() {
  const location = useLocation()
  const type = useNavigationType()
  useEffect(() => {
    const idx = historyIdx()
    // A new page drops whatever was "forward" of it, as the browser does.
    if (type === 'PUSH') trail.length = idx
    trail[idx] = location.pathname + location.search
  }, [location, type])
  return null
}

/**
 * How many steps back the page before this one is, skipping entries of the
 * current page. `null` when the trail does not know (fresh tab, reload).
 */
function stepsToPreviousPage(): { steps: number; path: string } | null {
  const idx = historyIdx()
  const here = trail[idx]
  if (here === undefined) return null
  for (let j = idx - 1; j >= 0; j--) {
    const entry = trail[j]
    if (entry === undefined) return null
    if (pathOf(entry) !== pathOf(here)) return { steps: j - idx, path: entry }
  }
  return null
}

/**
 * Back to `fallback`: steps back when the previous page IS `fallback` (so its
 * filters and scroll come back too), otherwise replaces this page with it.
 *
 * With `anywhere`, steps back to whatever page came before — the arrow means
 * "where I was", and `fallback` is only for when nothing came before.
 */
export function useBack(
  fallback: string,
  { anywhere = false, relative }: { anywhere?: boolean; relative?: RelativeRoutingType } = {},
) {
  const navigate = useNavigate()
  const target = useResolvedPath(fallback, { relative })
  return useCallback(() => {
    const previous = stepsToPreviousPage()
    if (previous && (anywhere || pathOf(previous.path) === target.pathname)) {
      navigate(previous.steps)
    } else {
      navigate(target, { replace: true })
    }
  }, [navigate, target, anywhere])
}

/**
 * Lets the phone's back button close a full-screen layer (the product wizard)
 * instead of leaving the page under it.
 *
 * While `open`, the layer owns one history entry: the same URL, marked in its
 * state. Back removes that entry and calls `onBack`, which returns `true` to
 * stay open (it handled the step itself — went back one wizard step), and the
 * entry is put back for the next press. Closing from the layer's own buttons
 * removes the entry, so no dead back press is left behind.
 */
export function useBackLayer(open: boolean, onBack: () => boolean) {
  const navigate = useNavigate()
  const location = useLocation()
  const type = useNavigationType()
  const id = useId()
  const pushed = useRef(false)
  const onBackRef = useRef(onBack)
  const locationRef = useRef(location)
  useEffect(() => {
    onBackRef.current = onBack
    locationRef.current = location
  })

  const ownsEntry = () =>
    (window.history.state as { usr?: { backLayer?: string } } | null)?.usr?.backLayer === id

  const push = useCallback(() => {
    pushed.current = true
    const { pathname, search, hash, state } = locationRef.current
    navigate(
      { pathname, search, hash },
      {
        state: { ...((state as object | null) ?? {}), backLayer: id },
        preventScrollReset: true,
      },
    )
  }, [navigate, id])

  // Opened → take an entry. Closed by its own buttons → give it back.
  useEffect(() => {
    if (open && !pushed.current) push()
    if (!open && pushed.current) {
      pushed.current = false
      if (ownsEntry()) navigate(-1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Back pressed: our entry is gone.
  useEffect(() => {
    if (!pushed.current || type !== 'POP' || ownsEntry()) return
    pushed.current = false
    if (onBackRef.current()) push()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location])
}

/**
 * A back arrow / "All orders" link that steps back (see `useBack`).
 *
 * Still a real link to `to`, so a long-press or a middle-click opens the page
 * in a new tab; a plain tap goes back instead. `onBack` replaces the default
 * step for a page with its own idea of "one level up" (the Store Builder
 * closes an open section first).
 */
export function BackLink({
  to,
  relative,
  anywhere,
  onBack,
  children,
  ...rest
}: {
  to: string
  relative?: RelativeRoutingType
  anywhere?: boolean
  onBack?: () => void
  children: ReactNode
} & Omit<ComponentProps<typeof Link>, 'to' | 'relative' | 'onClick' | 'children'>) {
  const back = useBack(to, { anywhere, relative })
  return (
    <Link
      {...rest}
      to={to}
      relative={relative}
      onClick={(event) => {
        const plain =
          event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
        if (!plain) return
        event.preventDefault()
        ;(onBack ?? back)()
      }}
    >
      {children}
    </Link>
  )
}
