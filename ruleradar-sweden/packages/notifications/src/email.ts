import { Resend } from "resend";
import { loadConfig, logger } from "@ruleradar/shared";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(input: SendEmailInput) {
  const config = loadConfig();
  if (!config.RESEND_API_KEY) {
    logger.warn("email_skipped_no_resend_key", { to: input.to, subject: input.subject });
    return { provider: "resend", id: "skipped-no-key", skipped: true };
  }
  const resend = new Resend(config.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: config.ALERT_FROM_EMAIL,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text
  });
  if (result.error) throw new Error(result.error.message);
  return { provider: "resend", id: result.data?.id || "unknown", skipped: false };
}
