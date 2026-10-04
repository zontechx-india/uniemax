import bcrypt from "bcrypt";

/**
 * bcrypt work factor for NEW hashes. Existing hashes keep their own cost
 * (it is encoded in the hash) and still verify; sign-in upgrades them via
 * `needsRehash`.
 */
const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** True when a stored hash was made with a lower work factor than today's. */
export function passwordNeedsRehash(hash: string): boolean {
  try {
    return bcrypt.getRounds(hash) < SALT_ROUNDS;
  } catch {
    return false;
  }
}
