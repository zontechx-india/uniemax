import { z } from "zod";

/**
 * Shapes for the one browser-facing CAPI endpoint,
 * `POST /api/v1/analytics/meta/seller-signup`.
 *
 * Short strings so a malformed/malicious body cannot bloat an event. The
 * fields come from Meta's own pixel cookies plus the event id the browser
 * generated for de-duplication — we do NOT ask the browser for email, phone
 * or anything that could be spoofed into Meta's view of this customer; those
 * come straight from the Customer row on the server.
 */

export const sellerSignupSchema = z.object({
  eventId: z.string().trim().min(8).max(128),
  method: z.enum(["email", "phone_otp", "google"]),
  fbp: z.string().trim().max(200).optional(),
  fbc: z.string().trim().max(400).optional(),
  eventSourceUrl: z
    .string()
    .trim()
    .url()
    .max(1000)
    .optional(),
});

export type SellerSignupBody = z.infer<typeof sellerSignupSchema>;
