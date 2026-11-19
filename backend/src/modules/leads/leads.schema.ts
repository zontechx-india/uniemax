import { z } from "zod";
import { paginationQuery } from "../../utils/zodHelpers.js";

/** Request shapes for the seller's Leads tab. */

export const leadListQuery = paginationQuery.extend({
  kind: z.enum(["PAYMENT_PENDING", "ACTIVE", "ABANDONED"]),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type LeadListQuery = z.infer<typeof leadListQuery>;
