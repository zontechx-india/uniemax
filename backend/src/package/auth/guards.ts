import type { FastifyRequest } from "fastify";
import { authenticate, requirePrincipal } from "./core/guard.js";
import { requireCsrf } from "./core/cookies.js";
import { HttpError } from "../../utils/httpError.js";

/**
 * Route guards for this project's two principal kinds. The generic engine
 * (`core/guard`) provides `requirePrincipal`; this file binds it to admin /
 * customer and declares the request fields they set.
 */

// Authenticated principals attached to the request by the guards below.
declare module "fastify" {
  interface FastifyRequest {
    admin?: { id: string; role: string; sessionId?: string };
    customer?: { id: string; sessionId?: string };
  }
}

/** Requires a valid **admin** access token (bearer or cookie). Sets `request.admin`. */
export const requireAdmin = requirePrincipal("admin");

/** Requires a valid **customer** access token (bearer or cookie). Sets `request.customer`. */
export const requireCustomer = requirePrincipal("customer");

/**
 * Requires an admin whose role is **SUPER_ADMIN**.
 *
 * `requireAdmin` deliberately does not look at the role: most of the console
 * is open to any staff account. This is for the few capabilities where the
 * blast radius argues for the smallest possible set of people — editing a
 * seller's shop on their behalf, and admin-account management.
 *
 * Safe to use on its own or after `requireAdmin`: if the request has not been
 * authenticated yet it runs that guard first, so it cannot be defeated by
 * hook ordering.
 */
export async function requireSuperAdmin(request: FastifyRequest): Promise<void> {
  if (!request.admin) await requireAdmin(request);
  if (request.admin?.role !== "SUPER_ADMIN") {
    throw HttpError.forbidden("This action requires a super admin");
  }
}

/**
 * Double-submit CSRF for **cookie-authenticated admin mutations**.
 *
 * `SameSite=Lax` already stops a cross-site page from issuing a
 * state-changing request with the admin's cookies attached; this is the second
 * layer, so a future cookie-policy change (or a `SameSite=None` needed for
 * some integration) does not silently become the only thing standing between
 * a forged page and a seller's catalog.
 *
 * Two deliberate skips:
 *   - **Safe methods.** GET/HEAD/OPTIONS change nothing.
 *   - **Bearer-authenticated requests.** A browser attaches cookies by itself,
 *     which is what makes CSRF possible; an `Authorization` header is never
 *     attached automatically, so a bearer client is not exposed to it and must
 *     not be forced to carry a token it has no way to obtain.
 */
const adminCsrf = requireCsrf("admin");
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function requireAdminCsrf(request: FastifyRequest): Promise<void> {
  if (SAFE_METHODS.has(request.method)) return;
  if (request.headers.authorization?.startsWith("Bearer ")) return;
  await adminCsrf(request);
}

/**
 * Best-effort customer resolution for PUBLIC routes that grant owner-only
 * extras (e.g. the draft storefront preview): returns the customer id when the
 * request carries a valid customer access token, `undefined` otherwise — never
 * throws, so anonymous visitors pass through untouched.
 */
export function optionalCustomerId(
  request: FastifyRequest,
): string | undefined {
  try {
    const principal = authenticate(request, "customer");
    return principal.type === "customer" ? principal.id : undefined;
  } catch {
    return undefined;
  }
}
