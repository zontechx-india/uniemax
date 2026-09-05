import type { FastifyRequest, FastifyReply } from "fastify";
import { ok } from "../../utils/response.js";
import { readUpload } from "../../package/storage/index.js";
import { idParamSchema } from "../../utils/zodHelpers.js";
import {
  storeCategoryCreateSchema,
  storeCategoryUpdateSchema,
  storeMediaOrderSchema,
  storeMediaParamSchema,
  storeMediaUpdateSchema,
  storeProductCreateSchema,
  storeCategoryParamSchema,
  storeProductParamSchema,
  storeProductOptionsSchema,
  storeVariantUpdateSchema,
  storeVariantParamSchema,
  storeProductUpdateSchema,
} from "./storeCatalog.schema.js";
import * as service from "./storeCatalog.service.js";

/**
 * Runs behind `requireCustomer` (attached in stores.routes.ts). `:id` is the
 * store's id or slug; ownership is enforced in the service. Store catalogs
 * are small, so no pagination.
 */

export async function listCategories(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  return ok(await service.listCategories(request.customer!.id, id));
}

export async function createCategory(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { id } = idParamSchema.parse(request.params);
  const input = storeCategoryCreateSchema.parse(request.body);
  const category = await service.createCategory(request.customer!.id, id, input);
  return reply.status(201).send(ok(category));
}

/** Rename and/or enable-disable a category (partial update). */
export async function updateCategory(request: FastifyRequest) {
  const { id, categoryId } = storeCategoryParamSchema.parse(request.params);
  const patch = storeCategoryUpdateSchema.parse(request.body);
  return ok(
    await service.updateCategory(request.customer!.id, id, categoryId, patch),
  );
}

export async function deleteCategory(request: FastifyRequest) {
  const { id, categoryId } = storeCategoryParamSchema.parse(request.params);
  return ok(await service.deleteCategory(request.customer!.id, id, categoryId));
}

export async function listProducts(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  return ok(await service.listProducts(request.customer!.id, id));
}

export async function createProduct(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { id } = idParamSchema.parse(request.params);
  const input = storeProductCreateSchema.parse(request.body);
  const product = await service.createProduct(request.customer!.id, id, input);
  return reply.status(201).send(ok(product));
}

export async function updateProduct(request: FastifyRequest) {
  const { id, productId } = storeProductParamSchema.parse(request.params);
  const patch = storeProductUpdateSchema.parse(request.body);
  return ok(
    await service.updateProduct(request.customer!.id, id, productId, patch),
  );
}

export async function deleteProduct(request: FastifyRequest) {
  const { id, productId } = storeProductParamSchema.parse(request.params);
  return ok(await service.deleteProduct(request.customer!.id, id, productId));
}

// Options & variants — every mutation responds with the full parent product
// (option types and variants included), so clients can swap one product row
// in place.

/**
 * Replace the product's option types and its whole variant set atomically.
 * The body is the full target state; the response is the reconciled product.
 */
export async function replaceProductOptions(request: FastifyRequest) {
  const { id, productId } = storeProductParamSchema.parse(request.params);
  const input = storeProductOptionsSchema.parse(request.body);
  return ok(
    await service.replaceProductOptions(
      request.customer!.id,
      id,
      productId,
      input,
    ),
  );
}

/** Price / stock / on-off for one combination. */
export async function updateVariant(request: FastifyRequest) {
  const { id, productId, variantId } = storeVariantParamSchema.parse(
    request.params,
  );
  const patch = storeVariantUpdateSchema.parse(request.body);
  return ok(
    await service.updateVariant(
      request.customer!.id,
      id,
      productId,
      variantId,
      patch,
    ),
  );
}

// Media — like variants, every mutation responds with the full parent
// product so clients can swap one product row in place. Uploads are
// multipart; "auto" picks the image or video rule from the file itself.

export async function addProductMedia(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { id, productId } = storeProductParamSchema.parse(request.params);
  const file = await readUpload(request, "auto");
  const product = await service.addProductMedia(
    request.customer!.id,
    id,
    productId,
    file,
  );
  return reply.status(201).send(ok(product));
}

export async function replaceProductMediaFile(request: FastifyRequest) {
  const { id, productId, mediaId } = storeMediaParamSchema.parse(
    request.params,
  );
  const file = await readUpload(request, "auto");
  return ok(
    await service.replaceProductMediaFile(
      request.customer!.id,
      id,
      productId,
      mediaId,
      file,
    ),
  );
}

export async function updateProductMedia(request: FastifyRequest) {
  const { id, productId, mediaId } = storeMediaParamSchema.parse(
    request.params,
  );
  const patch = storeMediaUpdateSchema.parse(request.body);
  return ok(
    await service.updateProductMedia(
      request.customer!.id,
      id,
      productId,
      mediaId,
      patch,
    ),
  );
}

export async function reorderProductMedia(request: FastifyRequest) {
  const { id, productId } = storeProductParamSchema.parse(request.params);
  const input = storeMediaOrderSchema.parse(request.body);
  return ok(
    await service.reorderProductMedia(
      request.customer!.id,
      id,
      productId,
      input,
    ),
  );
}

export async function deleteProductMedia(request: FastifyRequest) {
  const { id, productId, mediaId } = storeMediaParamSchema.parse(
    request.params,
  );
  return ok(
    await service.deleteProductMedia(
      request.customer!.id,
      id,
      productId,
      mediaId,
    ),
  );
}
