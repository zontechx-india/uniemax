import { env } from "../../config/env.js";
import { HttpError } from "../../utils/httpError.js";

/**
 * Thin client for PaymentHub's client API (`/v1/payment-intents`) — the
 * hub's docs/API.md §1. Server-to-server only; the API key never leaves this
 * process. Each environment talks to its own hub (dev → pay.dev, TEST key,
 * Cashfree sandbox; prod → pay, LIVE key).
 */

export const paymentHubConfigured = Boolean(env.PAYMENTHUB_URL && env.PAYMENTHUB_API_KEY);

export type HubIntentStatus =
  | "CREATED"
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED";

export interface HubIntent {
  id: string;
  status: HubIntentStatus;
  reference: string;
  amountMinor: number;
  currency: string;
  lateCapture: boolean;
  gatewayPaymentId: string | null;
  metadata: { orderId?: string; storeSlug?: string } | null;
  /** Present only while the intent can be paid. */
  checkout?: { gateway: string; sessionId: string; mode: "sandbox" | "production" } | null;
}

/** A hub refusal with its stable error code (REFERENCE_IN_USE, INVALID_STATE, …). */
export class HubApiError extends HttpError {
  constructor(
    readonly hubStatus: number,
    readonly hubCode: string,
    message: string,
  ) {
    super(502, `PaymentHub: ${message}`);
  }
}

async function hubFetch<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  if (!paymentHubConfigured) throw HttpError.badGateway("PaymentHub is not configured");
  const response = await fetch(`${env.PAYMENTHUB_URL}${path}`, {
    method: init.method ?? "GET",
    // The hub itself retries the gateway for up to ~15 s before answering.
    signal: AbortSignal.timeout(25_000),
    headers: {
      authorization: `Bearer ${env.PAYMENTHUB_API_KEY}`,
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(init.idempotencyKey ? { "idempotency-key": init.idempotencyKey } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const json = (await response.json().catch(() => null)) as
    | { success: true; data: T }
    | { success: false; error?: { code?: string; message?: string } }
    | null;
  if (!response.ok || !json || json.success !== true) {
    const error = json && json.success === false ? json.error : undefined;
    throw new HubApiError(response.status, error?.code ?? "UNKNOWN", error?.message ?? `HTTP ${response.status}`);
  }
  return json.data;
}

export interface CreateIntentInput {
  reference: string;
  amountMinor: number;
  customer: { id: string; name?: string; email?: string; phone?: string };
  returnUrl?: string;
  metadata: { orderId: string; storeSlug: string };
}

export function createIntent(input: CreateIntentInput, idempotencyKey: string): Promise<HubIntent> {
  return hubFetch<HubIntent>("/v1/payment-intents", { method: "POST", body: input, idempotencyKey });
}

/** `refresh` asks the gateway first while the intent is still open. */
export function getIntent(id: string, refresh = false): Promise<HubIntent> {
  return hubFetch<HubIntent>(`/v1/payment-intents/${encodeURIComponent(id)}${refresh ? "?refresh=true" : ""}`);
}

/** Same session while it is live; a new one after a failure or expiry. */
export function retryIntent(id: string, idempotencyKey: string): Promise<HubIntent> {
  return hubFetch<HubIntent>(`/v1/payment-intents/${encodeURIComponent(id)}/retry`, { method: "POST", body: {}, idempotencyKey });
}

export function cancelIntent(id: string, idempotencyKey: string): Promise<HubIntent> {
  return hubFetch<HubIntent>(`/v1/payment-intents/${encodeURIComponent(id)}/cancel`, { method: "POST", body: {}, idempotencyKey });
}
