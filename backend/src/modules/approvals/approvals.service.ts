import { supabaseAdmin } from "../../config/supabase";
import { AppError } from "../../core/errors/AppError";
import type { SubmitApprovalInput } from "./approvals.schemas";

interface ApprovalRow {
  id: string;
  document_id: string;
  reviewer_id: string | null;
  feedback: string | null;
  step: string;
  created_at: string;
}

interface ApprovalWithDoc extends ApprovalRow {
  documents: {
    id: string;
    document_name: string;
    institute_id: string;
    uploader_id: string | null;
    status: string;
    institutes: { name: string } | null;
  } | null;
  users: { full_name: string } | null;
}

type ApprovalStep = "Pending" | "HOD Reviewed" | "Principal Approved" | "Rejected";

export const approvalsService = {
  /**
   * Submit feedback, approve, or reject a document.
   * - HOD can only submit "feedback" action → step becomes "HOD Reviewed"
   * - Principal can submit "approve" or "reject" → step becomes "Principal Approved" or "Rejected"
   */
  submit: async (
    payload: SubmitApprovalInput,
    reviewerId: string,
    reviewerRole: string
  ): Promise<ApprovalRow> => {
    // Determine the new step based on role + action
    let newStep: ApprovalStep;

    if (reviewerRole === "HOD") {
      if (payload.action !== "feedback" && payload.action !== "approve") {
        throw new AppError("Invalid action for HOD", 403);
      }
      newStep = "HOD Reviewed";
    } else if (reviewerRole === "Principal") {
      if (payload.action === "approve") {
        newStep = "Principal Approved";
      } else if (payload.action === "reject") {
        newStep = "Rejected";
      } else {
        // Principal can also give feedback without final decision
        newStep = "HOD Reviewed";
      }
    } else if (reviewerRole === "Admin") {
      // Admin can do anything
      if (payload.action === "approve") {
        newStep = "Principal Approved";
      } else if (payload.action === "reject") {
        newStep = "Rejected";
      } else {
        newStep = "HOD Reviewed";
      }
    } else {
      throw new AppError("Unauthorized to manage approvals", 403);
    }

    // Insert the approval record
    const { data, error } = await supabaseAdmin
      .from("approvals")
      .insert({
        document_id: payload.documentId,
        reviewer_id: reviewerId,
        feedback: payload.feedback,
        step: newStep
      })
      .select("id, document_id, reviewer_id, feedback, step, created_at")
      .single<ApprovalRow>();

    if (error || !data) {
      throw new AppError("Failed to submit approval", 400, error?.message);
    }

    // If Principal or Admin REJECTS an initial approval upload, completely purge document & storage files!
    if (newStep === "Rejected") {
      try {
        const { documentService } = await import("../documents/documents.service");
        await documentService.deleteDocument(payload.documentId, undefined);
      } catch (delErr) {
        // Silently log if already deleted
      }
    }

    return data;
  },

  /**
   * List approvals. If instituteId is provided, filter by institute.
   * Admin gets all approvals (pass null).
   */
  list: async (instituteId: string | null): Promise<ApprovalWithDoc[]> => {
    let query = supabaseAdmin
      .from("approvals")
      .select("*, documents(id, document_name, institute_id, uploader_id, status, institutes(name)), users:reviewer_id(full_name)")
      .order("created_at", { ascending: false });

    // If not admin (has institute_id), filter by institute
    if (instituteId) {
      // We need to filter approvals where the document belongs to this institute
      // Supabase doesn't support nested filters easily, so we do a subquery approach
      const { data: docIds, error: docErr } = await supabaseAdmin
        .from("documents")
        .select("id")
        .eq("institute_id", instituteId);

      if (docErr) {
        throw new AppError("Failed to fetch documents for approvals", 500, docErr.message);
      }

      const ids = (docIds ?? []).map((d: { id: string }) => d.id);
      if (ids.length === 0) {
        return [];
      }

      query = query.in("document_id", ids);
    }

    const { data, error } = await query.returns<ApprovalWithDoc[]>();

    if (error) {
      throw new AppError("Failed to fetch approvals", 500, error.message);
    }

    return data ?? [];
  },

  /**
   * Get document details for notification purposes.
   */
  getDocumentInfo: async (documentId: string) => {
    const { data, error } = await supabaseAdmin
      .from("documents")
      .select("id, document_name, institute_id, uploader_id")
      .eq("id", documentId)
      .single<{ id: string; document_name: string; institute_id: string; uploader_id: string | null }>();

    if (error || !data) {
      return null;
    }

    return data;
  }
};
