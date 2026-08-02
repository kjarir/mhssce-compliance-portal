import type { Request, Response } from "express";
import { generateUploadUrlSchema, reviewRenewalSchema } from "./documents.schemas";
import { documentService } from "./documents.service";
import { workflowNotificationQueue } from "../../jobs/queues";
import { logger } from "../../core/utils/logger";

export const documentsController = {
  generateUploadUrl: async (req: Request, res: Response) => {
    const payload = generateUploadUrlSchema.parse(req.body);
    const instituteId = req.auth?.profile.institute_id ?? null;

    const result = await documentService.generateUploadUrl(payload, instituteId);

    // We no longer send the 'document_uploaded' event here.
    // That is deferred to confirmUpload so we only notify on successful uploads.

    res.status(200).json({
      success: true,
      data: result
    });
  },

  generateRenewalUploadUrl: async (req: Request, res: Response) => {
    const payload = generateUploadUrlSchema.parse(req.body);
    const instituteId = req.auth?.profile.institute_id ?? null;

    const result = await documentService.generateUploadUrl(payload, instituteId);

    // Note: To be perfectly robust, renewal uploads should also use a confirm-upload flow.
    // For now, this stays here to not break the frontend RenewModal.
    if (instituteId) {
      try {
        await workflowNotificationQueue.add(
          "workflow-notification",
          {
            event: "renewal_uploaded",
            documentId: result.documentId,
            documentName: payload.filename,
            instituteId,
            actorName: req.auth?.profile.full_name ?? "Unknown",
            actorRole: "Clerk"
          }
        );
      } catch (err) {
        logger.warn({ error: err instanceof Error ? err.message : "Unknown" }, "Failed to queue workflow notification");
      }
    }

    res.status(200).json({
      success: true,
      data: result
    });
  },

  reviewRenewal: async (req: Request, res: Response) => {
    const { id } = req.params;
    const { action, feedback } = reviewRenewalSchema.parse(req.body);
    
    const reviewerId = req.auth?.profile.id;
    const reviewerRole = req.auth?.profile.role;
    const reviewerName = req.auth?.profile.full_name ?? "Unknown";

    if (!reviewerId || !reviewerRole) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const documentId = Array.isArray(id) ? id[0] : id;

    const result = await documentService.reviewRenewal(
      documentId,
      action as "approve" | "reject",
      feedback,
      reviewerId,
      reviewerRole,
      reviewerName
    );

    res.status(200).json({
      success: true,
      data: result
    });
  },

  deleteDocument: async (req: Request, res: Response) => {
    const { id } = req.params;
    const documentId = Array.isArray(id) ? id[0] : id;
    
    // Only Admin bypasses the institute check. Others only delete within their own institute context.
    const rawInstId = req.auth?.profile.role === "Admin" ? undefined : req.auth?.profile.institute_id;
    const instituteId = rawInstId ?? undefined;
    
    await documentService.deleteDocument(documentId, instituteId);

    res.status(200).json({
      success: true,
      message: "Document successfully deleted"
    });
  },

  confirmUpload: async (req: Request, res: Response) => {
    const { confirmUploadSchema } = await import("./documents.schemas");
    const payload = confirmUploadSchema.parse(req.body);
    
    const uploaderId = req.auth?.profile.id;
    const instituteId = req.auth?.profile.institute_id;
    const uploaderRole = req.auth?.profile.role ?? "Clerk";
    const uploaderName = req.auth?.profile.full_name ?? "Unknown";

    if (!uploaderId || !instituteId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { status, milestoneDays } = await documentService.confirmUpload(payload, uploaderId, instituteId);

    // Guaranteed Notification Dispatcher: Fire and forget in-process execution so HTTP response stays fast
    const dispatchNotification = async (jobData: any) => {
      try {
        const { processWorkflowNotification } = await import("../../jobs/workers/workflow-notification.worker");
        processWorkflowNotification(jobData).catch((e) => {
          logger.error({ error: e instanceof Error ? e.message : "Unknown" }, "In-process notification error");
        });
      } catch (syncErr) {
        logger.error("In-process notification setup failed");
      }
    };

    // 1. Dispatch document_uploaded event
    await dispatchNotification({
      event: "document_uploaded",
      documentId: payload.documentId,
      documentName: payload.documentName,
      instituteId,
      actorName: uploaderName,
      actorRole: uploaderRole
    });

    // 2. Dispatch immediate expiry notification if already near/past expiration!
    if (milestoneDays !== null) {
      await dispatchNotification({
        event: "document_expiring",
        documentId: payload.documentId,
        documentName: payload.documentName,
        instituteId,
        actorName: "System",
        actorRole: "System",
        milestoneDays
      });
    }

    res.status(200).json({
      success: true,
      data: { status }
    });
  }
};
