import "dotenv/config";

/**
 * Minimal transactional-mail package (same self-contained convention as
 * package/auth and package/storage — parses its own env, no app imports).
 *
 * Reuses the SAME env vars as the auth package's code emails (RESEND_API_KEY,
 * EMAIL_FROM), so one Resend setup powers both. Without an API key it
 * degrades to a console log — dev keeps working, nothing is silently lost.
 *
 * `PUBLIC_WEB_URL` (optional) is the storefront's public origin
 * (e.g. https://shop.example.com) — when set, emails carry deep links.
 */

const blank = (value: string | undefined) =>
  value && value.trim() ? value.trim() : undefined;

const RESEND_API_KEY = blank(process.env["RESEND_API_KEY"]);
const EMAIL_FROM = blank(process.env["EMAIL_FROM"]) ?? "connect@zontechx.com";

/** False = no RESEND_API_KEY: mail is printed to the server console, not sent. */
export const mailConfigured = RESEND_API_KEY !== undefined;

/** Storefront origin for links inside emails; null = links omitted. */
export const publicWebUrl: string | null =
  blank(process.env["PUBLIC_WEB_URL"])?.replace(/\/+$/, "") ?? null;

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Send one email. Throws on delivery failure — callers that must not fail
 * their own flow (e.g. order placement) fire-and-forget with a catch.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  if (!RESEND_API_KEY) {
    // eslint-disable-next-line no-console
    console.log(
      `📧 [mail:console] to=${message.to} subject="${message.subject}"\n${message.text}`,
    );
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend API error ${response.status}: ${detail}`);
  }
}
