import {
  hashPassword,
  verifyPassword,
  passwordNeedsRehash,
} from "../../../../utils/password.js";
import type { PasswordHasher } from "../provider.types.js";

/**
 * bcrypt password hasher — the one provider that is already **real**: hashing
 * is local, so email/password auth works end-to-end with no external service.
 * (Delegates to `utils/password.ts` so the `create-admin` script and the
 * package share one implementation.)
 */
export const bcryptPasswordHasher: PasswordHasher = {
  hash: hashPassword,
  verify: verifyPassword,
  needsRehash: passwordNeedsRehash,
};
