import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { env } from "../../config/env";
import { logger } from "../../core/utils/logger";

let transporter: Transporter | null = null;

/**
 * Send email using Brevo Transactional REST API (https://api.brevo.com/v3/smtp/email)
 */
const sendBrevoApiEmail = async (to: string, subject: string, htmlBody: string): Promise<boolean> => {
  const apiKey = env.BREVO_API_KEY || process.env.BREVO_API_KEY;
  if (!apiKey) return false;

  const senderEmail = env.EMAIL_FROM_ADDRESS ?? "noreply@aicp.local";

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": apiKey,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sender: { name: "AICP Portal", email: senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent: htmlBody
      })
    });

    if (res.ok) {
      const data = await res.json();
      logger.info({ messageId: (data as any)?.messageId, to, subject }, "Workflow email sent successfully via Brevo API");
      return true;
    } else {
      const errText = await res.text();
      logger.warn({ status: res.status, errText }, "Brevo API email failed, attempting SMTP fallback");
      return false;
    }
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : "Unknown" }, "Brevo API request error");
    return false;
  }
};

/**
 * Lazily create the Nodemailer SMTP transporter (Brevo SMTP or Gmail SMTP).
 */
const getTransporter = (): Transporter | null => {
  if (transporter) {
    return transporter;
  }

  // Auto-detect Brevo SMTP if host is smtp-relay.brevo.com or custom
  const host = env.EMAIL_SMTP_HOST || "smtp-relay.brevo.com";
  const user = env.EMAIL_SMTP_USER;
  const pass = env.EMAIL_SMTP_PASS;

  if (!user || !pass) {
    logger.warn("SMTP credentials not configured — email notifications disabled");
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port: env.EMAIL_SMTP_PORT || 587,
    secure: env.EMAIL_SMTP_PORT === 465,
    auth: { user, pass }
  });

  return transporter;
};

/**
 * Send a workflow notification email.
 * First tries Brevo API, then falls back to Brevo SMTP / Nodemailer.
 */
export const sendWorkflowEmail = async (
  to: string,
  subject: string,
  htmlBody: string
): Promise<boolean> => {
  // 1. Try Brevo HTTPS API first if BREVO_API_KEY is configured
  if (env.BREVO_API_KEY || process.env.BREVO_API_KEY) {
    const sentViaBrevo = await sendBrevoApiEmail(to, subject, htmlBody);
    if (sentViaBrevo) return true;
  }

  // 2. Fallback to Nodemailer SMTP (works with Brevo SMTP or Gmail SMTP)
  const mailer = getTransporter();

  if (!mailer) {
    logger.info({ to, subject }, "Skipping email — Neither Brevo API nor SMTP configured");
    return false;
  }

  const fromAddress = env.EMAIL_FROM_ADDRESS ?? env.EMAIL_SMTP_USER ?? "noreply@aicp.local";

  try {
    const info = await mailer.sendMail({
      from: `"AICP Portal" <${fromAddress}>`,
      to,
      subject,
      html: htmlBody
    });

    logger.info(
      { messageId: info.messageId, to, subject },
      "Workflow email sent successfully via SMTP"
    );

    return true;
  } catch (error) {
    logger.error(
      { to, subject, error: error instanceof Error ? error.message : "Unknown" },
      "Failed to send workflow email"
    );
    throw error;
  }
};
