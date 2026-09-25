import axios, { AxiosError } from 'axios'
import type { InternalAxiosRequestConfig } from 'axios'

/**
 * Shared HTTP client for the backend API (web client profile).
 *
 * - Auth tokens travel as **httpOnly cookies** — never stored in JS. All we do
 *   is send credentials and echo the readable `csrf_token` cookie back in the
 *   `X-CSRF-Token` header on mutating requests (double-submit CSRF).
 * - The access cookie's JWT lives 15 minutes; the refresh cookie lives for
 *   weeks. A **401 on any request is first answered with one silent refresh
 *   and a replay** of that request (see the response interceptor), so a
 *   customer who leaves a page open for an hour never sees "Authentication
 *   required" — only a refresh that fails too (session revoked, cookie gone)
 *   surfaces the 401 to the caller.
 * - In dev the Vite proxy forwards `/api` to the backend (same origin), so no
 *   base URL is needed; `VITE_API_URL` overrides it when deployed differently.
 * - Backend errors arrive in a JSON envelope
 *   `{ success:false, statusCode, error, message, issues? }` — normalized here
 *   into `ApiError` so pages can just render `err.message`.
 */

export const http = axios.create({
  baseURL: (import.meta.env.VITE_API_URL as string | undefined) ?? '',
  withCredentials: true,
})

function readCookie(name: string): string | undefined {
  const match = document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined
}

/**
 * CSRF cookie name per auth surface — must match `COOKIE_SURFACES` in
 * `backend/src/package/auth/core/authCore.config.ts`.
 *
 * The admin console and the storefront run on ONE origin, and a browser keys
 * cookies by `(name, domain, path)` with the port excluded — so a single
 * shared name meant signing in on one surface evicted the other's session.
 * Each surface therefore has its own namespace, and the request's own URL
 * tells us which one it belongs to. Deriving it from the URL (rather than
 * from a value set at app boot) keeps this correct no matter which app loads
 * the client, and needs no initialisation order to be respected.
 */
const ADMIN_API_PREFIX = '/api/v1/admin'

/** The auth surface a request belongs to, from its URL alone. */
export type AuthSurface = 'customer' | 'admin'

function surfaceOf(url: string | undefined): AuthSurface {
  return url?.startsWith(ADMIN_API_PREFIX) ? 'admin' : 'customer'
}

const SURFACE: Record<AuthSurface, { csrfCookie: string; refreshUrl: string }> = {
  customer: { csrfCookie: 'csrf_token', refreshUrl: '/api/v1/auth/web/refresh' },
  admin: { csrfCookie: 'um_admin_csrf', refreshUrl: '/api/v1/admin/auth/web/refresh' },
}

http.interceptors.request.use((config) => {
  if ((config.method ?? 'get').toLowerCase() !== 'get') {
    const csrf = readCookie(SURFACE[surfaceOf(config.url)].csrfCookie)
    if (csrf) config.headers.set('X-CSRF-Token', csrf)
  }
  return config
})

// ---- Session refresh --------------------------------------------------------

/**
 * Collapses overlapping calls into ONE request — everyone who arrives while a
 * call is in flight awaits the same promise.
 *
 * For `refreshSession` this is a correctness guard rather than an
 * optimisation: refresh tokens **rotate**, and the backend treats a second
 * presentation of an already-rotated token as theft and revokes every session
 * (`rotateSession` in `session.service.ts`; it tolerates a re-presentation
 * only inside a short grace window, meant for other *tabs*). A page load
 * fires many requests at once, and when the access cookie has expired every
 * one of them comes back 401 in the same instant — they must all share one
 * refresh, not race each other with the same cookie.
 *
 * A failed call clears the slot, so the next caller genuinely retries.
 */
function singleFlight<T>(run: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null
  return () => {
    if (!inFlight) {
      inFlight = run().finally(() => {
        inFlight = null
      })
    }
    return inFlight
  }
}

const refreshers: Record<AuthSurface, () => Promise<void>> = {
  customer: singleFlight(() =>
    call<unknown>(http.post(SURFACE.customer.refreshUrl)).then(() => undefined),
  ),
  admin: singleFlight(() =>
    call<unknown>(http.post(SURFACE.admin.refreshUrl)).then(() => undefined),
  ),
}

/**
 * Rotates the surface's cookie session (single-flight per surface). Resolves
 * when the new access + refresh + CSRF cookies are in place; rejects with an
 * `ApiError` when the session is genuinely gone.
 */
export function refreshSession(surface: AuthSurface): Promise<void> {
  return refreshers[surface]()
}

/**
 * The cookie-exchange endpoints (`/auth/web/login`, `/web/refresh`,
 * `/web/logout`, `/web/otp/verify`, …). A 401 from these is the *answer*
 * (bad credentials, no session to rotate) — never something to retry.
 */
function isSessionExchange(url: string): boolean {
  return url.includes('/auth/web/')
}

interface RetriedConfig extends InternalAxiosRequestConfig {
  /** Set on the replay so a second 401 is final — one refresh per request. */
  _sessionRetried?: boolean
}

/**
 * Global 401 recovery: refresh once, replay once.
 *
 * Runs before any app-level response interceptor (registration order), so the
 * admin console's "401 ⇒ sign out" hook only ever sees a 401 that survived a
 * refresh attempt. The replay goes back through the request interceptor, which
 * matters: a refresh rotates the CSRF cookie too, and a replayed mutation must
 * carry the *new* token.
 */
http.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) throw error
    const config = error.config as RetriedConfig | undefined
    const url = config?.url ?? ''
    if (!config || config._sessionRetried || isSessionExchange(url)) throw error

    const surface = surfaceOf(url)
    // No CSRF cookie ⇒ this browser holds no session on that surface: a guest
    // hit a members-only endpoint. Nothing to refresh — hand the 401 back.
    if (!readCookie(SURFACE[surface].csrfCookie)) throw error

    try {
      await refreshSession(surface)
    } catch {
      throw error // the original 401; the refresh's own failure is not the caller's concern
    }
    config._sessionRetried = true
    return http.request(config)
  },
)

/** Field-level detail from a 422 validation error. */
export interface ApiIssue {
  path: string
  message: string
}

export class ApiError extends Error {
  statusCode: number
  issues?: ApiIssue[]

  constructor(message: string, statusCode: number, issues?: ApiIssue[]) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.issues = issues
  }
}

interface ErrorEnvelope {
  message?: string
  statusCode?: number
  issues?: ApiIssue[]
}

/** Normalizes any thrown value into an `ApiError` with a friendly message. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  if (axios.isAxiosError(err)) {
    const axiosErr = err as AxiosError<ErrorEnvelope>
    const body = axiosErr.response?.data
    if (body?.message) {
      // Prefer the first field-level issue — it's the most actionable text.
      const message = body.issues?.[0]?.message ?? body.message
      return new ApiError(message, body.statusCode ?? axiosErr.response?.status ?? 0, body.issues)
    }
    if (axiosErr.response) {
      const status = axiosErr.response.status
      return new ApiError(
        status >= 500
          ? `Something went wrong on our side (error ${status}). Please try again in a moment.`
          : `Request failed (${status})`,
        status,
      )
    }
    // No response at all: almost always the phone's connection, not our
    // server — say so in words a shopper can act on.
    return new ApiError(
      typeof navigator !== 'undefined' && navigator.onLine === false
        ? "You're offline. Check your internet connection and try again."
        : "Couldn't connect. Check your internet connection and try again.",
      0,
    )
  }
  return new ApiError(err instanceof Error ? err.message : 'Something went wrong', 0)
}

/** Runs a request and rethrows failures as `ApiError`. */
export async function call<T>(request: Promise<{ data: { data: T } }>): Promise<T> {
  try {
    const response = await request
    return response.data.data
  } catch (err) {
    throw toApiError(err)
  }
}

/** Pagination envelope returned alongside `list()` responses. */
export interface ListMeta {
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * Like `call`, but keeps the `meta` envelope — needed for server-paginated
 * endpoints where the caller must know the total and page count.
 */
export async function callList<T>(
  request: Promise<{ data: { data: T[]; meta: ListMeta } }>,
): Promise<{ items: T[]; meta: ListMeta }> {
  try {
    const response = await request
    return { items: response.data.data, meta: response.data.meta }
  } catch (err) {
    throw toApiError(err)
  }
}

/**
 * The **whole** success envelope, for the few endpoints that return a list
 * plus page-level context beside it (`data` + `meta` + more). The global
 * category pages are the case: one request has to answer the heading, the
 * breadcrumb, the child links and the product page, and splitting that into
 * two round trips to fit `callList` would be the tail wagging the dog.
 *
 * Prefer `call` / `callList`; reach for this only when the extra keys are
 * genuinely part of the same read.
 */
export async function callEnvelope<T>(
  request: Promise<{ data: T }>,
): Promise<T> {
  try {
    const response = await request
    return response.data
  } catch (err) {
    throw toApiError(err)
  }
}
