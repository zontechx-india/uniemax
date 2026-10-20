import type { Prisma } from "../../generated/prisma/client.js";

/**
 * Synchronous hooks — the other half of the event bus. Where an event says
 * "this happened" after the fact, a hook runs INSIDE the core's own action
 * (most inside its transaction) and may refuse it by throwing an
 * `HttpError`, which rolls the whole action back. Packages register at boot;
 * the core never knows who is listening. With nothing registered every hook
 * is a no-op, so the core behaves exactly as if this file did not exist.
 *
 * Rules: docs/dropshipping/architecture/context.md (Hooks).
 */

/** A line of a cart at checkout, as the checkout-options hook sees it. */
export interface CheckoutLine {
  productId: string;
  variantId: string | null;
  quantity: number;
}

/** Why a checkout option is unavailable — shown to the shopper; null = allowed. */
export interface CheckoutRestrictions {
  cod?: string | null;
  pickup?: string | null;
}

/** What a seller is about to save on a product (the parsed request body). */
export interface ProductChange {
  kind: "update" | "options" | "variant" | "copy";
  variantId?: string;
  input: Readonly<Record<string, unknown>>;
}

export interface AppHooks {
  /** Inside the placement transaction, after the order and its lines exist. */
  "order.placing": (tx: Prisma.TransactionClient, orderId: string) => Promise<void>;
  /** Inside the gateway-undo transaction, before the order is deleted. */
  "order.unplacing": (tx: Prisma.TransactionClient, orderId: string) => Promise<void>;
  /** Inside a seller's or buyer's cancel transaction, after its guarded write. */
  "order.cancelling": (tx: Prisma.TransactionClient, orderId: string) => Promise<void>;
  /** Checkout quote and placement: restrict COD or pickup, with the reason. */
  "checkout.options": (
    storeId: string,
    lines: CheckoutLine[],
  ) => Promise<CheckoutRestrictions>;
  /** Before a product save in the editor — veto only. */
  "product.saving": (productId: string, change: ProductChange) => Promise<void>;
}

type HookName = keyof AppHooks;
type AnyHook = (...args: never[]) => Promise<unknown>;

const registry = new Map<HookName, AnyHook[]>();

/** Register a hook. Hooks of one name run in registration order. */
export function hook<K extends HookName>(name: K, fn: AppHooks[K]): void {
  const list = registry.get(name) ?? [];
  list.push(fn as unknown as AnyHook);
  registry.set(name, list);
}

/**
 * Run every hook of `name`, one after another, awaiting each. A hook that
 * throws stops the rest and the error reaches the caller (and its
 * transaction).
 */
export async function runHooks<K extends Exclude<HookName, "checkout.options">>(
  name: K,
  ...args: Parameters<AppHooks[K]>
): Promise<void> {
  for (const fn of registry.get(name) ?? []) {
    await (fn as unknown as (...a: Parameters<AppHooks[K]>) => Promise<void>)(...args);
  }
}

/** Every checkout-options hook's answer merged — the first reason for each option wins. */
export async function checkoutRestrictions(
  storeId: string,
  lines: CheckoutLine[],
): Promise<{ cod: string | null; pickup: string | null }> {
  const merged = { cod: null as string | null, pickup: null as string | null };
  for (const fn of registry.get("checkout.options") ?? []) {
    const answer = await (fn as unknown as AppHooks["checkout.options"])(storeId, lines);
    merged.cod ??= answer.cod ?? null;
    merged.pickup ??= answer.pickup ?? null;
  }
  return merged;
}

/** Tests only: forget every registered hook. */
export function resetHooksForTests(): void {
  registry.clear();
}
