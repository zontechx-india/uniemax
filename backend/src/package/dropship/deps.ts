import type { DropshipDeps } from "./types.js";

// Filled once by registerDropship(). Services read from here so the package
// never imports the app's own Prisma instance or modules.
export const deps = {} as DropshipDeps;
