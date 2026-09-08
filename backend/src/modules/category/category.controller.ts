import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, list } from "../../utils/response.js";
import { idParamSchema, slugParamSchema } from "../../utils/zodHelpers.js";
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  categoryListQuerySchema,
  categoryTreeQuerySchema,
  categoryChildrenQuerySchema,
  categorySearchQuerySchema,
} from "./category.schema.js";
import * as service from "./category.service.js";
import * as tree from "./categoryTree.js";

/**
 * Customers and sellers only ever see live branches; an admin can ask for the
 * disabled ones too (that is the whole point of the management screen).
 */
function activeOnlyFor(scope: "public" | "admin", asked?: boolean) {
  return scope === "public" ? true : (asked ?? true);
}

// ---- Public --------------------------------------------------------------

export async function publicListCategories(request: FastifyRequest) {
  const query = categoryListQuerySchema.parse(request.query);
  // Customers only ever see active categories.
  const { items, meta } = await service.listCategories({
    ...query,
    isActive: true,
  });
  return list(items, meta);
}

export async function publicGetCategory(request: FastifyRequest) {
  const { slug } = slugParamSchema.parse(request.params);
  return ok(await service.getCategoryBySlug(slug));
}

export const publicCategoryTree = treeHandler("public");
export const publicCategoryChildren = childrenHandler("public");
export const publicCategorySearch = searchHandler("public");

// ---- Admin ---------------------------------------------------------------

export async function adminListCategories(request: FastifyRequest) {
  const query = categoryListQuerySchema.parse(request.query);
  const { items, meta } = await service.listCategories(query);
  return list(items, meta);
}

export async function adminGetCategory(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  return ok(await service.getCategoryById(id));
}

export async function adminCreateCategory(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const input = categoryCreateSchema.parse(request.body);
  const category = await service.createCategory(input);
  return reply.status(201).send(ok(category));
}

export async function adminUpdateCategory(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const input = categoryUpdateSchema.parse(request.body);
  return ok(await service.updateCategory(id, input));
}

export async function adminDeleteCategory(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  return ok(await service.deleteCategory(id));
}

// ---- Tree / children / search (shared by both scopes) --------------------
//
// Same read models either side of the guard; only the "may I see disabled
// nodes" answer differs, so the handlers are built once from a scope.

function treeHandler(scope: "public" | "admin") {
  return async function handler(request: FastifyRequest) {
    const { activeOnly } = categoryTreeQuerySchema.parse(request.query);
    return ok(await tree.getCategoryTree(activeOnlyFor(scope, activeOnly)));
  };
}

function childrenHandler(scope: "public" | "admin") {
  return async function handler(request: FastifyRequest) {
    const { parentSlug, activeOnly } = categoryChildrenQuerySchema.parse(
      request.query,
    );
    const result = await tree.getCategoryChildren(
      parentSlug ?? null,
      activeOnlyFor(scope, activeOnly),
    );
    return ok(result);
  };
}

function searchHandler(scope: "public" | "admin") {
  return async function handler(request: FastifyRequest) {
    const { q, limit, activeOnly } = categorySearchQuerySchema.parse(
      request.query,
    );
    return ok(
      await tree.searchCategories(q, limit, activeOnlyFor(scope, activeOnly)),
    );
  };
}

export const adminCategoryTree = treeHandler("admin");
export const adminCategoryChildren = childrenHandler("admin");
export const adminCategorySearch = searchHandler("admin");
