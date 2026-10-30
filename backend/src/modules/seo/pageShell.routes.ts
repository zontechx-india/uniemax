import type { FastifyPluginAsync } from "fastify";
import * as controller from "./pageShell.controller.js";
import { INFO_PAGES, LISTING_PAGES } from "./pageShell.service.js";

/**
 * Storefront pages served as HTML — mounted at the ROOT, on the pages' own
 * URLs, because nginx forwards those navigations here untouched
 * (`docs/DEPLOYMENT.md` → Page shells). These are every page a search engine
 * or a shared link should land on; everything else the SPA serves (cart,
 * checkout, account, the seller console) stays a static file.
 *
 * `helmet: false`: these responses replace what nginx served as a static
 * file, and must carry the same headers that file did. Helmet's defaults are
 * written for a JSON API — `Referrer-Policy: no-referrer` on a *document*
 * would strip the referrer from every request the page makes afterwards,
 * including the Google Maps script whose API key is restricted by referrer.
 */
export const pageShellRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { helmet: false }, controller.homePage);
  app.get("/sell", { helmet: false }, controller.sellPage);
  app.get("/store/*", { helmet: false }, controller.storePage);
  app.get("/c/*", { helmet: false }, controller.browsePage);
  for (const path of Object.keys(INFO_PAGES)) {
    app.get(path, { helmet: false }, controller.infoPage);
  }
  for (const path of Object.keys(LISTING_PAGES)) {
    app.get(path, { helmet: false }, controller.listingPage);
  }
};
