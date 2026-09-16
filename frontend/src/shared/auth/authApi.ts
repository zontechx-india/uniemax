import { http, call, refreshSession, toApiError } from './http'

/**
 * Typed client for the backend auth API (web profile — httpOnly cookies).
 * Endpoint reference: docs/API.md · architecture: backend/docs/PACKAGE_AUTH.md
 */

// ---- Shapes returned by the backend ---------------------------------------

export interface Customer {
  id: string
  email: string | null
  phone: string | null
  emailVerifiedAt: string | null
  phoneVerifiedAt: string | null
  name: string | null
  avatarUrl: string | null
  altPhone: string | null
  hasPassword: boolean
  createdAt: string
}

export interface Admin {
  id: string
  email: string
  name: string | null
  role: 'SUPER_ADMIN' | 'ADMIN'
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

/**
 * "Code sent" info. Email codes are never echoed — the user reads their
 * inbox. `devCode` appears only for SMS codes outside production (no SMS
 * gateway yet, so it's the only way to read them besides the server console).
 */
export interface CodeSent {
  channel: 'EMAIL' | 'SMS'
  destination: string
  expiresInMinutes: number
  devCode?: string
}

export interface CustomerLogin {
  customer: Customer
  isNewUser: boolean
}

const AUTH = '/api/v1/auth'
const ADMIN_AUTH = '/api/v1/admin/auth'

// ---- Customer ---------------------------------------------------------------

export const customerAuth = {
  // Email + password (primary) — verify-first registration: request a code,
  // then verify with the same credentials + code (account created verified).
  registerRequest(input: { email: string; password: string; name?: string }) {
    return call<CodeSent>(http.post(`${AUTH}/register/request`, input))
  },
  registerVerify(input: {
    email: string
    password: string
    name?: string
    code: string
  }) {
    return call<CustomerLogin>(http.post(`${AUTH}/web/register/verify`, input))
  },
  login(input: { email: string; password: string }) {
    return call<CustomerLogin>(http.post(`${AUTH}/web/login`, input))
  },
  forgotPassword(email: string) {
    return call<CodeSent>(http.post(`${AUTH}/password/forgot`, { email }))
  },
  resetPassword(input: { email: string; code: string; newPassword: string }) {
    return call<{ passwordReset: boolean }>(http.post(`${AUTH}/password/reset`, input))
  },

  // Google Sign-In (backend verification is mocked until GOOGLE_CLIENT_ID lands)
  google(idToken: string) {
    return call<CustomerLogin>(http.post(`${AUTH}/web/google`, { idToken }))
  },

  // Phone OTP — login-only: works for numbers already linked to an account
  // (404 with a helpful message otherwise).
  requestOtp(phone: string) {
    return call<CodeSent>(http.post(`${AUTH}/otp/request`, { phone }))
  },
  verifyOtp(input: { phone: string; code: string }) {
    return call<CustomerLogin>(http.post(`${AUTH}/web/otp/verify`, input))
  },

  // Identifier linking — add the missing identifier (a mobile number, or an
  // email for OTP-only accounts) to the signed-in account, verified by a code
  // sent to that new identifier. 409 if it's already linked to any account —
  // a number/email can only ever belong to one account.
  linkRequest(input: { phone: string } | { email: string }) {
    return call<CodeSent>(http.post(`${AUTH}/me/link/request`, input))
  },
  linkVerify(input: ({ phone: string } | { email: string }) & { code: string }) {
    return call<Customer>(http.post(`${AUTH}/me/link/verify`, input))
  },

  // Session — `refresh()` is single-flight (see `refreshSession` in http.ts);
  // a 401 anywhere already refreshes + replays automatically, so call this
  // only where a *non-401* response means "the access cookie expired" (the
  // draft-preview 404 in PublicStoreLayout) or on a keep-alive timer.
  me() {
    return call<Customer>(http.get(`${AUTH}/me`))
  },
  refresh() {
    return refreshSession('customer')
  },
  logout() {
    return call<{ signedOut: boolean }>(http.post(`${AUTH}/web/logout`))
  },
}

// ---- Admin --------------------------------------------------------------------

export const adminAuth = {
  login(input: { email: string; password: string }) {
    return call<{ admin: Admin }>(http.post(`${ADMIN_AUTH}/web/login`, input))
  },
  me() {
    return call<Admin>(http.get(`${ADMIN_AUTH}/me`))
  },
  refresh() {
    return refreshSession('admin')
  },
  logout() {
    return call<{ signedOut: boolean }>(http.post(`${ADMIN_AUTH}/web/logout`))
  },
}

// ---- Session bootstrap (shared by both apps) -----------------------------------

/**
 * Resolves the current user from the cookie session: `/me`, which the http
 * client already retries once behind a silent refresh when the access cookie
 * has expired. A 401 that survives that means signed out → `null`. Other
 * failures (server down) propagate so the shell can decide.
 */
export async function resolveSession<TUser>(api: {
  me(): Promise<TUser>
}): Promise<TUser | null> {
  try {
    return await api.me()
  } catch (err) {
    if (toApiError(err).statusCode === 401) return null
    throw err
  }
}
