import type { FastifyPluginAsync } from "fastify";
import * as controller from "./pageShell.controller.js";

/**
 * Storefront pages served as HTML — mounted at the ROOT, on the pages' own
 * URLs, because nginx forwards those navigations here untouched
 * (`docs/DEPLOYMENT.md` → Page shells). Everything else the SPA serves stays
 * a static file.
 *
 * `helmet: false`: these responses replace what nginx served as a static
 * file, and must carry the same headers that file did. Helmet's defaults are
 * written for a JSON API — `Referrer-Policy: no-referrer` on a *document*
 * would strip the referrer from every request the page makes afterwards,
 * including the Google Maps script whose API key is restricted by referrer.
 */
export const pageShellRoutes: FastifyPluginAsync = async (app) => {
  app.get("/store/*", { helmet: false }, controller.storePage);
  app.get("/c/*", { helmet: false }, controller.browsePage);
};
