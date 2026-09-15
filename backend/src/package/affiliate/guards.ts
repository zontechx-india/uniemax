import type { FastifyRequest } from "fastify";
import { HttpError } from "../../utils/httpError.js";
import { deps } from "./deps.js";

declare module "fastify" {
  interface FastifyRequest {
    affiliate?: { id: string; customerId: string };
  }
}

/** Runs after `requireCustomer`: the caller must also have an affiliate profile. */
export async function requireAffiliate(request: FastifyRequest): Promise<void> {
  const customerId = request.customer?.id;
  if (!customerId) throw HttpError.unauthorized();

  const row = await deps.prisma.affiliate.findUnique({
    where: { customerId },
    select: { id: true, status: true },
  });
  if (!row) throw HttpError.forbidden("You are not an affiliate partner yet");
  if (row.status === "SUSPENDED") {
    throw HttpError.forbidden("Your affiliate account is suspended");
  }
  request.affiliate = { id: row.id, customerId };
}
