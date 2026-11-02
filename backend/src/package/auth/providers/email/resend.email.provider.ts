import { authEnv } from "../../core/config/env.js";
import type { EmailSender, CodeMessage, CodePurpose } from "../provider.types.js";

/**
 * LIVE email sender via Resend (https://resend.com) — plain REST, no SDK
 * dependency. Selected by the registry when `RESEND_API_KEY` is set.
 *
 * Requires `EMAIL_FROM` to be an address on a domain verified in the Resend
 * dashboard. Email codes have no dev bypass — every email flow sends a real
 * code through here.
 */

const SUBJECT: Record<CodePurpose, string> = {
  LOGIN: "Your sign-in code",
  LINK: "Confirm your contact details",
  EMAIL_VERIFY: "Verify your email address",
  PASSWORD_RESET: "Reset your password",
  BANK_CHANGE: "Confirm your bank account change",
};

function renderHtml({ code, purpose, expiresInMinutes }: CodeMessage): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:420px;margin:0 auto;padding:24px">
    <h2 style="margin:0 0 12px;font-size:18px;color:#111">${SUBJECT[purpose]}</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#444">
      Use this code to continue. It expires in ${expiresInMinutes} minutes.
    </p>
    <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#111;
                background:#f5f5f5;border-radius:8px;padding:16px;text-align:center">
      ${code}
    </div>
    <p style="margin:20px 0 0;font-size:12px;color:#888">
      If you didn't request this, you can safely ignore this email.
    </p>
  </div>`;
}

export const resendEmailSender: EmailSender = {
  async sendCode(message: CodeMessage): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authEnv.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: authEnv.EMAIL_FROM,
        to: [message.destination],
        subject: `${SUBJECT[message.purpose]} — ${message.code}`,
        html: renderHtml(message),
        text: `${SUBJECT[message.purpose]}: ${message.code} (expires in ${message.expiresInMinutes} minutes)`,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      // Surfaces as a 500 via the central handler; detail lands in the log.
      throw new Error(`Resend API error ${response.status}: ${detail}`);
    }
  },
};
