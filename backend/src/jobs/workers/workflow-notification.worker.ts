import { Worker } from "bullmq";
import { createRedisConnection } from "../../config/redis";
import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../core/utils/logger";
import { QUEUE_NAMES } from "../queue-names";
import { sendWorkflowEmail } from "../../modules/notifications/email.service";
import type { WorkflowNotificationJobData } from "../types";

interface UserRow {
  id: string;
  full_name: string;
  role: string;
  email?: string;
}

/**
 * Fetch users by role within an institute.
 * Uses supabaseAdmin to bypass RLS (system-level background job).
 */
const fetchUsersByRole = async (
  instituteId: string,
  roles: string[]
): Promise<UserRow[]> => {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, full_name, role")
    .eq("institute_id", instituteId)
    .in("role", roles)
    .returns<UserRow[]>();

  if (error) {
    logger.error({ instituteId, roles, error: error.message }, "Failed to fetch users by role");
    return [];
  }

  return data ?? [];
};

/**
 * Fetch a user's email from auth.users via the Auth Admin API.
 */
const fetchUserEmail = async (userId: string): Promise<string | null> => {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data.user) {
    return null;
  }
  return data.user.email ?? null;
};

/**
 * Fetch the uploader's info for a document.
 */
const fetchUploader = async (documentId: string): Promise<UserRow | null> => {
  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("uploader_id")
    .eq("id", documentId)
    .single<{ uploader_id: string | null }>();

  if (error || !data?.uploader_id) {
    return null;
  }

  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select("id, full_name, role")
    .eq("id", data.uploader_id)
    .single<UserRow>();

  if (userError || !user) {
    return null;
  }

  return user;
};

/**
 * Insert an in-app notification into the database.
 */
const insertNotification = async (
  userId: string,
  title: string,
  message: string,
  type: string
): Promise<void> => {
  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    title,
    message,
    type,
    is_read: false
  });

  if (error) {
    logger.error({ userId, title, error: error.message }, "Failed to insert notification");
  }
};

/**
 * Build email HTML for workflow notifications matching the new portal design system.
 */
const buildEmailHtml = (title: string, message: string, documentName: string): string => {
  const portalUrl = process.env.CORS_ORIGIN ?? "http://localhost:5173";
  const isWarning = title.toLowerCase().includes("expir") || title.toLowerCase().includes("action");

  const badgeBg = isWarning ? "#FFFBEB" : "#ECFDF5";
  const badgeBorder = isWarning ? "#FDE68A" : "#A7F3D0";
  const badgeColor = isWarning ? "#B45309" : "#047857";
  const badgeText = isWarning ? "ACTION REQUIRED" : "COMPLIANCE NOTICE";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f4f6f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f6f5; padding: 40px 16px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
                
                <!-- Header Banner -->
                <tr>
                  <td style="background-color: #064E3B; padding: 28px 32px; text-align: left;">
                    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td>
                          <div style="font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; line-height: 1;">
                            Anjuman's
                          </div>
                          <div style="font-size: 10px; font-weight: 700; color: #6ee7b7; text-transform: uppercase; letter-spacing: 2px; margin-top: 4px;">
                            Compliance Portal
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Content Body -->
                <tr>
                  <td style="padding: 32px;">
                    <!-- Badge -->
                    <div style="display: inline-block; background-color: ${badgeBg}; border: 1px solid ${badgeBorder}; color: ${badgeColor}; font-size: 11px; font-weight: 700; padding: 4px 12px; rounded-radius: 9999px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px;">
                      ${badgeText}
                    </div>

                    <!-- Title -->
                    <h1 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 800; color: #111827; letter-spacing: -0.3px; line-height: 1.3;">
                      ${title}
                    </h1>

                    <!-- Message Body -->
                    <p style="margin: 0 0 24px 0; font-size: 14px; font-weight: 500; color: #4b5563; line-height: 1.6;">
                      ${message}
                    </p>

                    <!-- Document Information Card -->
                    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f9fafb; border: 1px solid #f3f4f6; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                      <tr>
                        <td>
                          <div style="font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
                            Document Title
                          </div>
                          <div style="font-size: 15px; font-weight: 700; color: #111827;">
                            ${documentName}
                          </div>
                        </td>
                      </tr>
                    </table>

                    <!-- Call To Action Button -->
                    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="left">
                          <a href="${portalUrl}" target="_blank" style="display: inline-block; background-color: #064E3B; color: #ffffff; font-size: 13px; font-weight: 700; text-decoration: none; padding: 12px 28px; border-radius: 10px; box-shadow: 0 2px 4px rgba(6, 78, 59, 0.2);">
                            Open Compliance Portal →
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background-color: #f9fafb; border-top: 1px solid #f3f4f6; padding: 20px 32px; text-align: center;">
                    <p style="margin: 0; font-size: 12px; font-weight: 500; color: #9ca3af;">
                      This is an automated notification from Anjuman's AICP Compliance Portal.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
};

export const processWorkflowNotification = async (data: WorkflowNotificationJobData) => {
  const { event, documentId, documentName, instituteId, actorName, actorRole, feedback, decision } = data;

  logger.info(
    { event, documentName, actorName, actorRole },
    "Processing workflow notification"
  );

  let recipients: UserRow[] = [];
  let title: string;
  let message: string;
  let notificationType: string;

  switch (event) {
    case "document_uploaded": {
      recipients = await fetchUsersByRole(instituteId, ["HOD", "Principal"]);
      const uploader = await fetchUploader(documentId);
      if (uploader) {
        recipients.push(uploader);
      }
      title = "New Document Uploaded";
      message = `${actorName} (${actorRole}) has uploaded "${documentName}" for review.`;
      notificationType = "upload";
      break;
    }

    case "renewal_uploaded": {
      recipients = await fetchUsersByRole(instituteId, ["HOD", "Principal"]);
      const uploader = await fetchUploader(documentId);
      if (uploader) {
        recipients.push(uploader);
      }
      title = "Document Renewal Submitted";
      message = `${actorName} (${actorRole}) has submitted a renewal for "${documentName}". It is awaiting your review.`;
      notificationType = "renewal";
      break;
    }

    case "document_expiring": {
      recipients = await fetchUsersByRole(instituteId, ["HOD", "Principal"]);
      const uploader = await fetchUploader(documentId);
      if (uploader) {
        recipients.push(uploader);
      }
      const milestoneDays = data.milestoneDays ?? 0;
      title = "Action Required: Document Expiring";
      message = `"${documentName}" is expiring in ${milestoneDays} ${milestoneDays === 1 ? 'day' : 'days'} (or is already expired). Please take action to renew it.`;
      notificationType = "expiry_warning";
      break;
    }

    case "hod_feedback": {
      const uploader = await fetchUploader(documentId);
      const principals = await fetchUsersByRole(instituteId, ["Principal"]);
      if (uploader) {
        recipients.push(uploader);
      }
      recipients.push(...principals);
      title = "HOD Feedback Submitted";
      message = `${actorName} (HOD) has submitted feedback on "${documentName}": "${feedback ?? "(no comment)"}"`;
      notificationType = "feedback";
      break;
    }

    case "principal_decision": {
      const uploaderForDecision = await fetchUploader(documentId);
      const hods = await fetchUsersByRole(instituteId, ["HOD"]);
      if (uploaderForDecision) {
        recipients.push(uploaderForDecision);
      }
      recipients.push(...hods);
      const decisionLabel = decision === "approved" ? "APPROVED ✅" : "REJECTED ❌";
      title = `Document ${decisionLabel}`;
      message = `${actorName} (Principal) has ${decision} "${documentName}". Feedback: "${feedback ?? "(no comment)"}"`;
      notificationType = "decision";
      break;
    }

    default:
      logger.warn({ event }, "Unknown workflow notification event");
      return { sent: false };
  }

  const uniqueRecipients = Array.from(
    new Map(recipients.map((r) => [r.id, r])).values()
  );

  let notificationsInserted = 0;
  let emailsSent = 0;

  for (const recipient of uniqueRecipients) {
    await insertNotification(recipient.id, title, message, notificationType);
    notificationsInserted++;

    const email = await fetchUserEmail(recipient.id);
    if (email) {
      try {
        const html = buildEmailHtml(title, message, documentName);
        await sendWorkflowEmail(email, `[AICP] ${title}`, html);
        emailsSent++;
      } catch {
        logger.warn({ recipientId: recipient.id }, "Email send failed, in-app notification saved");
      }
    }
  }

  logger.info(
    {
      event,
      recipientCount: uniqueRecipients.length,
      notificationsInserted,
      emailsSent
    },
    "Workflow notification processed"
  );

  return { sent: true, notificationsInserted, emailsSent };
};

export const createWorkflowNotificationWorker = (): Worker<WorkflowNotificationJobData> => {
  const worker = new Worker<WorkflowNotificationJobData>(
    QUEUE_NAMES.WORKFLOW_NOTIFICATION,
    async (job) => {
      const result = await processWorkflowNotification(job.data);
      return result;
    },
    {
      connection: createRedisConnection(),
      concurrency: 5
    }
  );

  worker.on("failed", (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        event: job?.data?.event,
        error: err.message
      },
      "Workflow notification worker job failed"
    );
  });

  return worker;
};
