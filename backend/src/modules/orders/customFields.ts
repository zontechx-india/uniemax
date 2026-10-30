import { HttpError } from "../../utils/httpError.js";
import {
  CUSTOM_FIELD_SECTIONS,
  MAX_CUSTOM_ANSWER,
} from "../stores/stores.schema.js";
import type { CheckoutCustomField } from "../stores/stores.schema.js";

/**
 * Answers to a store's own checkout questions (Store.checkout.customFields),
 * as stored on the order (`Order.customFields`). The label is a snapshot, so
 * the seller renaming "Tehsil" to "Taluka" later never rewrites old orders.
 */
export interface OrderCustomAnswer {
  id: string;
  label: string;
  section: (typeof CUSTOM_FIELD_SECTIONS)[number];
  value: string;
}

const NUMBER_RE = /^-?\d+(\.\d+)?$/;

/**
 * Check the customer's answers against the store's questions and return the
 * snapshot to store. Only questions that apply are read — DELIVERY ones are
 * skipped for pickup; answers to unknown ids are ignored.
 */
export function collectCustomAnswers(
  fields: CheckoutCustomField[],
  answers: Record<string, string>,
  withAddress: boolean,
): OrderCustomAnswer[] {
  const out: OrderCustomAnswer[] = [];
  for (const field of fields) {
    if (field.section === "DELIVERY" && !withAddress) continue;
    const value = (answers[field.id] ?? "").trim();
    if (!value) {
      if (field.required) throw HttpError.badRequest(`${field.label} is required`);
      continue;
    }
    if (value.length > MAX_CUSTOM_ANSWER) {
      throw HttpError.badRequest(
        `${field.label} is too long (up to ${MAX_CUSTOM_ANSWER} characters)`,
      );
    }
    if (field.type === "NUMBER" && !NUMBER_RE.test(value)) {
      throw HttpError.badRequest(`${field.label} must be a number`);
    }
    if (field.type === "CHOICE" && !field.choices.includes(value)) {
      throw HttpError.badRequest(`Pick one of the options for ${field.label}`);
    }
    out.push({ id: field.id, label: field.label, section: field.section, value });
  }
  return out;
}

/** The stored JSON as a clean list — anything malformed is dropped. */
export function readOrderCustomFields(raw: unknown): OrderCustomAnswer[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): OrderCustomAnswer[] => {
    if (!item || typeof item !== "object") return [];
    const { id, label, section, value } = item as Record<string, unknown>;
    if (
      typeof id !== "string" ||
      typeof label !== "string" ||
      typeof value !== "string" ||
      !CUSTOM_FIELD_SECTIONS.includes(section as OrderCustomAnswer["section"])
    ) {
      return [];
    }
    return [{ id, label, section: section as OrderCustomAnswer["section"], value }];
  });
}
