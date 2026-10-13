import type { GraphTemplate } from "./whatsapp.types.js";

/**
 * Meta's template definitions → what the admin console's picker needs. Pure
 * (no env, no Prisma), unit-tested in test/unit/.
 *
 * The console's send endpoints fill **positional body variables only**
 * ({{1}}, {{2}}…), so a template that needs anything else — a media header, a
 * header variable, a dynamic URL button, named variables — is listed but
 * marked not sendable, with the reason, rather than failing at Meta
 * mid-campaign.
 *
 * Dynamic URL buttons are the one exception the SERVER can fill: built-in
 * flows (seller reminders) compute the link themselves and pass it as a
 * button value. Such a template stays "not sendable" in the console's picker
 * but passes `templateSendProblem` when its button values are supplied.
 */

export interface TemplateSummary {
  name: string;
  language: string;
  status: string;
  category: string | null;
  header: string | null;
  body: string;
  footer: string | null;
  buttons: string[];
  /** How many {{n}} the body needs — the length of `bodyParams`. */
  paramCount: number;
  /**
   * Position (0-based, among all buttons) of each URL button whose link ends
   * in a variable — one button value each, in this order.
   */
  urlButtons: number[];
  sendable: boolean;
  /** Why not, when `sendable` is false. */
  reason: string | null;
}

const POSITIONAL = /\{\{\s*(\d+)\s*\}\}/g;
const ANY_VARIABLE = /\{\{[^}]*\}\}/;

/** The console can't fill these; built-in flows that pass button values can. */
export const DYNAMIC_URL_REASON =
  "Has a dynamic URL button — only built-in flows (seller reminders) can fill it";

/** Highest {{n}} in the text — Meta numbers them 1…n with no gaps. */
export function countBodyParams(text: string): number {
  let max = 0;
  for (const match of text.matchAll(POSITIONAL)) {
    max = Math.max(max, Number(match[1]));
  }
  return max;
}

export function summarizeTemplate(template: GraphTemplate): TemplateSummary {
  const components = template.components ?? [];
  const find = (type: string) => components.find((c) => c.type === type);
  const header = find("HEADER");
  const body = find("BODY")?.text ?? "";
  const buttons = find("BUTTONS")?.buttons ?? [];

  let reason: string | null = null;
  if (template.status !== "APPROVED") {
    reason = `Template is ${template.status.toLowerCase()} — only approved templates can be sent`;
  } else if (template.parameter_format === "NAMED") {
    reason = "Uses named variables — only numbered {{1}} variables are supported here";
  } else if (header && header.format && header.format !== "TEXT") {
    reason = `Has a ${header.format.toLowerCase()} header — media headers are not supported here`;
  } else if (header?.text && ANY_VARIABLE.test(header.text)) {
    reason = "Has a variable in its header — not supported here";
  }
  const urlButtons = buttons.flatMap((b, index) =>
    b.type === "URL" && b.url && ANY_VARIABLE.test(b.url) ? [index] : [],
  );
  // Last, so it is the reason only when nothing harder blocks the template.
  if (reason === null && urlButtons.length > 0) reason = DYNAMIC_URL_REASON;

  return {
    name: template.name,
    language: template.language,
    status: template.status,
    category: template.category ?? null,
    header: header && (!header.format || header.format === "TEXT") ? (header.text ?? null) : null,
    body,
    footer: find("FOOTER")?.text ?? null,
    buttons: buttons.map((b) => b.text ?? "").filter(Boolean),
    paramCount: countBodyParams(body),
    urlButtons,
    sendable: reason === null,
    reason,
  };
}

/** The body with {{n}} replaced by bodyParams[n-1] — what the recipient reads. */
export function fillTemplateBody(body: string, params: string[]): string {
  return body.replace(POSITIONAL, (match, n: string) => params[Number(n) - 1] ?? match);
}

/**
 * Why a send with these values would fail at Meta, or null when it matches
 * the template — checked before calling the Graph API, so a wrong language
 * code or value count is a clear 422 here instead of an error code later.
 * `templates` is the WABA's list; the match is by name AND language, because
 * "en" and "en_US" are different templates to Meta. `buttonCount` is how
 * many dynamic-URL button values the caller supplies (console sends: none).
 */
export function templateSendProblem(
  templates: TemplateSummary[],
  name: string,
  language: string,
  paramCount: number,
  buttonCount = 0,
): string | null {
  const template = templates.find((t) => t.name === name && t.language === language);
  if (!template) {
    const languages = templates.filter((t) => t.name === name).map((t) => t.language);
    return languages.length > 0
      ? `Template "${name}" has no "${language}" version — use ${languages.map((l) => `"${l}"`).join(" or ")}`
      : `No template named "${name}" on this WhatsApp account`;
  }
  const fillsButtons = template.reason === DYNAMIC_URL_REASON && buttonCount > 0;
  if (!template.sendable && !fillsButtons) return template.reason;
  if (template.paramCount !== paramCount) {
    const n = template.paramCount;
    return `Template "${name}" needs ${n} value${n === 1 ? "" : "s"}${n > 0 ? ` for {{1}}…{{${n}}}` : ""}, got ${paramCount}`;
  }
  if (template.urlButtons.length !== buttonCount) {
    const n = template.urlButtons.length;
    return `Template "${name}" has ${n} dynamic URL button${n === 1 ? "" : "s"}, got ${buttonCount} button value${buttonCount === 1 ? "" : "s"}`;
  }
  return null;
}
