import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env, resolveTrustProxy } from "./config/env.js";
import { registerAuthPlugins } from "./package/auth/index.js";
import { registerStoragePlugins } from "./package/storage/index.js";
import { createInProcessHost, registerAffiliate } from "./package/affiliate/index.js";
import { loggerConfig } from "./utils/logger.js";
import { registerPrisma } from "./plugins/prisma.js";
import { registerRoutes } from "./routes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

/**
 * Builds and configures the Fastify application instance.
 *
 * Separated from `server.ts` (which owns the network lifecycle) so the same
 * app can be constructed for tests, scripts, or an eventual Socket.IO
 * attachment without opening a port.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerConfig,
    // Whether X-Forwarded-* headers are believed (TRUST_PROXY env):
    // true behind Nginx / a load balancer; false when exposed directly so
    // clients can't spoof their IP past the per-IP rate limits.
    trustProxy: resolveTrustProxy(),
  });

  // ---------------------------------------------------------------------------
  // Core plugins
  // ---------------------------------------------------------------------------
  // Security response headers (nosniff, HSTS, frame denial, …). CSP is off —
  // this server returns JSON and media objects, never HTML documents — and
  // cross-origin embedding stays allowed so /uploads images render on the
  // storefront origin (mirrors how S3/CDN serves them in production).
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
    credentials: true,
    // @fastify/cors v10+ defaults to GET/HEAD/POST only, which silently
    // blocks every PATCH/PUT/DELETE from a cross-origin frontend (local dev:
    // :5173 → :4000). List what the API actually uses.
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
  });

  // Abuse protection — a generous per-IP ceiling for the whole API (keyed by
  // request.ip, which honors trustProxy). Sensitive endpoints (login, OTP,
  // order placement) carry much stricter per-route overrides via
  // `config.rateLimit` where they are defined. 429s use the standard envelope
  // through the central error handler.
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
  });

  // Auth package plugins (cookie parsing for the web client profile).
  await registerAuthPlugins(app);

  // Storage package plugins (multipart uploads; /uploads static serving when
  // the local driver is active).
  await registerStoragePlugins(app);

  // Database (decorates app.prisma, opens/closes the connection)
  await registerPrisma(app);

  // ---------------------------------------------------------------------------
  // Consistent JSON error + 404 handling
  // ---------------------------------------------------------------------------
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------
  await registerRoutes(app);

  // Affiliate marketing — self-contained package, mounted under /api/v1/affiliate.
  await registerAffiliate(app, {
    prisma: app.prisma,
    host: createInProcessHost(app.prisma),
  });

  return app;
}
