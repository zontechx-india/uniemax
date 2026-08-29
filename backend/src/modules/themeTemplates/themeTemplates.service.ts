import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import {
  DEFAULT_STORE_THEME,
  storeThemeColorsSchema,
} from "../stores/stores.schema.js";
import type { StoreThemeColors } from "../stores/stores.schema.js";
import type {
  ThemeTemplateCreateInput,
  ThemeTemplateListQuery,
  ThemeTemplateUpdateInput,
} from "./themeTemplates.schema.js";

/**
 * Store appearance templates.
 *
 * Two audiences, one table: sellers read the ACTIVE rows (Appearance →
 * Templates) and the platform console owns the full CRUD. Nothing here ever
 * writes to a store — applying a template copies its colors through the
 * normal `PATCH /stores/:id/theme` path, which is what keeps a template
 * immutable from the seller's side.
 */

const templateSelect = {
  id: true,
  name: true,
  description: true,
  theme: true,
  isActive: true,
  displayOrder: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StoreThemeTemplateSelect;

type TemplateRow = Prisma.StoreThemeTemplateGetPayload<{
  select: typeof templateSelect;
}>;

/**
 * Guarantee the five colors regardless of what the JSON column holds, exactly
 * as the store reader does — a hand-edited or older row renders as a complete
 * palette instead of a half-painted one.
 */
export function resolveTemplateTheme(raw: unknown): StoreThemeColors {
  const parsed = storeThemeColorsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const partial = raw && typeof raw === "object" ? raw : {};
  return {
    backgroundColor: DEFAULT_STORE_THEME.backgroundColor,
    primaryColor: DEFAULT_STORE_THEME.primaryColor,
    secondaryColor: null,
    surfaceColor: null,
    buttonTextColor: null,
    ...(partial as Partial<StoreThemeColors>),
  };
}

function shape(row: TemplateRow) {
  return { ...row, theme: resolveTemplateTheme(row.theme) };
}

/** Ascending by the admin's order, then oldest-first so ties stay stable. */
const templateOrder: Prisma.StoreThemeTemplateOrderByWithRelationInput[] = [
  { displayOrder: "asc" },
  { createdAt: "asc" },
];

/** What a seller may choose from — active templates only. */
export async function listActiveTemplates() {
  const rows = await prisma.storeThemeTemplate.findMany({
    where: { isActive: true },
    orderBy: templateOrder,
    select: templateSelect,
  });
  return rows.map(shape);
}

/** The console's list — every template, optionally filtered by state. */
export async function listTemplates(query: ThemeTemplateListQuery) {
  const rows = await prisma.storeThemeTemplate.findMany({
    ...(query.isActive === undefined ? {} : { where: { isActive: query.isActive } }),
    orderBy: templateOrder,
    select: templateSelect,
  });
  return rows.map(shape);
}

export async function getTemplate(id: string) {
  const row = await prisma.storeThemeTemplate.findUnique({
    where: { id },
    select: templateSelect,
  });
  if (!row) throw HttpError.notFound("Template not found");
  return shape(row);
}

export async function createTemplate(input: ThemeTemplateCreateInput) {
  const row = await prisma.storeThemeTemplate.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      theme: input.theme,
      isActive: input.isActive,
      displayOrder: input.displayOrder,
    },
    select: templateSelect,
  });
  return shape(row);
}

export async function updateTemplate(id: string, input: ThemeTemplateUpdateInput) {
  await getTemplate(id);
  const row = await prisma.storeThemeTemplate.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: input.description ?? null }
        : {}),
      ...(input.theme !== undefined ? { theme: input.theme } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.displayOrder !== undefined
        ? { displayOrder: input.displayOrder }
        : {}),
    },
    select: templateSelect,
  });
  return shape(row);
}

/**
 * Deleting is safe by construction: stores hold their own copy of the colors,
 * so nothing visual breaks. A store whose `theme.templateId` pointed here
 * simply stops matching a template and reads as a custom palette.
 */
export async function deleteTemplate(id: string) {
  await getTemplate(id);
  await prisma.storeThemeTemplate.delete({ where: { id } });
  return { id, deleted: true };
}
