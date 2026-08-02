import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { attachRequestId } from "./core/middleware/request-id";
import { errorHandler } from "./core/middleware/error-handler";
import { notFoundHandler } from "./core/middleware/not-found";
import { httpLogger } from "./core/utils/logger";
import { authRoutes } from "./modules/auth/auth.routes";
import { documentsRoutes } from "./modules/documents/documents.routes";
import { institutesRoutes } from "./modules/institutes/institutes.routes";
import { approvalsRoutes } from "./modules/approvals/approvals.routes";
import { webhooksRoutes } from "./modules/webhooks/webhooks.routes";
import { copilotRoutes } from "./modules/copilot/copilot.routes";
import { ocrRoutes } from "./modules/ocr/ocr.routes";

export const app = express();

app.disable("x-powered-by");
app.use(httpLogger);
app.use(attachRequestId);
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN ?? true,
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));

// ── Global Rate Limiter ─────────────────────────────
// 100 requests per 15 minutes per IP across all /api/ routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again later."
  }
});

app.use("/api/", apiLimiter);

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: "ok",
      timestamp: new Date().toISOString()
    }
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/institutes", institutesRoutes);
app.use("/api/approvals", approvalsRoutes);
app.use("/api/webhooks", webhooksRoutes);
app.use("/api/copilot", copilotRoutes);
app.use("/api/ocr", ocrRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
