import type { GraphTemplate } from "./whatsapp.types.js";

/**
 * Meta's template definitions → what senders need to know to fill one. Pure
 * (no env, no Prisma), unit-tested in test/unit/.
 *
 * A send fills up to three things: the body's positional {{1}}, {{2}}…, one
 * value per **dynamic URL button** (the part of the link after the template's
 * fixed prefix), and a **media header** (image, video or document, by link).
 * Templates needing anything else — named variables, a header text variable,
 * a location header — are listed but marked not sendable, with the reason,
 * rather than failing at Meta mid-campaign.
 */

export type HeaderMediaType = "image" | "video" | "document";

export interface UrlButton {
  /** Position among ALL the template's buttons — what Meta's `index` means. */
  index: number;
  text: string;
  /** The template's URL, still with its {{1}}. */
  url: string;
}

export interface TemplateSummary {
  name: string;
  language: string;
  status: string;
  category: string | null;
  /** Text header, when the header is text. */
  header: string | null;
  /** Media header that must be supplied on every send. */
  headerMedia: HeaderMediaType | null;
  body: string;
  footer: string | null;
  buttons: string[];
  /** How many {{n}} the body needs — the length of `bodyParams`. */
  paramCount: number;
  /** URL buttons whose link ends in a variable — one button value each, in order. */
  urlButtons: UrlButton[];
  sendable: boolean;
  /** Why not, when `sendable` is false. */
  reason: string | null;
}

const POSITIONAL = /\{\{\s*(\d+)\s*\}\}/g;
const ANY_VARIABLE = /\{\{[^}]*\}\}/;
const MEDIA_FORMATS: Record<string, HeaderMediaType> = {
  IMAGE: "image",
  VIDEO: "video",
  DOCUMENT: "document",
};

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
  const format = header?.format ?? "TEXT";

  let reason: string | null = null;
  if (template.status !== "APPROVED") {
    reason = `Template is ${template.status.toLowerCase()} — only approved templates can be sent`;
  } else if (template.parameter_format === "NAMED") {
    reason = "Uses named variables — only numbered {{1}} variables are supported";
  } else if (header && format !== "TEXT" && !MEDIA_FORMATS[format]) {
    reason = `Has a ${format.toLowerCase()} header — not supported`;
  } else if (header?.text && ANY_VARIABLE.test(header.text)) {
    reason = "Has a variable in its header — not supported";
  }

  return {
    name: template.name,
    language: template.language,
    status: template.status,
    category: template.category ?? null,
    header: header && format === "TEXT" ? (header.text ?? null) : null,
    headerMedia: header ? (MEDIA_FORMATS[format] ?? null) : null,
    body,
    footer: find("FOOTER")?.text ?? null,
    buttons: buttons.map((b) => b.text ?? "").filter(Boolean),
    paramCount: countBodyParams(body),
    urlButtons: buttons.flatMap((b, index) =>
      b.type === "URL" && b.url && ANY_VARIABLE.test(b.url)
        ? [{ index, text: b.text ?? "", url: b.url }]
        : [],
    ),
    sendable: reason === null,
    reason,
  };
}

/** The body with {{n}} replaced by bodyParams[n-1] — what the recipient reads. */
export function fillTemplateBody(body: string, params: string[]): string {
  return body.replace(POSITIONAL, (match, n: string) => params[Number(n) - 1] ?? match);
}

export interface SendShape {
  params: number;
  buttons: number;
  headerMedia: boolean;
}

/**
 * Why a send with this shape would fail at Meta, or null when it matches the
 * template — checked before calling the Graph API, so a wrong language code
 * or value count is a clear 422 here instead of an error code later.
 * `templates` is the WABA's list; the match is by name AND language, because
 * "en" and "en_US" are different templates to Meta.
 */
export function templateSendProblem(
  templates: TemplateSummary[],
  name: string,
  language: string,
  shape: SendShape,
): string | null {
  const template = templates.find((t) => t.name === name && t.language === language);
  if (!template) {
    const languages = templates.filter((t) => t.name === name).map((t) => t.language);
    return languages.length > 0
      ? `Template "${name}" has no "${language}" version — use ${languages.map((l) => `"${l}"`).join(" or ")}`
      : `No template named "${name}" on this WhatsApp account`;
  }
  if (!template.sendable) return template.reason;
  if (template.paramCount !== shape.params) {
    const n = template.paramCount;
    return `Template "${name}" needs ${n} value${n === 1 ? "" : "s"}${n > 0 ? ` for {{1}}…{{${n}}}` : ""}, got ${shape.params}`;
  }
  if (template.urlButtons.length !== shape.buttons) {
    const n = template.urlButtons.length;
    return `Template "${name}" has ${n} link button${n === 1 ? "" : "s"} to fill, got ${shape.buttons} button value${shape.buttons === 1 ? "" : "s"}`;
  }
  if (template.headerMedia && !shape.headerMedia) {
    return `Template "${name}" has a ${template.headerMedia} header — add the ${template.headerMedia}`;
  }
  if (!template.headerMedia && shape.headerMedia) {
    return `Template "${name}" has no media header`;
  }
  return null;
}
