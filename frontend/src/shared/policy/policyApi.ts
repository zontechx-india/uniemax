import { call, http, toApiError } from '../auth/http'
import type { PolicySettings } from './policyWording'

/**
 * Public PolicyHub reads (`/api/v1/policies`, no login — docs/policyhub §8).
 * Only published versions that have started; the wording comes filled in.
 */

export interface PublicPolicy {
  code: string
  name: string
  audience: string
  version: number
  effectiveFrom: string
  /** null = still in force. */
  effectiveTo: string | null
  body: string
  changeSummary: string | null
  settings: PolicySettings | null
}

export interface PolicyHistory {
  code: string
  name: string
  versions: { version: number; effectiveFrom: string; effectiveTo: string | null; changeSummary: string | null }[]
}

/** One line per policy with a version in force (`GET /policies`). */
export interface PolicySummary {
  code: string
  name: string
  audience: string
  version: number
  effectiveFrom: string
  changeSummary: string | null
}

const path = (code: string) => `/api/v1/policies/${encodeURIComponent(code)}`

/** A 404 means "not published yet" — the caller shows that, not an error. */
async function orNull<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request
  } catch (err) {
    if (toApiError(err).statusCode === 404) return null
    throw err
  }
}

export const policyApi = {
  /** Every policy with a version in force — the public Policies page. */
  list() {
    return call<PolicySummary[]>(http.get('/api/v1/policies'))
  },
  /** The version in force, or null when nothing is published yet. */
  current(code: string) {
    return orNull(call<PublicPolicy>(http.get(path(code))))
  },
  /** Every started version (no wording), newest first; null when none. */
  history(code: string) {
    return orNull(call<PolicyHistory>(http.get(`${path(code)}/versions`)))
  },
  /** One version in full. */
  version(code: string, version: number) {
    return call<PublicPolicy>(http.get(`${path(code)}/versions`, { params: { version } }))
  },
}

/** The seller payout policy's code (backend: `PAYOUT_POLICY_CODE`). */
export const PAYOUT_POLICY_CODE = 'PYO-001'

/** The public page of a policy (`?version=N` opens an earlier version). */
export const policyPath = (code: string, version?: number) =>
  `/policies/${encodeURIComponent(code)}${version ? `?version=${version}` : ''}`
