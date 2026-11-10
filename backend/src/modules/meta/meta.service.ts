import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import {
  hashEmail,
  hashExternalId,
  hashPhone,
} from "./meta.hash.js";
import { isConfigured, readMetaConfig } from "./meta.config.js";

/**
 * Meta Conversions API — server-side companion of the browser pixel.
 *
 * Only `trackSellerSignup` on the client reaches here. It posts an event with
 * the SAME `eventId` the browser used, plus `user_data` the browser cannot
 * supply reliably (hashed email, hashed phone, hashed external_id, `_fbp`,
 * `_fbc`, IP, user agent). Meta de-duplicates on `(event_name, event_id)` and
 * fills in matching from whichever of the two carried more signal — this is
 * what moves Event Match Quality up and lets Meta attribute a sign-up when
 * cookies are blocked.
 *
 * De-duplication is also enforced HERE, by customer id, with a
 * `metaSellerSignupSentAt` column: a page refresh, a re-login, a second
 * browser — none of them can double-fire the campaign-optimised
 * `CompleteRegistration`.
 */

interface SellerSignupInput {
  customerId: string;
  eventId: string;
  method: "email" | "phone_otp" | "google";
  fbp?: string | null;
  fbc?: string | null;
  eventSourceUrl?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
}

export interface SellerSignupResult {
  /** `true` on the first-ever send for this customer, `false` on repeat calls. */
  sent: boolean;
  /** Why we did not send, when `sent === false`. */
  reason?: "already_sent" | "not_configured" | "no_customer";
}

/**
 * Send the one-per-seller `CompleteRegistration` event to Meta.
 *
 * Returns `{ sent: false, reason: ... }` on repeat calls (idempotent) and on
 * misconfiguration (dev / missing token). Never throws for Meta's own
 * failures — a 500 from the Graph API must not break the sign-up flow — but
 * does throw if the customer does not exist (that is a programming error, not
 * an operational one).
 */
export async function sendSellerSignup(
  input: SellerSignupInput,
): Promise<SellerSignupResult> {
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: {
      id: true,
      email: true,
      phone: true,
      metaSellerSignupSentAt: true,
    },
  });
  if (!customer) throw HttpError.notFound("Customer not found.");

  // Once per customer, forever.
  if (customer.metaSellerSignupSentAt) {
    return { sent: false, reason: "already_sent" };
  }

  const cfg = readMetaConfig();
  if (!isConfigured(cfg)) {
    // Even without Meta configured, record the "sent" marker so no later
    // request can retry and double-fire once a token is eventually added.
    await prisma.customer.update({
      where: { id: customer.id },
      data: { metaSellerSignupSentAt: new Date() },
    });
    return { sent: false, reason: "not_configured" };
  }

  const eventTime = Math.floor(Date.now() / 1000);
  const userData: Record<string, unknown> = {
    em: hashEmail(customer.email) ? [hashEmail(customer.email)] : undefined,
    ph: hashPhone(customer.phone) ? [hashPhone(customer.phone)] : undefined,
    external_id: [hashExternalId(customer.id)],
    client_ip_address: input.clientIp ?? undefined,
    client_user_agent: input.userAgent ?? undefined,
    fbp: input.fbp ?? undefined,
    fbc: input.fbc ?? undefined,
  };

  // Strip undefined keys so the Graph API does not reject the payload.
  for (const key of Object.keys(userData)) {
    if (userData[key] === undefined) delete userData[key];
  }

  const payload = {
    data: [
      {
        event_name: "CompleteRegistration",
        event_time: eventTime,
        event_id: input.eventId,
        action_source: "website",
        event_source_url: input.eventSourceUrl ?? undefined,
        user_data: userData,
        custom_data: {
          content_name: "Seller account",
          registration_method: input.method,
          status: true,
        },
      },
    ],
    ...(cfg.META_CAPI_TEST_EVENT_CODE
      ? { test_event_code: cfg.META_CAPI_TEST_EVENT_CODE }
      : {}),
  };

  const url = `https://graph.facebook.com/${cfg.META_CAPI_GRAPH_VERSION}/${cfg.META_CAPI_PIXEL_ID}/events?access_token=${encodeURIComponent(cfg.META_CAPI_ACCESS_TOKEN!)}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      // Log and give up — do NOT persist the "sent" marker, so a later retry
      // (manual or automated) can still deliver this event.
      const body = await response.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.warn(
        `[meta/capi] CompleteRegistration failed: ${response.status} ${body.slice(0, 300)}`,
      );
      return { sent: false, reason: "not_configured" };
    }
  } catch (err) {
    // Network blip — same reasoning: do not mark as sent.
    // eslint-disable-next-line no-console
    console.warn(`[meta/capi] CompleteRegistration network error: ${String(err)}`);
    return { sent: false, reason: "not_configured" };
  }

  await prisma.customer.update({
    where: { id: customer.id },
    data: { metaSellerSignupSentAt: new Date() },
  });

  return { sent: true };
}
