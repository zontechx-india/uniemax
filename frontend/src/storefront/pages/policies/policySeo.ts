/**
 * Head text for the public Policies pages (PolicyHub, docs/policyhub/README.md
 * §9). The page shells write the same text server-side — must match
 * `POLICIES_HEAD`, `AUDIENCE_READERS` and `policyDescription` in
 * `backend/src/modules/seo/pageShell.service.ts`. Change both together.
 */

export const POLICIES_SEO = {
  title: ['Policies'],
  description:
    'The rules UnieMax works by, for sellers, customers and suppliers. Every version is kept, with the date it started.',
}

/** Plural reader name per audience (the API's `audience` values). */
export const AUDIENCE_READERS: Record<string, string> = {
  seller: 'sellers',
  customer: 'customers',
  supplier: 'suppliers',
}

export function policyDescription(name: string, audience: string): string {
  const readers = AUDIENCE_READERS[audience] ?? audience
  return `${name} for ${readers} on UnieMax: the version in force now and every earlier version, with the date each one started.`
}

/** "28 Nov 2026" — how the policy pages show a date. */
export const policyDay = (value: string) =>
  new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
