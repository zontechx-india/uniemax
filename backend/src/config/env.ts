import { appEnv } from "./loadEnv.js";
import { z } from "zod";

/**
 * Central, validated environment configuration.
 *
 * Everything the app needs from `process.env` is declared and parsed here once,
 * so the rest of the codebase can import a fully-typed `env` object instead of
 * reaching into `process.env` (which is `string | undefined` everywhere).
 *
 * Add new variables to `envSchema` as features land (JWT secrets, SMS keys,
 * S3 credentials, Razorpay keys, etc.). Keep secrets optional until the feature
 * that needs them is wired up, so local dev never breaks on a missing key.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // HTTP server
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(4000),

  // Logging
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  // CORS — "*" (any origin) in dev, or a comma-separated allowlist in prod.
  CORS_ORIGIN: z.string().default("*"),

  // Proxy trust — controls whether X-Forwarded-* headers are believed.
  // "true" (default) when the API sits behind Nginx / a load balancer;
  // set "false" when it is exposed directly, otherwise a client can spoof
  // X-Forwarded-For and rotate its identity past every per-IP rate limit.
  // Also accepts a hop count ("1") or a comma-separated address list,
  // passed straight through to Fastify's `trustProxy`.
  TRUST_PROXY: z.string().default("true"),

  // Database (optional for now — the base server boots without it)
  DATABASE_URL: z.string().optional(),
  // Direct (non-pooled) connection — used by Prisma CLI for migrations.
  DIRECT_URL: z.string().optional(),

  // Cashfree Payment Gateway (PG REST API v4, header x-api-version).
  // Both keys unset = gateway off: dev simulates ONLINE payments, production
  // refuses them with 503 (exactly the pre-gateway behavior).
  CASHFREE_APP_ID: z.string().optional(),
  CASHFREE_SECRET_KEY: z.string().optional(),
  // sandbox → https://sandbox.cashfree.com/pg · production → https://api.cashfree.com/pg
  CASHFREE_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  CASHFREE_API_VERSION: z.string().default("2023-08-01"),
  // Public origin of THIS API (e.g. https://api.example.com) — used to build
  // the webhook notify_url sent with each Cashfree order. Optional: without
  // it, configure the webhook URL in the Cashfree merchant dashboard instead.
  PUBLIC_API_URL: z.string().optional(),

  // Platform support contact — printed on the seller's Support page and
  // served to clients at GET /api/v1/public/support-contact. Defaults are the
  // live UnieMax details, so no environment has to set them to work.
  SUPPORT_EMAIL: z.string().default("support@uniemax.com"),
  SUPPORT_PHONE: z.string().default("+91 7708774542"),
  SUPPORT_HOURS: z.string().default("Mon–Sat, 10 AM – 7 PM IST"),

  // NOTE: all auth config (JWT, cookies, OTP/verification codes, OAuth) lives
  // inside the self-contained auth package (src/package/auth/core/config/env.ts),
  // not here.
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("❌ Invalid environment variables:");
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

// ---------------------------------------------------------------------------
// Boot banner — "which database am I actually talking to?" must never be a
// guess. Printed by every entrypoint (server and CLI scripts alike) before
// anything touches the DB. The password is stripped, never the host.
// ---------------------------------------------------------------------------
function dbTarget(url: string | undefined): string {
  if (!url) return "(unset)";
  try {
    return new URL(url).host;
  } catch {
    return "(unparseable)";
  }
}

// eslint-disable-next-line no-console
console.log(
  `env: mode=${appEnv} NODE_ENV=${env.NODE_ENV} db=${dbTarget(env.DATABASE_URL)} web=${process.env["PUBLIC_WEB_URL"] ?? "(unset)"}`,
);

/** `TRUST_PROXY` → Fastify's `trustProxy` (boolean, hop count, or address list). */
export function resolveTrustProxy(): boolean | number | string {
  const value = env.TRUST_PROXY.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

// ---------------------------------------------------------------------------
// Production fail-fast guards — a misconfigured production server must refuse
// to boot, not run quietly with dev defaults.
// ---------------------------------------------------------------------------
if (env.NODE_ENV === "production") {
  const problems: string[] = [];
  if (!env.DATABASE_URL) problems.push("DATABASE_URL is required");
  if (!env.DIRECT_URL) problems.push("DIRECT_URL is required (migrations)");
  if (env.CORS_ORIGIN === "*") {
    // The API is cookie-credentialed; a wildcard origin would let any site
    // ride the customer's session.
    problems.push(
      "CORS_ORIGIN must be an explicit comma-separated origin allowlist, not \"*\"",
    );
  }
  if (Boolean(env.CASHFREE_APP_ID) !== Boolean(env.CASHFREE_SECRET_KEY)) {
    // Half-configured gateway: orders would be accepted but every session
    // creation (or webhook verification) would fail at runtime.
    problems.push(
      "CASHFREE_APP_ID and CASHFREE_SECRET_KEY must be set together",
    );
  }
  if (problems.length > 0) {
    // eslint-disable-next-line no-console
    console.error("❌ Unsafe production configuration:");
    for (const problem of problems) {
      // eslint-disable-next-line no-console
      console.error(`  - ${problem}`);
    }
    process.exit(1);
  }
}

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";

export type Env = typeof env;
