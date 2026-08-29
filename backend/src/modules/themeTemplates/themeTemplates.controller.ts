import type { FastifyRequest, FastifyReply } from "fastify";
import { ok } from "../../utils/response.js";
import { idParamSchema } from "../../utils/zodHelpers.js";
import { recordAudit } from "../admin/adminAudit.js";
import {
  themeTemplateCreateSchema,
  themeTemplateListQuery,
  themeTemplateUpdateSchema,
} from "./themeTemplates.schema.js";
import * as service from "./themeTemplates.service.js";

/**
 * Two surfaces over one table: `listForSeller` is the read a store owner gets
 * (active rows only, never the disabled ones), and the `admin*` handlers are
 * the console's CRUD. Every admin write appends one audit line, like the rest
 * of `/admin`.
 */

export async function listForSeller() {
  return ok(await service.listActiveTemplates());
}

export async function adminList(request: FastifyRequest) {
  const query = themeTemplateListQuery.parse(request.query);
  return ok(await service.listTemplates(query));
}

export async function adminGet(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  return ok(await service.getTemplate(id));
}

export async function adminCreate(request: FastifyRequest, reply: FastifyReply) {
  const input = themeTemplateCreateSchema.parse(request.body);
  const template = await service.createTemplate(input);
  recordAudit(request, {
    action: "themeTemplate.create",
    entityType: "themeTemplate",
    entityId: template.id,
    meta: { name: template.name, isActive: template.isActive },
  });
  return reply.status(201).send(ok(template));
}

export async function adminUpdate(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const input = themeTemplateUpdateSchema.parse(request.body);
  const template = await service.updateTemplate(id, input);
  recordAudit(request, {
    action:
      // Enabling/disabling is the lever worth spotting in the trail on its
      // own — it changes what every seller can pick from.
      input.isActive === undefined
        ? "themeTemplate.update"
        : input.isActive
          ? "themeTemplate.enable"
          : "themeTemplate.disable",
    entityType: "themeTemplate",
    entityId: template.id,
    meta: { name: template.name, ...input },
  });
  return ok(template);
}

export async function adminDelete(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const template = await service.getTemplate(id);
  const result = await service.deleteTemplate(id);
  recordAudit(request, {
    action: "themeTemplate.delete",
    entityType: "themeTemplate",
    entityId: id,
    meta: { name: template.name },
  });
  return ok(result);
}
