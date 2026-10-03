import type { FastifyReply, FastifyRequest } from "fastify";
import { shareImageParamsSchema } from "./media.schema.js";
import * as service from "./media.service.js";

/**
 * The link-preview image of a product photo or store logo — what page
 * shells put in `og:image`. Binary, not the JSON envelope (errors still
 * answer JSON through the central handler).
 *
 * Cached forever: the URL embeds the original's immutable key, so the bytes
 * behind it can never change.
 */
export async function shareImage(request: FastifyRequest, reply: FastifyReply) {
  const params = shareImageParamsSchema.parse(request.params);
  const image = await service.shareImage(params.bucket, params["*"]);
  return reply
    .type("image/jpeg")
    .header("cache-control", "public, max-age=31536000, immutable")
    .send(image);
}
