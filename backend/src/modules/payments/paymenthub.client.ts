import { env } from "../../config/env.js";
import { HttpError } from "../../utils/httpError.js";

/**
 * Thin client for PaymentHub's client API (`/v1/payment-intents`,
 * `/v1/verifications/bank-account`) — the
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
  init: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string; timeoutMs?: number } = {},
): Promise<T> {
  if (!paymentHubConfigured) throw HttpError.badGateway("PaymentHub is not configured");
  const response = await fetch(`${env.PAYMENTHUB_URL}${path}`, {
    method: init.method ?? "GET",
    // The hub itself retries the gateway for up to ~15 s before answering;
    // a bank check asks the bank live and passes its own, longer timeout.
    signal: AbortSignal.timeout(init.timeoutMs ?? 25_000),
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

/**
 * A payout to a seller. The hub's payout API (its Phase 3) is not built yet:
 * this is the shape UnieMax expects, and the call is reached only when
 * PAYMENTHUB_PAYOUTS_ENABLED is true. Align it with the hub when it ships.
 */
export interface CreatePayoutInput {
  /** Our OrderPayout id — the hub echoes it back in webhooks. */
  reference: string;
  /** The seller as registered at the hub ("store_<storeId>"). */
  payeeRef: string;
  amountMinor: number;
  currency: "INR";
  metadata: { orderId: string; orderNumber: string; storeSlug: string };
}

export interface HubPayout {
  id: string;
  reference: string;
  status: string;
  amountMinor: number;
  gateway?: string | null | undefined;
  gatewayRef?: string | null | undefined;
  utr?: string | null | undefined;
  failureReason?: string | null | undefined;
}

export const paymentHubPayoutsEnabled = paymentHubConfigured && env.PAYMENTHUB_PAYOUTS_ENABLED;

export function createPayout(input: CreatePayoutInput, idempotencyKey: string): Promise<HubPayout> {
  return hubFetch<HubPayout>("/v1/payouts", { method: "POST", body: input, idempotencyKey });
}

export type HubVerificationStatus = "VALID" | "NEEDS_REVIEW" | "INVALID" | "RETRY_LATER";

/** The hub's verification object — never carries the full account number. */
export interface HubVerification {
  id: string;
  payeeRef: string;
  status: HubVerificationStatus;
  /** Masked, e.g. "XXXX1191". */
  target: string;
  details: { ifsc?: string; bankName?: string; branch?: string; city?: string } | null;
  /** Filled only when `status` is VALID. */
  registeredName: string | null;
  nameMatch: string | null;
  /** For admins only — can say the provider flagged the account as fraud. */
  reasonCode: string | null;
  reused: boolean;
}

export interface VerifyBankAccountInput {
  payeeRef: string;
  accountNumber: string;
  ifsc: string;
  accountHolder: string;
  phone?: string;
}

/** The bank is asked live (up to ~30 s on the hub's side). */
export function verifyBankAccount(
  input: VerifyBankAccountInput,
  idempotencyKey: string,
  timeoutMs: number,
): Promise<HubVerification> {
  return hubFetch<HubVerification>("/v1/verifications/bank-account", {
    method: "POST",
    body: input,
    idempotencyKey,
    timeoutMs,
  });
}
