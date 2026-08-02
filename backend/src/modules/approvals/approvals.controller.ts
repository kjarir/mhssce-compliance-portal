import type { Request, Response } from "express";
import { submitApprovalSchema } from "./approvals.schemas";
import { approvalsService } from "./approvals.service";
import { workflowNotificationQueue } from "../../jobs/queues";
import { logger } from "../../core/utils/logger";
import type { WorkflowNotificationJobData } from "../../jobs/types";

export const approvalsController = {
  submit: async (req: Request, res: Response) => {
    const payload = submitApprovalSchema.parse(req.body);
    const reviewerId = req.auth!.profile.id;
    const reviewerRole = req.auth!.profile.role;
    const reviewerName = req.auth!.profile.full_name;

    const approval = await approvalsService.submit(payload, reviewerId, reviewerRole);

    // Dispatch workflow notification (non-blocking)
    const docInfo = await approvalsService.getDocumentInfo(payload.documentId);
    if (docInfo) {
      let event: WorkflowNotificationJobData["event"];

      if (reviewerRole === "HOD") {
        event = "hod_feedback";
      } else if (reviewerRole === "Principal" || reviewerRole === "Admin") {
        event = "principal_decision";
      } else {
        event = "hod_feedback";
      }

      try {
        await workflowNotificationQueue.add(
          "workflow-notification",
          {
            event,
            documentId: docInfo.id,
            documentName: docInfo.document_name,
            instituteId: docInfo.institute_id,
            actorName: reviewerName,
            actorRole: reviewerRole,
            feedback: payload.feedback,
            decision: payload.action === "approve" ? "approved" : payload.action === "reject" ? "rejected" : undefined
          }
        );
      } catch (err) {
        logger.info("Redis queue unavailable; processing approval notification in-process");
        try {
          const { processWorkflowNotification } = await import("../../jobs/workers/workflow-notification.worker");
          processWorkflowNotification({
            event,
            documentId: docInfo.id,
            documentName: docInfo.document_name,
            instituteId: docInfo.institute_id,
            actorName: reviewerName,
            actorRole: reviewerRole,
            feedback: payload.feedback,
            decision: payload.action === "approve" ? "approved" : payload.action === "reject" ? "rejected" : undefined
          }).catch((e) => {
            logger.error({ error: e instanceof Error ? e.message : "Unknown" }, "In-process approval notification error");
          });
        } catch (syncErr) {
          logger.error("Failed to process approval notification in-process");
        }
      }
    }

    res.status(201).json({
      success: true,
      data: approval
    });
  },

  list: async (req: Request, res: Response) => {
    const role = req.auth!.profile.role;
    const instituteId = role === "Admin" ? null : req.auth!.profile.institute_id;

    const approvals = await approvalsService.list(instituteId);

    res.status(200).json({
      success: true,
      data: approvals
    });
  }
};
