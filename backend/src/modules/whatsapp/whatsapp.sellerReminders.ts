import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { normalizeIndianPhone } from "../../utils/zodHelpers.js";
import { resolveProfile } from "../stores/storeProfile.schema.js";
import { evaluateReadiness, STEPS } from "../stores/storeReadiness.js";
import type { Readiness, StepKey } from "../stores/storeReadiness.js";
import { loadReadinessCounts } from "../stores/stores.service.js";
import * as repo from "./whatsapp.repository.js";
import type { ReminderKey } from "./whatsapp.schema.js";
import { getTemplates, sendTemplate } from "./whatsapp.service.js";
import { fillTemplateBody, templateSendProblem } from "./whatsapp.templates.js";
import type { TemplateSummary } from "./whatsapp.templates.js";
import { normalizeWaId } from "./whatsapp.webhook.js";

/**
 * Seller reminders — WhatsApp nudges an admin sends from a store's page to
 * chase an unfinished setup, built on templates approved in WhatsApp Manager.
 *
 * Every value is computed HERE from the store's live readiness (the same
 * registry the seller's checklist and the publish gate use), never typed by
 * the admin: the console asks for a reminder by key and the server fills the
 * template — body values and the button link — so a reminder can only ever
 * name a step that really is unfinished.
 *
 * Each template's button is a dynamic URL `https://<site>/mystores/{{1}}`;
 * the value is the rest of the path (`<slug>/products`), which is why these
 * templates cannot be sent from the console's generic picker.
 */

interface ReminderDefinition {
  key: ReminderKey;
  templateName: string;
  /** The readiness step it chases; null for the combined reminder and the tip. */
  step: StepKey | null;
}

/** Template names as approved in WhatsApp Manager — renaming one there breaks it here. */
const REMINDERS: ReminderDefinition[] = [
  { key: "setup", templateName: "seller_setup_pending", step: null },
  { key: "catalog", templateName: "seller_setup_products", step: "catalog" },
  { key: "address", templateName: "seller_setup_address", step: "address" },
  { key: "tax", templateName: "seller_setup_tax", step: "tax" },
  { key: "payout", templateName: "seller_setup_payout", step: "payout" },
  { key: "tip", templateName: "seller_motivation_tip", step: null },
];

/**
 * The same reminder to the same number at most once a day — repeated nudges
 * get a business number blocked and reported, which costs it its quality
 * rating. A failed send does not count.
 */
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Used when Meta's template list can't be read (the send then lets Meta decide). */
const FALLBACK_LANGUAGE = "en";

// ---- Loading ---------------------------------------------------------------

interface SellerContext {
  storeId: string;
  storeName: string;
  slug: string;
  sellerName: string | null;
  readiness: Readiness;
  recipient: Recipient | null;
}

export interface Recipient {
  /** "+919876543210" — for display. */
  phone: string;
  /** Digits only — Meta's wa_id. */
  waId: string;
  /** `business` = the store's contact phone; `owner` = the owner's login phone. */
  source: "business" | "owner";
}

/**
 * Indian numbers in any common spelling become +91…; anything else is used
 * only when it already carries a country code — a bare foreign number would
 * be sent to the wrong country.
 */
function toWaPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const indian = normalizeIndianPhone(raw);
  if (indian) return indian;
  const digits = raw.replace(/\D/g, "");
  return raw.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15
    ? `+${digits}`
    : null;
}

async function loadSeller(storeRef: string): Promise<SellerContext> {
  const store = await prisma.store.findFirst({
    where: { OR: [{ id: storeRef }, { slug: storeRef }] },
    select: {
      id: true,
      name: true,
      slug: true,
      logoKey: true,
      profile: true,
      owner: { select: { name: true, phone: true } },
    },
  });
  if (!store) throw HttpError.notFound("Store not found");

  const profile = resolveProfile(store.profile);
  const counts = await loadReadinessCounts([store.id]);
  const readiness = evaluateReadiness({
    name: store.name,
    logoKey: store.logoKey,
    profile,
    ...counts.get(store.id)!,
  });

  // The business contact first: it is the number the seller gave for being
  // reached about the store. The login phone is the fallback.
  const business = toWaPhone(profile.phone);
  const owner = toWaPhone(store.owner.phone);
  const recipient: Recipient | null = business
    ? { phone: business, waId: normalizeWaId(business), source: "business" }
    : owner
      ? { phone: owner, waId: normalizeWaId(owner), source: "owner" }
      : null;

  return {
    storeId: store.id,
    storeName: store.name,
    slug: store.slug,
    sellerName: profile.sellerName ?? store.owner.name,
    readiness,
    recipient,
  };
}

/** Templates, or null while Meta can't list them — reminders still send, unchecked. */
async function templatesOrNull(log: FastifyBaseLogger): Promise<TemplateSummary[] | null> {
  try {
    return await getTemplates(false, log);
  } catch {
    return null;
  }
}

// ---- Values ----------------------------------------------------------------

/** Meta refuses parameters with newlines, tabs or 4+ spaces in a row. */
const clean = (value: string) => value.replace(/\s+/g, " ").trim();

function pendingSteps(readiness: Readiness) {
  return readiness.steps.filter((step) => !step.complete && step.totalCount > 0);
}

/** What fills each template — body {{1}}… and the button link's suffix. */
function valuesFor(def: ReminderDefinition, seller: SellerContext) {
  const name = clean(seller.sellerName ?? "") || "there";
  const store = clean(seller.storeName) || "your store";

  if (def.key === "setup") {
    const { metCount, totalCount } = seller.readiness;
    const percent = totalCount > 0 ? Math.round((metCount / totalCount) * 100) : 100;
    const pending = pendingSteps(seller.readiness).map((step) => step.title);
    return {
      bodyParams: [name, store, `${percent}%`, clean(pending.join(", "))],
      buttonParams: [seller.slug],
    };
  }
  if (def.step) {
    const href = STEPS.find((step) => step.key === def.step)!.href;
    return { bodyParams: [name, store], buttonParams: [`${seller.slug}/${href}`] };
  }
  return { bodyParams: [name, store], buttonParams: [seller.slug] };
}

/** Why this reminder can't be sent to this seller right now, or null. */
function unavailableReason(def: ReminderDefinition, seller: SellerContext): string | null {
  if (def.key === "setup" && pendingSteps(seller.readiness).length === 0) {
    return "Nothing outstanding — setup is complete";
  }
  if (def.step) {
    const step = seller.readiness.steps.find((s) => s.key === def.step);
    if (!step || step.complete || step.totalCount === 0) return "This step is already complete";
  }
  return null;
}

/**
 * The approved language of a template — whichever the template was approved
 * in ("en", "en_US"…), so the code never has to guess what was picked in
 * WhatsApp Manager. English first if there are several.
 */
function languageOf(templates: TemplateSummary[] | null, name: string): string {
  const approved = (templates ?? []).filter((t) => t.name === name && t.status === "APPROVED");
  return (
    approved.find((t) => t.language.startsWith("en"))?.language ??
    approved[0]?.language ??
    FALLBACK_LANGUAGE
  );
}

// ---- Public ----------------------------------------------------------------

async function buildState(seller: SellerContext, log: FastifyBaseLogger) {
  const templates = await templatesOrNull(log);
  const [contact, sends] = seller.recipient
    ? await Promise.all([
        repo.findContact(seller.recipient.waId),
        repo.latestTemplateSends(
          seller.recipient.waId,
          REMINDERS.map((r) => r.templateName),
        ),
      ])
    : [null, []];
  const optedOut = contact?.optedOut ?? false;

  const reminders = REMINDERS.map((def) => {
    const language = languageOf(templates, def.templateName);
    const template =
      templates?.find((t) => t.name === def.templateName && t.language === language) ?? null;
    const { bodyParams, buttonParams } = valuesFor(def, seller);
    const last = sends.find((s) => s.templateName === def.templateName) ?? null;
    const coolingDown =
      last !== null &&
      last.lastStatus !== "failed" &&
      Date.now() - last.createdAt.getTime() < COOLDOWN_MS;

    const reason =
      (!seller.recipient ? "No phone number on this store or its owner" : null) ??
      (optedOut ? "This number has opted out of WhatsApp messages" : null) ??
      unavailableReason(def, seller) ??
      (templates
        ? templateSendProblem(templates, def.templateName, language, {
            params: bodyParams.length,
            buttons: buttonParams.length,
            headerMedia: false,
          })
        : null) ??
      (coolingDown ? "Already sent in the last 24 hours" : null);

    return {
      key: def.key,
      step: def.step,
      templateName: def.templateName,
      language,
      category: template?.category ?? null,
      available: reason === null,
      reason,
      /** What the seller will read — null while Meta's template list is unavailable. */
      preview: template ? fillTemplateBody(template.body, bodyParams) : null,
      lastSent: last ? { at: last.createdAt, status: last.lastStatus } : null,
    };
  });

  return { recipient: seller.recipient, optedOut, reminders };
}

export async function getSellerReminders(storeRef: string, log: FastifyBaseLogger) {
  return buildState(await loadSeller(storeRef), log);
}

export async function sendSellerReminder(
  storeRef: string,
  key: ReminderKey,
  log: FastifyBaseLogger,
) {
  const seller = await loadSeller(storeRef);
  const def = REMINDERS.find((r) => r.key === key)!;
  const state = await buildState(seller, log);
  const reminder = state.reminders.find((r) => r.key === key)!;
  if (!reminder.available) {
    // Opt-out and the cooldown are conflicts with the number's state; the
    // rest are "this request can't be filled".
    const conflict = state.optedOut || reminder.reason === "Already sent in the last 24 hours";
    throw new HttpError(conflict ? 409 : 422, reminder.reason!);
  }

  const { bodyParams, buttonParams } = valuesFor(def, seller);
  const result = await sendTemplate(
    {
      to: seller.recipient!.waId,
      templateName: def.templateName,
      languageCode: reminder.language,
      bodyParams,
      buttonParams,
      header: null,
    },
    log,
  );

  return {
    storeId: seller.storeId,
    templateName: def.templateName,
    wamid: result.messages?.[0]?.id ?? null,
    state: await buildState(seller, log),
  };
}
