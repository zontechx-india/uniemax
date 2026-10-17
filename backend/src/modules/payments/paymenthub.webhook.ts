import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Pure PaymentHub webhook logic — signature check, envelope parsing and the
 * "what should this event do to this order" decision. Deliberately free of
 * Prisma and Fastify so it is unit-testable (test/unit/paymenthub-webhook.test.ts);
 * the I/O lives in paymenthub.service.ts.
 *
 * Contract (set by the hub — see docs/API.md → PaymentHub webhook):
 *
 *   PaymentHub-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, `${t}.${rawBody}`)>
 *   body: { id: "evt_…", type, createdAt, mode: "LIVE" | "TEST", data }
 *
 * Delivery is at-least-once and may be out of order, so every decision here
 * only ever moves an order's payment state forward.
 */

/** Signed timestamps older/newer than this are replays or clock trouble. */
export const SIGNATURE_TOLERANCE_SEC = 300;

interface ParsedSignature {
  t: number;
  v1: string[];
}

/** `t=…,v1=…` → parts, or null when anything is missing or malformed. */
export function parseSignatureHeader(header: string | undefined): ParsedSignature | null {
  if (!header) return null;
  let t: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) return null;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") {
      if (t !== null || !/^\d{1,12}$/.test(value)) return null;
      t = Number(value);
    } else if (key === "v1") {
      // HMAC-SHA256 → exactly 32 bytes of hex.
      if (!/^[0-9a-f]{64}$/i.test(value)) return null;
      v1.push(value.toLowerCase());
    }
    // Unknown keys (future schemes) are ignored, as with Stripe-style headers.
  }
  if (t === null || v1.length === 0) return null;
  return { t, v1 };
}

/**
 * Verify over the EXACT raw bytes the hub sent — the route parses the body
 * as a Buffer for this reason. Constant-time compare on equal-length buffers.
 */
export function verifyPaymentHubSignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret) return false;
  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;
  if (Math.abs(nowSec - parsed.t) > SIGNATURE_TOLERANCE_SEC) return false;

  const expected = createHmac("sha256", secret)
    .update(Buffer.concat([Buffer.from(`${parsed.t}.`, "utf8"), rawBody]))
    .digest();
  return parsed.v1.some((hex) => {
    const received = Buffer.from(hex, "hex");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

// ---------------------------------------------------------------------------
// Envelope + event data
// ---------------------------------------------------------------------------

export const envelopeSchema = z.object({
  id: z.string().min(1).max(255),
  type: z.string().min(1).max(100),
  createdAt: z.string(),
  mode: z.enum(["LIVE", "TEST"]),
  data: z.record(z.string(), z.unknown()),
});
export type HubEnvelope = z.infer<typeof envelopeSchema>;

const amountMinor = z.number().int().nonnegative().refine(Number.isSafeInteger);

const intentSchema = z.object({
  id: z.string().min(1),
  reference: z.string().min(1),
  status: z.string(),
  amountMinor,
  currency: z.string().optional(),
  lateCapture: z.boolean().optional(),
  gatewayPaymentId: z.string().nullish(),
  failureReason: z.string().nullish(),
  metadata: z
    .object({ orderId: z.string().optional(), storeSlug: z.string().optional() })
    .loose()
    .nullish(),
});
export type HubIntent = z.infer<typeof intentSchema>;

const refundSchema = z.object({
  id: z.string().min(1),
  intentId: z.string().min(1),
  reference: z.string(),
  amountMinor,
  status: z.string(),
});

export const PAYMENT_EVENTS = [
  "payment.succeeded",
  "payment.failed",
  "payment.expired",
  "payment.cancelled",
] as const;
export const REFUND_EVENTS = ["refund.succeeded", "refund.failed"] as const;

export type HubEvent =
  | { kind: "payment"; type: (typeof PAYMENT_EVENTS)[number]; intent: HubIntent }
  | { kind: "refund"; type: (typeof REFUND_EVENTS)[number]; refund: z.infer<typeof refundSchema> }
  | { kind: "unknown"; type: string };

/** Envelope `data` → typed event. Throws ZodError on a malformed known type. */
export function parseEventData(envelope: HubEnvelope): HubEvent {
  const { type } = envelope;
  if ((PAYMENT_EVENTS as readonly string[]).includes(type)) {
    const { intent } = z.object({ intent: intentSchema }).parse(envelope.data);
    return { kind: "payment", type: type as (typeof PAYMENT_EVENTS)[number], intent };
  }
  if ((REFUND_EVENTS as readonly string[]).includes(type)) {
    const { refund } = z.object({ refund: refundSchema }).parse(envelope.data);
    return { kind: "refund", type: type as (typeof REFUND_EVENTS)[number], refund };
  }
  return { kind: "unknown", type };
}

/** Production takes LIVE events only; other environments accept both. */
export function acceptsMode(mode: HubEnvelope["mode"], isProduction: boolean): boolean {
  return isProduction ? mode === "LIVE" : true;
}

/**
 * A Decimal(10,2) rupee amount → integer paise, by string maths (never
 * floats): "1234.5" → 123450n. Null when the value is not a plain amount.
 */
export function rupeesToPaise(value: { toFixed(digits: number): string }): bigint | null {
  const match = /^(\d+)\.(\d{2})$/.exec(value.toFixed(2));
  return match ? BigInt(match[1]! + match[2]!) : null;
}

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

/** The order fields a decision needs. */
export interface OrderSnapshot {
  id: string;
  orderNumber: string;
  storeSlug: string;
  total: { toFixed(digits: number): string };
  paymentMethod: string;
  paymentStatus: string;
  paymentIntentId: string | null;
}

/** Payment statuses each transition may start from — the update guards. */
export const PAID_FROM = ["PENDING", "FAILED"] as const;
export const FAILED_FROM = ["PENDING"] as const;

export type Decision =
  | { action: "markPaid"; paymentRef: string; lateCapture: boolean }
  | { action: "markFailed" }
  | { action: "ignore"; level: "info" | "warn" | "error"; reason: string };

/**
 * What a payment event should do to its order. Forward-only: a failure,
 * expiry or cancellation never touches an order that is no longer PENDING,
 * and the DB update repeats the same guard (FAILED_FROM / PAID_FROM) so a
 * race between deliveries can't undo a payment either.
 */
export function decide(
  event: Extract<HubEvent, { kind: "payment" }>,
  order: OrderSnapshot,
): Decision {
  const { intent } = event;
  if (intent.reference !== order.orderNumber) {
    return { action: "ignore", level: "error", reason: "reference does not match the order number" };
  }
  if (intent.metadata?.storeSlug && intent.metadata.storeSlug !== order.storeSlug) {
    return { action: "ignore", level: "error", reason: "metadata.storeSlug does not match the order" };
  }
  if (order.paymentMethod !== "ONLINE") {
    return { action: "ignore", level: "error", reason: "order is not an ONLINE-payment order" };
  }

  if (event.type === "payment.succeeded") {
    if (intent.currency && intent.currency !== "INR") {
      return { action: "ignore", level: "error", reason: `unexpected currency ${intent.currency}` };
    }
    const expected = rupeesToPaise(order.total);
    if (expected === null || BigInt(intent.amountMinor) !== expected) {
      // Money for the wrong amount is never marked PAID silently.
      return {
        action: "ignore",
        level: "error",
        reason: `amount mismatch: got ${intent.amountMinor} paise, order total is ${expected ?? "unparseable"} paise`,
      };
    }
    if (!(PAID_FROM as readonly string[]).includes(order.paymentStatus)) {
      return { action: "ignore", level: "info", reason: `already ${order.paymentStatus}` };
    }
    // A real payment is recorded even for a superseded intent — losing
    // money would be worse; markOrderPaid's CANCELLED branch alerts ops.
    return {
      action: "markPaid",
      paymentRef: intent.gatewayPaymentId || intent.id,
      lateCapture: intent.lateCapture === true,
    };
  }

  // payment.failed / payment.expired / payment.cancelled
  if (order.paymentIntentId && order.paymentIntentId !== intent.id) {
    return { action: "ignore", level: "info", reason: "event is for a superseded intent" };
  }
  if (!(FAILED_FROM as readonly string[]).includes(order.paymentStatus)) {
    return { action: "ignore", level: "info", reason: `already ${order.paymentStatus} — forward-only` };
  }
  return { action: "markFailed" };
}
