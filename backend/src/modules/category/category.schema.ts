import { z } from "zod";
import { boolQuery, paginationQuery } from "../../utils/zodHelpers.js";

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  parentId: z.string().min(1).nullable().optional(),
});

export const categoryUpdateSchema = categoryCreateSchema.partial();

export const categoryListQuerySchema = paginationQuery.extend({
  q: z.string().trim().optional(),
  // "root" restricts to top-level categories; otherwise filter by parent id.
  parentId: z.string().min(1).optional(),
  rootOnly: boolQuery.optional(),
  isActive: boolQuery.optional(),
});

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>;

/** Tree / children / search all share the "hide disabled branches" switch. */
export const categoryTreeQuerySchema = z.object({
  /** Admin-only: pass false to include disabled nodes. Public forces true. */
  activeOnly: boolQuery.optional(),
});

export const categoryChildrenQuerySchema = categoryTreeQuerySchema.extend({
  /** Omit for the roots — the first step of a drill-down selector. */
  parentSlug: z.string().trim().min(1).optional(),
});

export const categorySearchQuerySchema = categoryTreeQuerySchema.extend({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CategoryTreeQuery = z.infer<typeof categoryTreeQuerySchema>;
export type CategoryChildrenQuery = z.infer<typeof categoryChildrenQuerySchema>;
export type CategorySearchQuery = z.infer<typeof categorySearchQuerySchema>;
