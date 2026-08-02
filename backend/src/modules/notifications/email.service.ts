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
 * Send email using EmailJS REST API (https://api.emailjs.com/api/v1.0/email/send)
 * Instant, direct, non-blocking delivery.
 */
const sendEmailJsApi = async (
  to: string,
  subject: string,
  htmlBody: string,
  templateParams?: Record<string, any>
): Promise<boolean> => {
  const serviceId = env.EMAILJS_SERVICE_ID || process.env.EMAILJS_SERVICE_ID || "service_idnms2n";
  const templateId = env.EMAILJS_TEMPLATE_ID || process.env.EMAILJS_TEMPLATE_ID || "template_65bc7xg";
  const publicKey = env.EMAILJS_PUBLIC_KEY || process.env.EMAILJS_PUBLIC_KEY || "cqZhf1ZbQsHb4z3JF";
  const privateKey = env.EMAILJS_PRIVATE_KEY || process.env.EMAILJS_PRIVATE_KEY || "OXIZvo0A_kGgDUkOWKpCS";

  try {
    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        accessToken: privateKey,
        template_params: {
          to_email: to,
          recipient_name: templateParams?.recipientName ?? to,
          badge_text: templateParams?.badgeText ?? "COMPLIANCE NOTICE",
          notification_title: subject,
          notification_message: templateParams?.message ?? subject,
          document_name: templateParams?.documentName ?? "Compliance Document",
          institute_name: templateParams?.instituteName ?? "Anjuman-I-Islam",
          expiry_date: templateParams?.expiryDate ?? "N/A",
          portal_url: process.env.CORS_ORIGIN ?? "https://mhssce-compliance-portal.vercel.app",
          html_content: htmlBody
        }
      })
    });

    if (res.ok) {
      logger.info({ to, subject }, "Workflow email sent instantly via EmailJS API");
      return true;
    } else {
      const errText = await res.text();
      logger.warn({ status: res.status, errText }, "EmailJS API failed, attempting SMTP fallback");
      return false;
    }
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : "Unknown" }, "EmailJS API request error");
    return false;
  }
};

/**
 * Send a workflow notification email.
 * First tries EmailJS API, then Brevo API, then falls back to Nodemailer SMTP.
 */
export const sendWorkflowEmail = async (
  to: string,
  subject: string,
  htmlBody: string,
  templateParams?: Record<string, any>
): Promise<boolean> => {
  // 1. Try EmailJS API (Primary instant delivery)
  const sentViaEmailJs = await sendEmailJsApi(to, subject, htmlBody, templateParams);
  if (sentViaEmailJs) return true;

  // 2. Try Brevo HTTPS API if configured
  if (env.BREVO_API_KEY || process.env.BREVO_API_KEY) {
    const sentViaBrevo = await sendBrevoApiEmail(to, subject, htmlBody);
    if (sentViaBrevo) return true;
  }

  // 3. Fallback to Nodemailer SMTP
  const mailer = getTransporter();

  if (!mailer) {
    logger.info({ to, subject }, "Skipping email — No active mail service configured");
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
    return false;
  }
};
