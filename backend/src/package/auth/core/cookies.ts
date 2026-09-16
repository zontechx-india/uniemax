import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { CookieSerializeOptions } from "@fastify/cookie";
import { HttpError } from "../../../utils/httpError.js";
import { authConfig } from "./authCore.config.js";
import { generateRefreshToken } from "./token.util.js";
import type { IssuedTokens, PrincipalType } from "./authCore.types.js";

/**
 * Web-client token delivery via cookies.
 *   - access + refresh → httpOnly cookies (JS can't read them; XSS-safe).
 *   - csrf → a readable cookie the SPA echoes back in the `X-CSRF-Token`
 *     header (double-submit) so cookie auth is CSRF-safe.
 *
 * **Every function here takes the principal type.** Cookie names are
 * namespaced per surface (see `authConfig.cookieSurface`) so an admin and a
 * customer session can coexist in one browser, and making the type a required
 * argument is what stops that from being a convention someone can forget:
 * there is no way to read, write or clear an auth cookie without saying whose
 * it is.
 */

/** Options for the two httpOnly token cookies of a surface. */
function tokenOptions(type: PrincipalType): CookieSerializeOptions {
  const c = authConfig.cookie;
  return {
    secure: c.secure,
    sameSite: c.sameSite,
    path: authConfig.cookieSurface(type).tokenPath,
    httpOnly: true,
    ...(c.domain ? { domain: c.domain } : {}),
  };
}

/** Options for the JS-readable CSRF cookie (root path — see the config). */
function csrfOptions(): CookieSerializeOptions {
  const c = authConfig.cookie;
  return {
    secure: c.secure,
    sameSite: c.sameSite,
    path: c.csrfPath,
    httpOnly: false,
    ...(c.domain ? { domain: c.domain } : {}),
  };
}

export function setAuthCookies(reply: FastifyReply, tokens: IssuedTokens): void {
  const type = tokens.principal.type;
  const names = authConfig.cookieSurface(type);
  const refreshMaxAge = Math.floor(authConfig.refreshTtlMs(type) / 1000);

  // The access cookie outlives its JWT on purpose. Expiry is enforced by the
  // token's own `exp`, so once it lapses the server still *sees* it and
  // answers "Invalid or expired token" — a 401 the SPA recovers from with a
  // refresh. With `maxAge` = the JWT lifetime the browser silently dropped
  // the cookie at minute 15 and requests arrived with no credential at all,
  // indistinguishable from a signed-out visitor.
  reply.setCookie(names.access, tokens.accessToken, {
    ...tokenOptions(type),
    maxAge: refreshMaxAge,
  });
  reply.setCookie(names.refresh, tokens.refreshToken, {
    ...tokenOptions(type),
    maxAge: refreshMaxAge,
  });
  // Readable by the SPA → sent back in the X-CSRF-Token header.
  reply.setCookie(names.csrf, generateRefreshToken(), {
    ...csrfOptions(),
    maxAge: refreshMaxAge,
  });
}

/** Clears ONLY this surface's cookies — signing out of one app must never
 * end the other's session in the same browser. */
export function clearAuthCookies(
  reply: FastifyReply,
  type: PrincipalType,
): void {
  const names = authConfig.cookieSurface(type);
  reply.clearCookie(names.access, tokenOptions(type));
  reply.clearCookie(names.refresh, tokenOptions(type));
  reply.clearCookie(names.csrf, csrfOptions());
}

export function readAccessCookie(
  request: FastifyRequest,
  type: PrincipalType,
): string | undefined {
  return request.cookies[authConfig.cookieSurface(type).access];
}

export function readRefreshCookie(
  request: FastifyRequest,
  type: PrincipalType,
): string | undefined {
  return request.cookies[authConfig.cookieSurface(type).refresh];
}

/** Metadata captured on the session from the request. */
export function sessionMeta(request: FastifyRequest): {
  userAgent: string | null;
  ip: string | null;
} {
  return {
    userAgent: request.headers["user-agent"] ?? null,
    ip: request.ip ?? null,
  };
}

/** Constant-time string equality (hash first so lengths always match). */
function safeEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

/**
 * Double-submit CSRF guard for cookie-authenticated mutations, bound to one
 * surface. Checking the surface's OWN token matters: with a shared name, a
 * page holding any valid CSRF cookie could satisfy the check for a session it
 * doesn't own.
 */
export function requireCsrf(type: PrincipalType) {
  const name = authConfig.cookieSurface(type).csrf;
  return async function csrfGuard(request: FastifyRequest): Promise<void> {
    const cookie = request.cookies[name];
    const header = request.headers["x-csrf-token"];
    const provided = Array.isArray(header) ? header[0] : header;
    if (!cookie || !provided || !safeEqual(cookie, provided)) {
      throw HttpError.forbidden("Invalid or missing CSRF token");
    }
  };
}
