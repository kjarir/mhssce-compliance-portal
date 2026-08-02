import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./core/utils/logger";
import { seedInitialData } from "./scripts/seed";

const server = app.listen(env.PORT, async () => {
  logger.info(`Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
  await seedInitialData();

  // In production (Render free tier without Redis server), only initialize BullMQ worker if REDIS_URL is explicitly set to a remote server
  if (env.REDIS_URL && !env.REDIS_URL.includes("127.0.0.1") && !env.REDIS_URL.includes("localhost")) {
    try {
      const { createWorkflowNotificationWorker } = await import("./jobs/workers/workflow-notification.worker");
      createWorkflowNotificationWorker();
      logger.info("BullMQ Workflow Notification Worker started");
    } catch (workerErr) {
      logger.warn("Worker setup skipped");
    }
  } else {
    logger.info("Using Direct In-Process Direct Dispatcher for EmailJS/SMTP (Redis disabled)");
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
