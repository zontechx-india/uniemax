import { z } from "zod";

/**
 * Meta Conversions API config, read from the environment on demand.
 *
 * Kept out of `config/env.ts` so this module stays self-contained: the CAPI
 * token is optional (dev often has none), and the service's own
 * `isConfigured()` guard turns a missing token into a graceful no-op rather
 * than a boot-time failure. In production the token is set in `.env.production`
 * — see `backend/README.md`.
 */

const schema = z.object({
  META_CAPI_PIXEL_ID: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  META_CAPI_ACCESS_TOKEN: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  /**
   * The "Test event code" from Events Manager → Test events. When set, every
   * server event is tagged with it so the dashboard shows it in real time
   * instead of counting it in reporting. Leave unset in production.
   */
  META_CAPI_TEST_EVENT_CODE: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  /** Graph API version, pinned so a Meta rollout cannot change the schema. */
  META_CAPI_GRAPH_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/)
    .default("v21.0"),
});

export type MetaConfig = z.infer<typeof schema>;

export function readMetaConfig(): MetaConfig {
  return schema.parse(process.env);
}

/**
 * True when the Conversions API is wired up (pixel id + access token present).
 * Everything the module does becomes a no-op otherwise, so dev never has to
 * configure anything to run.
 */
export function isConfigured(cfg: MetaConfig = readMetaConfig()): boolean {
  return Boolean(cfg.META_CAPI_PIXEL_ID && cfg.META_CAPI_ACCESS_TOKEN);
}
