import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../core/utils/logger";
import { notificationQueue } from "../queues";
import type { NotificationJobData } from "../types";

type DocStatus = "Valid" | "Expiring Soon" | "Near Expiration" | "Expired";

interface DocumentRow {
  id: string;
  institute_id: string;
  document_name: string;
  expiry_date: string;
  status: DocStatus;
  notified_3m: boolean;
  notified_2m: boolean;
  notified_1m: boolean;
  notified_0d: boolean;
}

interface InstituteRow {
  id: string;
  name: string;
}

interface RecipientRow {
  full_name: string;
  phone: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Returns the start of the current UTC day (midnight) to ensure
 * all date comparisons are timezone-agnostic.
 */
const startOfUtcDay = (value: Date): Date => {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
};

/**
 * Calculates the number of whole days between today (UTC) and the given expiry date.
 * Returns negative values if the document is already expired.
 */
const getDaysUntilExpiry = (expiryDateIso: string, now: Date): number => {
  const today = startOfUtcDay(now).getTime();
  const expiry = startOfUtcDay(new Date(expiryDateIso)).getTime();
  return Math.floor((expiry - today) / MS_PER_DAY);
};

const calculateStatus = (daysUntilExpiry: number): DocStatus => {
  if (daysUntilExpiry <= 0) {
    return "Expired";
  }

  if (daysUntilExpiry < 30) {
    return "Near Expiration";
  }

  if (daysUntilExpiry < 60) {
    return "Expiring Soon";
  }

  // < 90 Days or Exactly 90 Days -> Valid (with 'Renew' UI handled front-end)
  return "Valid";
};

/**
 * Maps exact thresholds to column update keys 
 */
const getMilestoneUpdate = (daysUntilExpiry: number, doc: DocumentRow): { column: string, days: number } | null => {
  if (daysUntilExpiry <= 0 && !doc.notified_0d) {
    return { column: 'notified_0d', days: 0 };
  }
  if (daysUntilExpiry <= 30 && !doc.notified_1m) {
    return { column: 'notified_1m', days: 30 };
  }
  if (daysUntilExpiry <= 60 && !doc.notified_2m) {
    return { column: 'notified_2m', days: 60 };
  }
  if (daysUntilExpiry <= 90 && !doc.notified_3m) {
    return { column: 'notified_3m', days: 90 };
  }
  return null;
};

/**
 * Fetches the institute name by ID using supabaseAdmin (bypasses RLS).
 */
const fetchInstituteName = async (instituteId: string): Promise<string> => {
  const { data, error } = await supabaseAdmin
    .from("institutes")
    .select("id, name")
    .eq("id", instituteId)
    .maybeSingle<InstituteRow>();

  if (error || !data) {
    logger.warn({ instituteId, error: error?.message }, "Could not fetch institute name");
    return "Unknown Institute";
  }

  return data.name;
};

/**
 * Fetches Principals and Institute Authorities for a given institute,
 * who should receive expiry notifications.
 * Uses supabaseAdmin to bypass RLS (this is a system-level background job).
 */
const fetchNotificationRecipients = async (
  instituteId: string
): Promise<RecipientRow[]> => {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("full_name, phone")
    .eq("institute_id", instituteId)
    .in("role", ["Principal", "HOD", "Admin"])
    .returns<RecipientRow[]>();

  if (error) {
    logger.error(
      { instituteId, error: error.message },
      "Failed to fetch notification recipients"
    );
    return [];
  }

  return data ?? [];
};

/**
 * @security This function uses `supabaseAdmin` (service-role key) to bypass RLS.
 * It is intended ONLY for the background job scheduler — never expose it via an API route.
 *
 * Daily expiry check flow:
 * 1. Fetch all documents expiring within 90 days.
 * 2. Update their `status` column if it has changed (Valid → Expiring Soon → Expired).
 * 3. For milestone days (exactly 90, 30, 0 days), fetch responsible users and queue WhatsApp notifications.
 */
export const runDailyExpiryCheck = async (): Promise<{
  scanned: number;
  updated: number;
  notificationsQueued: number;
}> => {
  const now = new Date();
  const ninetyDaysFromNow = startOfUtcDay(
    new Date(now.getTime() + 90 * MS_PER_DAY)
  ).toISOString().slice(0, 10);

  // ── Step 1: Fetch all documents expiring within 90 days ──
  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("id, institute_id, document_name, expiry_date, status, notified_3m, notified_2m, notified_1m, notified_0d")
    .lte("expiry_date", ninetyDaysFromNow)
    .returns<DocumentRow[]>();

  if (error) {
    throw new Error(`Failed to fetch documents for expiry checker: ${error.message}`);
  }

  const documents = data ?? [];

  let updated = 0;
  let notificationsQueued = 0;

  // Cache institute names to avoid repeated lookups
  const instituteNameCache = new Map<string, string>();

  for (const doc of documents) {
    const daysUntilExpiry = getDaysUntilExpiry(doc.expiry_date, now);
    const nextStatus = calculateStatus(daysUntilExpiry);

    // ── Step 2: Update status if changed ──
    if (nextStatus !== doc.status) {
      const { error: updateError } = await supabaseAdmin
        .from("documents")
        .update({ status: nextStatus })
        .eq("id", doc.id);

      if (updateError) {
        logger.error(
          {
            documentId: doc.id,
            currentStatus: doc.status,
            nextStatus,
            error: updateError.message
          },
          "Failed to update document status"
        );
      } else {
        logger.info(
          { documentId: doc.id, from: doc.status, to: nextStatus },
          "Document status updated"
        );
        updated += 1;
      }
    }

    // ── Step 3: Check if this is a notification milestone day ──
    const milestoneParams = getMilestoneUpdate(daysUntilExpiry, doc);
    if (!milestoneParams) {
      continue;
    }

    // Resolve institute name (with cache)
    if (!instituteNameCache.has(doc.institute_id)) {
      const name = await fetchInstituteName(doc.institute_id);
      instituteNameCache.set(doc.institute_id, name);
    }

    // Update the notification column
    const { error: notifUpdateError } = await supabaseAdmin
      .from("documents")
      .update({ [milestoneParams.column]: true })
      .eq("id", doc.id);

    if (notifUpdateError) {
       logger.error({ error: notifUpdateError.message, docId: doc.id }, "Failed to update notification flags");
       continue;
    }

    // ── Step 4: Directly dispatch workflow notification (in-process) ──
    try {
      const { processWorkflowNotification } = await import("../workers/workflow-notification.worker");
      await processWorkflowNotification({
        event: "document_expiring",
        documentId: doc.id,
        documentName: doc.document_name,
        instituteId: doc.institute_id,
        actorName: "System",
        actorRole: "System",
        milestoneDays: milestoneParams.days
      });
      notificationsQueued += 1;
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : "Unknown" }, "Failed to process workflow notification for expiring doc");
    }

    logger.info(
      {
        documentId: doc.id,
        milestoneDays: milestoneParams.days,
      },
      "Document expiring workflow notification queued"
    );
  }

  return {
    scanned: documents.length,
    updated,
    notificationsQueued
  };
};
