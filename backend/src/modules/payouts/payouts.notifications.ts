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
import { decimalToPaise, paiseToAmount, payoutTotals } from "./payouts.rules.js";

/**
 * "Your payout was sent" — to the SELLER, the moment a payout becomes
 * SUCCEEDED (a manual payout recorded as sent or marked sent, or PaymentHub
 * reporting success), and by hand from the order page. Email + WhatsApp;
 * SMS is on hold.
 *
 * Exactly once automatically: called only by the code path that MOVED the
 * payout to SUCCEEDED (every move is a guarded update), never on a repeat.
 * Fire-and-forget: a failed message never fails the payout.
 *
 *   Email    → store's business email, else the owner's login email.
 *   WhatsApp → store's business phone, else the owner's phone. Template:
 *     `seller_payout_sent_v3` (14 values — the gateway fee, UnieMax's
 *     discount on it and the amount sent, each on its own line). An ADVANCE
 *     (paid before delivery) uses `seller_advance_sent` (10 values, says it
 *     is an advance and what is still to come). The header is fixed text, so
 *     only body + button values are sent. Button = `<slug>/earnings`.
 *     Renaming or re-ordering a template in Meta breaks this — the value
 *     order is `payoutParams` / `advanceParams`.
 */

export const PAYOUT_TEMPLATE = "seller_payout_sent_v3";
export const ADVANCE_TEMPLATE = "seller_advance_sent";
const LANGUAGE = "en";

/** "1,349.10" — the ₹ sign is in the template / mail text. */
const num = (value: string) =>
  Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "2.00" → "2%", "2.50" → "2.5%". */
const pct = (value: string) => `${Number(value)}%`;

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
      isAdvance: true,
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
  // What is still to come on the order after this payout (an advance's message says it).
  const rows = await prisma.orderPayout.findMany({
    where: { orderId: payout.order.id },
    select: { status: true, amount: true, duesDeducted: true },
  });
  const totals = payoutTotals(
    fin.sellerEarningPaise,
    rows.map((row) => ({ status: row.status, amountPaise: decimalToPaise(row.amount), duesPaise: decimalToPaise(row.duesDeducted) })),
  );
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
    gatewayFee: fin.gatewayFee,
    gatewayPercent: fin.gatewayFeePercent,
    /** UnieMax's discount on the gateway fee: the whole fee while UnieMax pays
     *  it (the seller keeps the full amount), else 0 (taken from the payout). */
    gatewayDiscount: fin.gatewayFeeBearer === "PLATFORM" ? fin.gatewayFee : "0.00",
    dues: payout.duesDeducted.toFixed(2),
    paidTo: payout.payeeBank ? `${payout.payeeBank} A/c XX${payout.payeeLast4 ?? ""}` : "your bank account",
    utr: payout.utr,
    paidOn: paidOn(payout.paidAt, payout.paidAt ? payout.paidAtTimeKnown : true),
    /** Paid before the order was delivered. */
    isAdvance: payout.isAdvance,
    /** What the seller earns on the order (total − fees). */
    earning: fin.sellerEarning,
    /** Earning − everything paid or on its way — what comes after delivery. */
    stillToCome: paiseToAmount(totals.remaining),
  };
}

type PayoutMessage = NonNullable<Awaited<ReturnType<typeof load>>>;

/** `seller_payout_sent_v3` — {{1}}…{{14}}, in WhatsApp Manager's order. */
export function payoutParams(m: PayoutMessage): string[] {
  return [
    clean(m.sellerName),
    clean(num(m.amount)),
    clean(m.orderNumber),
    clean(m.storeName),
    clean(num(m.orderTotal)),
    clean(num(m.platformFee)),
    clean(pct(m.gatewayPercent)),
    clean(num(m.gatewayFee)),
    clean(num(m.gatewayDiscount)),
    clean(num(m.dues)),
    clean(num(m.amount)),
    clean(m.paidTo),
    clean(m.utr),
    clean(m.paidOn),
  ];
}

/** `seller_advance_sent` — {{1}}…{{10}}, in WhatsApp Manager's order. */
export function advanceParams(m: PayoutMessage): string[] {
  return [
    clean(m.sellerName),
    clean(num(m.amount)),
    clean(m.orderNumber),
    clean(m.storeName),
    clean(num(m.orderTotal)),
    clean(num(m.earning)),
    clean(num(m.stillToCome)),
    clean(m.paidTo),
    clean(m.utr),
    clean(m.paidOn),
  ];
}

/**
 * An advance → `seller_advance_sent`; any other payout → `seller_payout_sent_v3`.
 * `template` = Meta's approved copy, for the preview (null while it is not
 * approved or Meta's list can't be read — the send is tried either way).
 */
async function chooseTemplate(m: PayoutMessage, log: FastifyBaseLogger) {
  const templates = env.WA_ENABLED ? await availableTemplates(log) : null;
  const find = (name: string) => templates?.find((t) => t.name === name && t.language === LANGUAGE) ?? null;
  if (m.isAdvance) return { name: ADVANCE_TEMPLATE, params: advanceParams(m), template: find(ADVANCE_TEMPLATE) };
  return { name: PAYOUT_TEMPLATE, params: payoutParams(m), template: find(PAYOUT_TEMPLATE) };
}

/** Why an advance is different — said once in the mail. */
const ADVANCE_NOTE =
  "This is an advance: the order is not delivered yet. If it is cancelled or refunded, this amount is taken back from your next payouts.";

function payoutMail(m: PayoutMessage, to: string) {
  const earningsUrl = publicWebUrl ? `${publicWebUrl}/mystores/${m.slug}/earnings` : null;
  // Same lines as the WhatsApp message: the fee, then UnieMax's discount on it.
  const gateway: [string, string][] =
    Number(m.gatewayFee) > 0
      ? [
          [`Payment gateway fee (${pct(m.gatewayPercent)})`, `₹${num(m.gatewayFee)}`],
          ["UnieMax discount on gateway fee", `₹${num(m.gatewayDiscount)}`],
        ]
      : [];
  const rows: [string, string][] = [
    ["Order total", `₹${num(m.orderTotal)}`],
    ["Platform fee", `₹${num(m.platformFee)}`],
    ...gateway,
    ...(Number(m.dues) > 0 ? ([["COD dues adjusted", `₹${num(m.dues)}`]] as [string, string][]) : []),
    ["Amount sent", `₹${num(m.amount)}${m.isAdvance ? " (advance, before delivery)" : ""}`],
    ["Paid to", m.paidTo],
    ["Reference (UTR)", m.utr ?? "—"],
    ["Paid on", m.paidOn],
  ];
  return {
    to,
    subject: `${m.isAdvance ? "Advance payout" : "Payout"} of ₹${num(m.amount)} sent — order ${m.orderNumber}`,
    text: `Hi ${m.sellerName},\n\nUnieMax has sent you ${m.isAdvance ? "an advance" : "a payout"} of ₹${num(m.amount)} for order ${m.orderNumber} from ${m.storeName}.${m.isAdvance ? ` ${ADVANCE_NOTE}` : ""}\n\n${rows
      .map(([label, value]) => `${label}: ${value}`)
      .join("\n")}\n\nIt may take a few hours to show in your bank account.${earningsUrl ? `\n\nSee all your earnings: ${earningsUrl}` : ""}`,
    html: wrapHtml(
      "Your payout has been sent",
      `<p style="margin:0;font-size:14px;color:#444">Hi ${m.sellerName}, UnieMax has sent you
         <strong>₹${num(m.amount)}</strong> for order <strong>${m.orderNumber}</strong> from
         <strong>${m.storeName}</strong>.${m.isAdvance ? ` ${ADVANCE_NOTE}` : ""}</p>
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

async function deliverWhatsApp(m: PayoutMessage & { waId: string }, log: FastifyBaseLogger) {
  const chosen = await chooseTemplate(m, log);
  const result = await sendTemplate(
    {
      to: m.waId,
      templateName: chosen.name,
      languageCode: LANGUAGE,
      bodyParams: chosen.params,
      buttonParams: [`${m.slug}/earnings`],
      header: null,
    },
    log,
  );
  return { templateName: chosen.name, wamid: result.messages?.[0]?.id ?? null };
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
  const chosen = await chooseTemplate(m, log);
  return {
    channel,
    whatsapp: {
      // null while WhatsApp is switched off — the console can't tick it.
      to: env.WA_ENABLED ? m.waId : null,
      templateName: chosen.name,
      language: LANGUAGE,
      bodyParams: chosen.params,
      header: chosen.template?.header ?? null,
      // null = Meta's list unreachable or the template not approved yet.
      body: chosen.template ? fillTemplateBody(chosen.template.body, chosen.params) : null,
      footer: chosen.template?.footer ?? null,
      buttons: chosen.template?.buttons ?? [],
      approved: Boolean(chosen.template),
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
  const waId = m.waId;
  if (!waId) throw new HttpError(422, "The seller has no usable phone number for WhatsApp.");
  const sent = await deliverWhatsApp({ ...m, waId }, log);
  return { channel, to: waId, ...sent };
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
    const waId = m.waId;
    if (!waId) {
      log.info({ payoutId }, "payout WhatsApp skipped — no usable phone");
      return;
    }
    try {
      const sent = await deliverWhatsApp({ ...m, waId }, log);
      log.info({ payoutId, template: sent.templateName }, "payout WhatsApp sent");
    } catch (error) {
      // 403 = not on the dev allowlist, 409 = opted out; a missing / unapproved
      // template is refused the same way until it is approved in Meta.
      const expected = error instanceof HttpError && (error.statusCode === 403 || error.statusCode === 409);
      const reason = error instanceof Error ? error.message : "Send failed";
      log[expected ? "info" : "warn"]({ payoutId, reason }, "payout WhatsApp not sent");
    }
  })().catch((err: unknown) => log.error({ err, payoutId }, "payout notification failed"));
}
