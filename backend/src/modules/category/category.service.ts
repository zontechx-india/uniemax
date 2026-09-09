import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { slugify } from "../../utils/slug.js";
import { buildListMeta } from "../../utils/response.js";
import { HttpError } from "../../utils/httpError.js";
import {
  MAX_CATEGORY_DEPTH,
  getCategoryHeight,
  getCategoryPath,
  invalidateCategoryCache,
} from "./categoryTree.js";
import type {
  CategoryCreateInput,
  CategoryUpdateInput,
  CategoryListQuery,
} from "./category.schema.js";

const categorySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  imageUrl: true,
  displayOrder: true,
  isActive: true,
  parentId: true,
  optionTemplates: true,
  specTemplates: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { storeCategories: true, storeProducts: true, children: true } },
} satisfies Prisma.CategorySelect;

/** Ensures the generated slug is unique, appending -2, -3, ... on collision. */
async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = base || "category";
  let candidate = root;
  let n = 1;
  // Loop is bounded in practice by the number of same-named categories.
  for (;;) {
    const existing = await prisma.category.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

export async function listCategories(query: CategoryListQuery) {
  const { page, pageSize, q, parentId, rootOnly, isActive } = query;

  const where: Prisma.CategoryWhereInput = {};
  if (isActive !== undefined) where.isActive = isActive;
  if (rootOnly) where.parentId = null;
  else if (parentId) where.parentId = parentId;
  if (q) where.name = { contains: q, mode: "insensitive" };

  const [items, total] = await prisma.$transaction([
    prisma.category.findMany({
      where,
      select: categorySelect,
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.category.count({ where }),
  ]);

  return { items, meta: buildListMeta(total, page, pageSize) };
}

export async function getCategoryBySlug(slug: string) {
  const category = await prisma.category.findUnique({
    where: { slug },
    select: {
      ...categorySelect,
      parent: { select: { id: true, name: true, slug: true } },
      children: {
        where: { isActive: true },
        select: categorySelect,
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      },
    },
  });
  if (!category) throw HttpError.notFound("Category not found");
  return category;
}

export async function getCategoryById(id: string) {
  const category = await prisma.category.findUnique({
    where: { id },
    select: categorySelect,
  });
  if (!category) throw HttpError.notFound("Category not found");
  return category;
}

export async function createCategory(input: CategoryCreateInput) {
  const slug = await uniqueSlug(slugify(input.name));
  if (input.parentId) await assertDepth(input.parentId);

  const data: Prisma.CategoryUncheckedCreateInput = { name: input.name, slug };
  if (input.description !== undefined) data.description = input.description;
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
  if (input.displayOrder !== undefined) data.displayOrder = input.displayOrder;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.parentId !== undefined) data.parentId = input.parentId;
  if (input.optionTemplates !== undefined) {
    data.optionTemplates =
      input.optionTemplates === null
        ? Prisma.DbNull
        : (input.optionTemplates as unknown as Prisma.InputJsonValue);
  }
  if (input.specTemplates !== undefined) {
    data.specTemplates = input.specTemplates === null ? Prisma.DbNull : input.specTemplates;
  }

  const category = await prisma.category.create({ data, select: categorySelect });
  invalidateCategoryCache();
  return category;
}

/**
 * Walks up from `parentId` to make sure `id` is not already an ancestor of
 * it — reparenting a category under its own descendant would detach the
 * branch from every root and make the tree walk cycle.
 */
async function assertNoCycle(id: string, parentId: string) {
  let cursor: string | null = parentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === id) {
      throw HttpError.badRequest(
        "A category cannot be moved under one of its own subcategories.",
      );
    }
    if (seen.has(cursor)) break; // pre-existing loop — not this edit's to fix
    seen.add(cursor);
    const parent: { parentId: string | null } | null =
      await prisma.category.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
    if (!parent) throw HttpError.badRequest("Parent category not found.");
    cursor = parent.parentId;
  }
}

/** Store shelves mirror the taxonomy, so the taxonomy's depth is the storefront's. */
async function assertDepth(parentId: string, id?: string) {
  const parent = await getCategoryPath(parentId, false);
  if (!parent) throw HttpError.badRequest("Parent category not found.");
  const below = id ? await getCategoryHeight(id) : 0;
  if (parent.depth + 1 + below >= MAX_CATEGORY_DEPTH) {
    throw HttpError.badRequest(
      `Categories nest at most ${MAX_CATEGORY_DEPTH} levels deep.`,
    );
  }
}

export async function updateCategory(id: string, input: CategoryUpdateInput) {
  if (input.parentId && input.parentId === id) {
    throw HttpError.badRequest("A category cannot be its own parent.");
  }
  if (input.parentId) await assertNoCycle(id, input.parentId);
  if (input.parentId) await assertDepth(input.parentId, id);

  const data: Prisma.CategoryUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
  if (input.displayOrder !== undefined) data.displayOrder = input.displayOrder;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.parentId !== undefined) data.parentId = input.parentId;
  if (input.optionTemplates !== undefined) {
    data.optionTemplates =
      input.optionTemplates === null
        ? Prisma.DbNull
        : (input.optionTemplates as unknown as Prisma.InputJsonValue);
  }
  if (input.specTemplates !== undefined) {
    data.specTemplates = input.specTemplates === null ? Prisma.DbNull : input.specTemplates;
  }

  // Throws P2025 -> 404 via the global handler if the id doesn't exist.
  const category = await prisma.category.update({
    where: { id },
    data,
    select: categorySelect,
  });
  invalidateCategoryCache();
  return category;
}

export async function deleteCategory(id: string) {
  const category = await prisma.category.findUnique({
    where: { id },
    select: { _count: { select: { storeCategories: true, storeProducts: true, children: true } } },
  });
  if (!category) throw HttpError.notFound("Category not found");

  if (category._count.storeCategories > 0 || category._count.storeProducts > 0) {
    throw HttpError.conflict(
      "Stores still use this category. Disable it instead of deleting it.",
    );
  }
  if (category._count.children > 0) {
    throw HttpError.conflict(
      "Cannot delete a category that has sub-categories. Remove them first.",
    );
  }

  await prisma.category.delete({ where: { id } });
  invalidateCategoryCache();
  return { id };
}
