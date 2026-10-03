import type { FastifyReply, FastifyRequest } from "fastify";
import { shareImageParamsSchema, sizedImageParamsSchema } from "./media.schema.js";
import * as service from "./media.service.js";

/**
 * Binary responses, not the JSON envelope (errors still answer JSON through
 * the central handler). Cached forever: each URL embeds the original's
 * immutable key, so the bytes behind it can never change.
 */
const IMMUTABLE = "public, max-age=31536000, immutable";

/** The link-preview image of a product photo or store logo (`og:image`). */
export async function shareImage(request: FastifyRequest, reply: FastifyReply) {
  const params = shareImageParamsSchema.parse(request.params);
  const image = await service.shareImage(params.bucket, params["*"]);
  return reply.type("image/jpeg").header("cache-control", IMMUTABLE).send(image);
}

/** A stored image at one of the published widths — a `srcset` candidate. */
export async function sizedImage(request: FastifyRequest, reply: FastifyReply) {
  const params = sizedImageParamsSchema.parse(request.params);
  const image = await service.sizedImage(params.bucket, params["*"], params.width);
  return reply.type("image/webp").header("cache-control", IMMUTABLE).send(image);
}
