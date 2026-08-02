import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./core/utils/logger";
import { seedInitialData } from "./scripts/seed";

const server = app.listen(env.PORT, async () => {
  logger.info(`Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
  await seedInitialData();

  // Run daily expiry check upon boot & schedule in-process hourly check
  try {
    const { runDailyExpiryCheck } = await import("./jobs/services/expiry-check.service");
    runDailyExpiryCheck()
      .then((res) => logger.info(res, "Initial boot document expiry check completed"))
      .catch((err) => logger.warn({ error: err.message }, "Boot expiry check failed"));

    // Schedule hourly check in-process (runs automatically every 60 mins without needing Redis)
    setInterval(() => {
      runDailyExpiryCheck()
        .then((res) => logger.info(res, "Scheduled hourly document expiry check completed"))
        .catch((err) => logger.warn({ error: err.message }, "Scheduled expiry check error"));
    }, 60 * 60 * 1000);
  } catch (err) {
    logger.warn("Expiry checker initialization skipped");
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
