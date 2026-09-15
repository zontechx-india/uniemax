import type { AffiliateDeps } from "./types.js";

// Filled once by registerAffiliate(). Services read from here so the package
// never imports the app's own Prisma instance or modules.
export const deps = {} as AffiliateDeps;
