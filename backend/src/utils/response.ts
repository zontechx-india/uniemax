import type { FastifyReply } from "fastify";

/**
 * Standard API response envelope so every endpoint returns a predictable shape.
 *
 *   success: { success: true, data, meta? }
 *   error:   { success: false, statusCode, error, message, issues? }
 */

export interface ListMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function ok<T>(data: T) {
  return { success: true as const, data };
}

export function list<T>(data: T[], meta: ListMeta) {
  return { success: true as const, data, meta };
}

export function buildListMeta(
  total: number,
  page: number,
  pageSize: number,
): ListMeta {
  return {
    total,
    page,
    pageSize,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

/** Sends PDF bytes as a download, never cached or indexed (bills, order receipts). */
export function sendPdf(
  reply: FastifyReply,
  file: { fileName: string; bytes: Buffer },
) {
  return reply
    .header("Content-Type", "application/pdf")
    .header("Content-Disposition", `attachment; filename="${file.fileName}"`)
    .header("Cache-Control", "private, no-store")
    .header("X-Robots-Tag", "noindex, nofollow")
    .send(file.bytes);
}
