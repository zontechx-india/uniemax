import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

/**
 * Bank account numbers at rest — AES-256-GCM, reversible with the server's
 * `BANK_DATA_KEY` (32 random bytes, base64). Stored form:
 * `enc:v1:<base64 iv | tag | ciphertext>`; a value without the prefix is a
 * legacy plain number and is read as is (the boot backfill seals those).
 *
 * Encryption is random (new IV each time), so the same number never looks
 * the same twice — lookups and the "already saved" unique index use
 * `bankNumberIndex()`, a keyed HMAC of the number, instead.
 *
 * LOSING THE KEY LOSES EVERY STORED NUMBER. Keep a copy outside the server.
 * Wired into Prisma in `config/prisma.ts`; services never call this directly.
 */

const PREFIX = "enc:v1:";
let keys: { enc: Buffer; index: Buffer } | null = null;

function getKeys() {
  if (keys) return keys;
  const master = Buffer.from(env.BANK_DATA_KEY ?? "", "base64");
  if (master.length !== 32) {
    throw new Error(
      "BANK_DATA_KEY must be 32 random bytes, base64 — generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  // Two keys from one secret: one encrypts, one only fingerprints.
  const derive = (info: string) => Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), info, 32));
  keys = { enc: derive("uniemax/bank/enc"), index: derive("uniemax/bank/index") };
  return keys;
}

export function isSealed(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function sealBankNumber(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKeys().enc, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function openBankNumber(stored: string): string {
  if (!isSealed(stored)) return stored;
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const decipher = createDecipheriv("aes-256-gcm", getKeys().enc, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

/** Same number → same value, without revealing it. For lookups and uniqueness. */
export function bankNumberIndex(plain: string): string {
  return createHmac("sha256", getKeys().index).update(plain).digest("hex");
}
