import type { FastifyRequest } from "fastify";
import { ok } from "../../utils/response.js";
import { recordAudit } from "../admin/adminAudit.js";
import { marketHomeSectionsSchema } from "./marketHome.schema.js";
import * as service from "./marketHome.service.js";

/**
 * `getSections` serves both mounts (public and admin) — the list holds nothing
 * private. `updateSections` runs inside the `requireAdmin` subtree.
 */

export async function getSections() {
  return ok(await service.getSections());
}

export async function updateSections(request: FastifyRequest) {
  const input = marketHomeSectionsSchema.parse(request.body);
  const sections = await service.saveSections(input);
  recordAudit(request, {
    action: "marketHome.sections.update",
    entityType: "platformSetting",
    entityId: "marketHomeSections",
    meta: {
      order: sections.map((s) => s.key),
      hidden: sections.filter((s) => !s.enabled).map((s) => s.key),
    },
  });
  return ok(sections);
}
