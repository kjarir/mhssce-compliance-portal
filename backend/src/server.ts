import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./core/utils/logger";
import { seedInitialData } from "./scripts/seed";

const server = app.listen(env.PORT, async () => {
  logger.info(`Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
  await seedInitialData();

  // In production (Render free tier), start worker in-process if configured
  try {
    const { createWorkflowNotificationWorker } = await import("./jobs/workers/workflow-notification.worker");
    createWorkflowNotificationWorker();
    logger.info("In-process BullMQ Workflow Notification Worker started successfully");
  } catch (workerErr) {
    logger.warn({ error: workerErr instanceof Error ? workerErr.message : "Unknown" }, "In-process worker initialization skipped (Redis offline / separate worker mode)");
  }
});

const shutdown = (signal: string) => {
  logger.info(`Received ${signal}, shutting down API server`);
  server.close((err) => {
    if (err) {
      logger.error({ err }, "Error while closing server");
      process.exit(1);
      return;
    }

    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
