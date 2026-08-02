import { randomUUID } from "node:crypto";
import { env } from "../../config/env";
import { supabaseAdmin } from "../../config/supabase";
import { AppError } from "../../core/errors/AppError";
import type { GenerateUploadUrlInput, ConfirmUploadInput } from "./documents.schemas";

const sanitizeFilename = (filename: string): string => {
  return filename.replace(/[^a-zA-Z0-9_.-]/g, "-");
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const startOfUtcDay = (value: Date): Date => {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
};

export const getDaysUntilExpiry = (expiryDateIso: string, now: Date): number => {
  const today = startOfUtcDay(now).getTime();
  const expiry = startOfUtcDay(new Date(expiryDateIso)).getTime();
  return Math.floor((expiry - today) / MS_PER_DAY);
};

export const calculateStatusAndFlags = (expiryDate: string) => {
  const daysUntilExpiry = getDaysUntilExpiry(expiryDate, new Date());
  
  let status: "Valid" | "Expiring Soon" | "Near Expiration" | "Expired" = "Valid";
  const flags = { notified_3m: false, notified_2m: false, notified_1m: false, notified_0d: false };
  let milestoneDays: number | null = null;

  if (daysUntilExpiry <= 0) {
    status = "Expired";
    flags.notified_0d = true; flags.notified_1m = true; flags.notified_2m = true; flags.notified_3m = true;
    milestoneDays = 0;
  } else if (daysUntilExpiry < 30) {
    status = "Near Expiration";
    flags.notified_1m = true; flags.notified_2m = true; flags.notified_3m = true;
    milestoneDays = daysUntilExpiry;
  } else if (daysUntilExpiry < 60) {
    status = "Expiring Soon";
    flags.notified_2m = true; flags.notified_3m = true;
    milestoneDays = daysUntilExpiry;
  } else if (daysUntilExpiry <= 90) {
    status = "Valid";
    flags.notified_3m = true;
    milestoneDays = daysUntilExpiry;
  }

  return { status, flags, daysUntilExpiry, milestoneDays };
};

export const documentService = {
  /**
   * @security ⚠️  RLS BYPASS WARNING ⚠️
   *
   * This function uses `supabaseAdmin` (service-role key) to generate
   * a signed upload URL. The service-role key **completely bypasses**
   * PostgreSQL Row Level Security (RLS).
   *
   * This means:
   *  - The storage operation is NOT subject to any RLS policies.
   *  - There is NO automatic authorization check at the database level.
   *
   * ⛔  Any route that calls this service MUST:
   *  1. Authenticate the user via the `authenticate` middleware.
   *  2. Authorize the user's role via the `authorizeRoles` middleware.
   *  3. Validate the request payload via Zod schemas in the controller.
   *
   * Never expose this function to unauthenticated or unauthorized callers.
   */
  generateUploadUrl: async (
    payload: GenerateUploadUrlInput,
    instituteId: string | null
  ): Promise<{ documentId: string; uploadUrl: string; securePath: string }> => {
    if (!instituteId) {
      throw new AppError("Authenticated user has no institute mapping", 403);
    }

    const documentId = randomUUID();
    const safeFilename = sanitizeFilename(payload.filename);
    const securePath = `${instituteId}/${documentId}/${safeFilename}`;

    const { data, error } = await supabaseAdmin
      .storage
      .from(env.SUPABASE_STORAGE_BUCKET)
      .createSignedUploadUrl(securePath);

    if (error || !data) {
      throw new AppError("Failed to generate signed upload URL", 500, error?.message);
    }

    return {
      documentId,
      uploadUrl: data.signedUrl,
      securePath
    };
  },

  confirmUpload: async (
    payload: ConfirmUploadInput,
    uploaderId: string,
    instituteId: string
  ) => {
    const { status, flags, milestoneDays } = calculateStatusAndFlags(payload.expiryDate);

    const { error: insertError } = await supabaseAdmin.from("documents").insert({
      id: payload.documentId,
      institute_id: instituteId,
      uploader_id: uploaderId,
      document_name: payload.documentName,
      category: payload.category,
      responsible_person: payload.responsiblePerson,
      expiry_date: payload.expiryDate,
      file_path: payload.securePath,
      status: status,
      ...flags
    });

    if (insertError) {
      throw new AppError("Failed to save document metadata", 500, insertError.message);
    }

    return { status, milestoneDays };
  },

  reviewRenewal: async (
    renewalId: string,
    action: "approve" | "reject",
    feedback: string | undefined,
    reviewerId: string,
    reviewerRole: string,
    reviewerName: string
  ) => {
    // 1. Fetch the renewal and original doc
    const { data: renewal, error: renewalErr } = await supabaseAdmin
      .from("document_renewals")
      .select("*, documents(*)")
      .eq("id", renewalId)
      .single();

    if (renewalErr || !renewal) {
      throw new AppError("Renewal not found", 404);
    }

    if (renewal.status === "Approved" || renewal.status === "Rejected") {
      throw new AppError("Renewal has already been processed", 400);
    }

    const { workflowNotificationQueue } = await import("../../jobs/queues");
    let nextStatus: string = renewal.status;
    let updateFields: any = {};
    let notificationEvent: "hod_feedback" | "principal_decision" | null = null;
    let decision: "approved" | "rejected" | undefined = undefined;

    if (reviewerRole === "HOD") {
      if (action !== "approve" && action !== "reject") {
        throw new AppError("Invalid action for HOD", 400);
      }
      
      if (action === "approve") {
        nextStatus = "Pending Principal";
      } else {
        nextStatus = "Rejected";
        decision = "rejected";
        notificationEvent = "principal_decision"; // Reusing the decision workflow
      }
      updateFields = { 
        status: nextStatus,
        hod_feedback: feedback 
      };

    } else if (reviewerRole === "Principal" || reviewerRole === "Admin") {
      if (action === "approve") {
        nextStatus = "Approved";
        decision = "approved";
      } else {
        nextStatus = "Rejected";
        decision = "rejected";
      }
      notificationEvent = "principal_decision";
      updateFields = { 
        status: nextStatus,
        principal_feedback: feedback 
      };
    } else {
      throw new AppError("Unauthorized role for reviewing renewals", 403);
    }

    // 2. Update the renewal record
    const { error: updateErr } = await supabaseAdmin
      .from("document_renewals")
      .update(updateFields)
      .eq("id", renewalId);

    if (updateErr) {
      throw new AppError("Failed to update renewal", 500, updateErr.message);
    }

    // 3. If fully approved, replace original document!
    let immediateMilestoneDays: number | null = null;
    if (nextStatus === "Approved") {
      const { status: calculatedStatus, flags, milestoneDays } = calculateStatusAndFlags(renewal.expiry_date);
      immediateMilestoneDays = milestoneDays;

      const { error: docUpdateErr } = await supabaseAdmin
        .from("documents")
        .update({
          file_path: renewal.file_path,
          expiry_date: renewal.expiry_date,
          status: calculatedStatus,
          ...flags
        })
        .eq("id", renewal.document_id);

      if (docUpdateErr) {
        throw new AppError("Failed to update parent document", 500, docUpdateErr.message);
      }
    }

    // 4. Send notifications
    if (notificationEvent) {
      try {
        await workflowNotificationQueue.add(
          "workflow-notification",
          {
            event: notificationEvent,
            documentId: renewal.document_id,
            documentName: (renewal.documents as any)?.document_name ?? "Unknown Document",
            instituteId: (renewal.documents as any)?.institute_id,
            actorName: reviewerName,
            actorRole: reviewerRole,
            feedback,
            decision
          }
        );
        
        // If renewing with an intrinsically expiring document, immediately dispatch expiry warning!
        if (immediateMilestoneDays !== null) {
          await workflowNotificationQueue.add(
            "workflow-notification",
            {
              event: "document_expiring",
              documentId: renewal.document_id,
              documentName: (renewal.documents as any)?.document_name ?? "Unknown Document",
              instituteId: (renewal.documents as any)?.institute_id,
              actorName: "System",
              actorRole: "System",
              milestoneDays: immediateMilestoneDays
            }
          );
        }
      } catch (err) {
        // Silently ignore queue errors
      }
    }

    return { success: true, status: nextStatus };
  },

  deleteDocument: async (documentId: string, _instituteId: string | undefined): Promise<void> => {
    // Fetch parent document to get its file_path
    const { data: document, error: docErr } = await supabaseAdmin
      .from("documents")
      .select("file_path, institute_id")
      .eq("id", documentId)
      .single();

    if (docErr || !document) {
      throw new AppError("Document not found", 404);
    }

    // Safety check: ensure Institute ID matches if provided (for context isolation)
    if (_instituteId && document.institute_id !== _instituteId) {
      throw new AppError("Unauthorized to delete this document", 403);
    }

    // Fetch all connected renewals to harvest their file paths
    const { data: renewals, error: renErr } = await supabaseAdmin
      .from("document_renewals")
      .select("file_path")
      .eq("document_id", documentId);

    if (renErr) {
      throw new AppError("Failed to fetch document renewals", 500, renErr.message);
    }

    const filesToDelete = [
      document.file_path,
      ...(renewals || []).map(r => r.file_path)
    ];

    // Delete the blobs from Supabase Storage
    const { error: storageErr } = await supabaseAdmin
      .storage
      .from(env.SUPABASE_STORAGE_BUCKET)
      .remove(filesToDelete);

    if (storageErr) {
      throw new AppError("Failed to delete files from storage", 500, storageErr.message);
    }

    // Delete the database row
    // (Cascade handles approvals & document_renewals tables)
    const { error: deleteErr } = await supabaseAdmin
      .from("documents")
      .delete()
      .eq("id", documentId);

    if (deleteErr) {
      throw new AppError("Failed to delete document record", 500, deleteErr.message);
    }
  }
};
