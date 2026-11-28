import { env } from "../../config/env.js";

/**
 * PolicyHub config. `project` scopes every query — it comes from the env
 * (POLICY_PROJECT, default "uniemax"), never from a request.
 */
export const policyConfig = {
  project: env.POLICY_PROJECT,
};
