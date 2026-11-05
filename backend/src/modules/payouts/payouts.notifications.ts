import type { FastifyBaseLogger } from "fastify";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { mailConfigured, publicWebUrl, sendMail } from "../../package/mail/index.js";
import { HttpError } from "../../utils/httpError.js";
import { resolveProfile } from "../stores/storeProfile.schema.js";
import { linkHtml, wrapHtml } from "../orders/orders.notifications.js";
import { clean, firstWaId } from "../whatsapp/whatsapp.orderMessages.js";
import { availableTemplates, sendTemplate } from "../whatsapp/whatsapp.service.js";
import { fillTemplateBody } from "../whatsapp/whatsapp.templates.js";
import { getOrderFinancials } from "../finance/finance.service.js";

/**
 * "Your payout was sent" — to the SELLER, the moment a payout becomes
 * SUCCEEDED (a manual payout recorded as sent or marked sent, or PaymentHub
 * reporting success). Email + WhatsApp; SMS is on hold.
 *
 * Exactly once per payout: it is called only by the code path that MOVED the
 * payout to SUCCEEDED (every move is a guarded update), never on a repeat.
 * Fire-and-forget: a failed message never fails the payout.
 *
 *   Email    → store's business email, else the owner's login email.
 *   WhatsApp → `seller_payout_sent` (WhatsApp Manager, Utility, en) to the
 *              store's business phone, else the owner's phone. Values {{1}}…
 *              in `payoutParams` order; button = `<slug>/earnings`.
 *              Renaming or re-ordering the template in Meta breaks this.
 */

export const PAYOUT_TEMPLATE = "seller_payout_sent";
const LANGUAGE = "en";

/** "1,349.10" — the ₹ sign is in the template / mail text. */
const num = (value: string) =>
  Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "5 Nov 2026" or "5 Nov 2026, 2:30 pm" (India time). */
function paidOn(at: Date | null, timeKnown: boolean): string {
  const when = at ?? new Date();
  return when.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(timeKnown ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

async function load(payoutId: string) {
  const payout = await prisma.orderPayout.findUnique({
    where: { id: payoutId },
    select: {
      id: true,
      status: true,
      amount: true,
      duesDeducted: true,
      payeeBank: true,
      payeeLast4: true,
      paidAt: true,
      paidAtTimeKnown: true,
      utr: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          storeName: true,
          storeSlug: true,
          total: true,
          store: { select: { name: true, slug: true, profile: true, owner: { select: { name: true, email: true, phone: true } } } },
        },
      },
    },
  });
  if (!payout || payout.status !== "SUCCEEDED" || !payout.order.store) return null;
  const fin = await getOrderFinancials(payout.order.id);
  const store = payout.order.store;
  const profile = resolveProfile(store.profile);
  return {
    sellerName: profile.sellerName ?? store.owner.name ?? "there",
    storeName: store.name ?? payout.order.storeName,
    slug: store.slug,
    email: profile.email ?? store.owner.email ?? null,
    waId: firstWaId(profile.phone, store.owner.phone),
    orderNumber: payout.order.orderNumber,
    amount: payout.amount.toFixed(2),
    orderTotal: payout.order.total.toFixed(2),
    platformFee: fin.platformFee,
    dues: payout.duesDeducted.toFixed(2),
    paidTo: payout.payeeBank ? `${payout.payeeBank} A/c XX${payout.payeeLast4 ?? ""}` : "your bank account",
    utr: payout.utr,
    paidOn: paidOn(payout.paidAt, payout.paidAt ? payout.paidAtTimeKnown : true),
  };
}

type PayoutMessage = NonNullable<Awaited<ReturnType<typeof load>>>;

/** The template's {{1}}…{{10}}, in WhatsApp Manager's order. */
export function payoutParams(m: PayoutMessage): string[] {
  return [
    clean(m.sellerName),
    clean(num(m.amount)),
    clean(m.orderNumber),
    clean(m.storeName),
    clean(num(m.orderTotal)),
    clean(num(m.platformFee)),
    clean(num(m.dues)),
    clean(m.paidTo),
    clean(m.utr),
    clean(m.paidOn),
  ];
}

function payoutMail(m: PayoutMessage, to: string) {
  const earningsUrl = publicWebUrl ? `${publicWebUrl}/mystores/${m.slug}/earnings` : null;
  const rows: [string, string][] = [
    ["Order total", `₹${num(m.orderTotal)}`],
    ["Platform fee", `₹${num(m.platformFee)}`],
    ...(Number(m.dues) > 0 ? ([["COD dues adjusted", `₹${num(m.dues)}`]] as [string, string][]) : []),
    ["Amount sent", `₹${num(m.amount)}`],
    ["Paid to", m.paidTo],
    ["Reference (UTR)", m.utr ?? "—"],
    ["Paid on", m.paidOn],
  ];
  return {
    to,
    subject: `Payout of ₹${num(m.amount)} sent — order ${m.orderNumber}`,
    text: `Hi ${m.sellerName},\n\nUnieMax has sent you a payout of ₹${num(m.amount)} for order ${m.orderNumber} from ${m.storeName}.\n\n${rows
      .map(([label, value]) => `${label}: ${value}`)
      .join("\n")}\n\nIt may take a few hours to show in your bank account.${earningsUrl ? `\n\nSee all your earnings: ${earningsUrl}` : ""}`,
    html: wrapHtml(
      "Your payout has been sent",
      `<p style="margin:0;font-size:14px;color:#444">Hi ${m.sellerName}, UnieMax has sent you
         <strong>₹${num(m.amount)}</strong> for order <strong>${m.orderNumber}</strong> from
         <strong>${m.storeName}</strong>.</p>
       <table style="margin:12px 0 0;font-size:14px;color:#444;border-collapse:collapse">
         ${rows
           .map(
             ([label, value]) =>
               `<tr><td style="padding:3px 16px 3px 0;color:#888">${label}</td><td style="padding:3px 0;color:#111">${value}</td></tr>`,
           )
           .join("")}
       </table>
       <p style="margin:12px 0 0;font-size:13px;color:#444">It may take a few hours to show in your bank account.</p>
       ${earningsUrl ? linkHtml(earningsUrl, "See all your earnings") : ""}`,
    ),
  };
}

// ---------------------------------------------------------------------------
// By hand, from the order page — preview exactly what goes out, then send
// ---------------------------------------------------------------------------

export type PayoutChannel = "email" | "whatsapp";

/** The paid payout's message, or why there is none. */
async function loadForManual(orderId: string, payoutId: string) {
  const payout = await prisma.orderPayout.findFirst({ where: { id: payoutId, orderId }, select: { status: true } });
  if (!payout) throw HttpError.notFound("Payout not found on this order");
  if (payout.status !== "SUCCEEDED") throw HttpError.conflict("Only a paid-out payout has a message to send.");
  const m = await load(payoutId);
  if (!m) throw new HttpError(422, "This order's store no longer exists — there is no seller to message.");
  return m;
}

/** Exactly what a send would deliver, without sending. */
export async function previewPayoutMessage(orderId: string, payoutId: string, channel: PayoutChannel, log: FastifyBaseLogger) {
  const m = await loadForManual(orderId, payoutId);
  if (channel === "email") {
    if (!m.email) throw new HttpError(422, "The seller has no email address.");
    const mail = payoutMail(m, m.email);
    return { channel, email: { to: mail.to, subject: mail.subject, text: mail.text, html: mail.html, delivered: mailConfigured } };
  }
  const params = payoutParams(m);
  const templates = env.WA_ENABLED ? await availableTemplates(log) : null;
  const template = templates?.find((t) => t.name === PAYOUT_TEMPLATE && t.language === LANGUAGE);
  return {
    channel,
    whatsapp: {
      // null while WhatsApp is switched off — the console can't tick it.
      to: env.WA_ENABLED ? m.waId : null,
      templateName: PAYOUT_TEMPLATE,
      language: LANGUAGE,
      bodyParams: params,
      header: template?.header ?? null,
      // null = Meta's list unreachable or the template not approved yet.
      body: template ? fillTemplateBody(template.body, params) : null,
      footer: template?.footer ?? null,
      buttons: template?.buttons ?? [],
      approved: Boolean(template),
    },
  };
}

/** Send now and wait — a refusal is thrown so the admin sees why. */
export async function sendPayoutMessage(orderId: string, payoutId: string, channel: PayoutChannel, log: FastifyBaseLogger) {
  const m = await loadForManual(orderId, payoutId);
  if (channel === "email") {
    if (!m.email) throw new HttpError(422, "The seller has no email address.");
    try {
      await sendMail(payoutMail(m, m.email));
    } catch (err) {
      log.error({ err, payoutId }, "payout email (manual) failed");
      throw new HttpError(502, "The email provider refused the message — try again in a moment.");
    }
    return { channel, to: m.email, delivered: mailConfigured };
  }
  if (!env.WA_ENABLED) throw new HttpError(503, "WhatsApp is switched off on this server.");
  if (!m.waId) throw new HttpError(422, "The seller has no usable phone number for WhatsApp.");
  const result = await sendTemplate(
    {
      to: m.waId,
      templateName: PAYOUT_TEMPLATE,
      languageCode: LANGUAGE,
      bodyParams: payoutParams(m),
      buttonParams: [`${m.slug}/earnings`],
      header: null,
    },
    log,
  );
  return { channel, to: m.waId, templateName: PAYOUT_TEMPLATE, wamid: result.messages?.[0]?.id ?? null };
}

/** Email + WhatsApp to the seller. Never throws. */
export function notifySellerPayoutSent(payoutId: string, log: FastifyBaseLogger): void {
  void (async () => {
    const m = await load(payoutId);
    if (!m) return;

    if (m.email) {
      sendMail(payoutMail(m, m.email)).catch((err: unknown) =>
        log.error({ err, payoutId }, "payout email failed"),
      );
    } else {
      log.info({ payoutId }, "payout email skipped — no seller email");
    }

    if (!env.WA_ENABLED) return;
    if (!m.waId) {
      log.info({ payoutId }, "payout WhatsApp skipped — no usable phone");
      return;
    }
    try {
      await sendTemplate(
        {
          to: m.waId,
          templateName: PAYOUT_TEMPLATE,
          languageCode: LANGUAGE,
          bodyParams: payoutParams(m),
          buttonParams: [`${m.slug}/earnings`],
          header: null,
        },
        log,
      );
      log.info({ payoutId }, "payout WhatsApp sent");
    } catch (error) {
      // 403 = not on the dev allowlist, 409 = opted out; a missing / unapproved
      // template is refused the same way until it is approved in Meta.
      const expected = error instanceof HttpError && (error.statusCode === 403 || error.statusCode === 409);
      const reason = error instanceof Error ? error.message : "Send failed";
      log[expected ? "info" : "warn"]({ payoutId, reason }, "payout WhatsApp not sent");
    }
  })().catch((err: unknown) => log.error({ err, payoutId }, "payout notification failed"));
}
