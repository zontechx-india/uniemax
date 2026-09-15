import { randomBytes } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import { affiliateConfig } from "./config.js";

/**
 * Pure rules — no database, no HTTP. Everything here works the same in-process
 * or in a standalone service, which is why it is kept apart from the services.
 */

export type CommissionType = "PERCENTAGE" | "FIXED";

export interface Rate {
  type: CommissionType;
  rate: Prisma.Decimal;
}

interface RateSource {
  commissionType: CommissionType | null;
  commissionRate: Prisma.Decimal | null;
}

/**
 * Most specific rule wins: product rule → affiliate override → programme
 * default. A product switched off yields null, meaning no commission at all.
 */
export function resolveRate(
  program: { commissionType: CommissionType; commissionRate: Prisma.Decimal },
  affiliate?: RateSource | null,
  product?: (RateSource & { enabled: boolean }) | null,
): Rate | null {
  if (product && !product.enabled) return null;
  for (const source of [product, affiliate]) {
    if (source?.commissionRate != null) {
      return {
        type: source.commissionType ?? program.commissionType,
        rate: source.commissionRate,
      };
    }
  }
  return { type: program.commissionType, rate: program.commissionRate };
}

export function commissionAmount(
  rate: Rate,
  lineTotal: Prisma.Decimal,
  quantity: number,
): Prisma.Decimal {
  const raw =
    rate.type === "PERCENTAGE"
      ? lineTotal.mul(rate.rate).div(100)
      : rate.rate.mul(quantity);
  return raw.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Percentages are capped by the platform; fixed amounts are the seller's call. */
export function rateAllowed(type: CommissionType, rate: number): boolean {
  return type !== "PERCENTAGE" || rate <= affiliateConfig.maxPercent;
}

// No 0/O/1/I so a token read off a screen is never ambiguous.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function newToken(length = 8): string {
  let out = "";
  for (const byte of randomBytes(length)) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

export function daysFromNow(days: number, from = new Date()): Date {
  return new Date(from.getTime() + days * 86_400_000);
}

export function money(value: Prisma.Decimal | null | undefined): number | null {
  return value == null ? null : Number(value);
}

/** Drops undefined keys so a partial patch can be handed straight to Prisma. */
export function compact<T extends object>(
  input: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as { [K in keyof T]?: Exclude<T[K], undefined> };
}
