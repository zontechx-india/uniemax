import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  ParsedInbound,
  ParsedStatus,
  ParsedWebhook,
  WaInboundMessageWire,
  WaStatusWire,
  WaWebhookPayload,
} from "./whatsapp.types.js";

/**
 * Pure webhook logic — signature check and payload parsing. Deliberately free
 * of env, Prisma and Fastify so the unit tests (test/unit/whatsapp.test.ts)
 * run without a database or a booted server.
 */

/**
 * `X-Hub-Signature-256: sha256=<hex HMAC-SHA256(appSecret, rawBody)>`.
 * Constant-time comparison; any malformed header is simply "not valid".
 */
export function verifySignature(
  rawBody: Buffer,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!header || !header.startsWith("sha256=") || !appSecret) return false;
  const received = Buffer.from(header.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  // Buffer.from(…, "hex") silently drops invalid characters, so a length
  // mismatch covers both "wrong length" and "not hex".
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

/** STOP / UNSUBSCRIBE opt out, START opts back in — whole message, any case. */
export function optIntent(body: string | null): "out" | "in" | null {
  const word = body?.trim().toUpperCase();
  if (word === "STOP" || word === "UNSUBSCRIBE") return "out";
  if (word === "START") return "in";
  return null;
}

const MEDIA_TYPES = ["image", "video", "audio", "document", "sticker"] as const;

function parseMessage(
  message: WaInboundMessageWire,
  names: Map<string, string>,
): ParsedInbound | null {
  if (!message.id || !message.from) return null;
  const type = message.type ?? "unknown";
  let body: string | null = null;
  let mediaId: string | null = null;

  if (type === "text") {
    body = message.text?.body ?? null;
  } else if (type === "button") {
    body = message.button?.text ?? message.button?.payload ?? null;
  } else if (type === "interactive") {
    const reply = message.interactive?.button_reply ?? message.interactive?.list_reply;
    body = reply?.title ?? reply?.id ?? null;
  } else if ((MEDIA_TYPES as readonly string[]).includes(type)) {
    const media = message[type as (typeof MEDIA_TYPES)[number]];
    mediaId = media?.id ?? null;
    body = media?.caption ?? media?.filename ?? null;
  }

  return {
    wamid: message.id,
    waId: message.from,
    name: names.get(message.from) ?? null,
    type,
    body,
    mediaId,
  };
}

function parseStatus(status: WaStatusWire): ParsedStatus | null {
  if (!status.id || !status.status || !status.recipient_id) return null;
  const seconds = Number(status.timestamp);
  const error = status.errors?.[0];
  return {
    wamid: status.id,
    status: status.status,
    recipientId: status.recipient_id,
    statusTimestamp: Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date(),
    errorCode: error?.code ?? null,
    errorTitle: error?.title ?? null,
    errorMessage: error?.message ?? null,
    errorDetails: error?.error_data?.details ?? null,
  };
}

/**
 * Flattens entry[].changes[].value into the inbound messages and status
 * updates it carries. Tolerant by design: a malformed item is skipped, never
 * thrown on, so one bad element cannot drop the rest of the batch.
 */
export function parseWebhookPayload(payload: unknown): ParsedWebhook {
  const result: ParsedWebhook = { messages: [], statuses: [] };
  if (!payload || typeof payload !== "object") return result;

  for (const entry of (payload as WaWebhookPayload).entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      if (!value) continue;

      const names = new Map<string, string>();
      for (const contact of value.contacts ?? []) {
        if (contact?.wa_id && contact.profile?.name) {
          names.set(contact.wa_id, contact.profile.name);
        }
      }
      for (const message of value.messages ?? []) {
        const parsed = message && parseMessage(message, names);
        if (parsed) result.messages.push(parsed);
      }
      for (const status of value.statuses ?? []) {
        const parsed = status && parseStatus(status);
        if (parsed) result.statuses.push(parsed);
      }
    }
  }
  return result;
}

/** Digits only — the form Meta uses for wa_id ("+91 98765-43210" → "919876543210"). */
export function normalizeWaId(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Parses WA_DEV_ALLOWED_RECIPIENTS into a set of normalised numbers. */
export function parseAllowlist(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((n) => normalizeWaId(n))
      .filter(Boolean),
  );
}

/**
 * Any common spelling of a number → Meta's wa_id. A bare 10-digit Indian
 * mobile gets 91; anything else must already carry its country code.
 */
export function toWaId(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) {
    // Ten digits is an Indian mobile without its code — or ambiguous.
    return /^[6-9]/.test(digits) ? `91${digits}` : null;
  }
  return /^\d{8,15}$/.test(digits) ? digits : null;
}
