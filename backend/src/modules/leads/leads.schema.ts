import { z } from "zod";
import { paginationQuery } from "../../utils/zodHelpers.js";

/** Request shapes for the seller's Leads tab. */

export const leadListQuery = paginationQuery
  .extend({
    kind: z.enum(["PAYMENT_PENDING", "ACTIVE", "ABANDONED"]),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    /**
     * The date filter — applies to the chosen `kind` only (not ACTIVE).
     * Missing = that kind's default window; the server caps how far back.
     */
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: "The start date must be on or before the end date",
    path: ["from"],
  });

export type LeadListQuery = z.infer<typeof leadListQuery>;
