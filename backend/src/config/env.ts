import dotenv from "dotenv";
import { z } from "zod";

const nodeEnv = process.env.NODE_ENV ?? "development";
const preferredEnvFile = `.env.${nodeEnv}`;

dotenv.config({ path: preferredEnvFile });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_PUBLISHABLE_DEFAULT_KEY: z.string().min(20),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("compliance-docs"),
  REDIS_URL: z.string().min(1),
  CORS_ORIGIN: z.string().url().optional(),
  WEBHOOK_SHARED_SECRET: z.string().min(16).optional(),
  WHATSAPP_PHONE_ID: z.string().optional(),
  WHATSAPP_API_TOKEN: z.string().optional(),
  // SMTP (Email notifications)
  EMAIL_SMTP_HOST: z.string().optional(),
  EMAIL_SMTP_PORT: z.coerce.number().int().positive().default(587),
  EMAIL_SMTP_USER: z.string().optional(),
  EMAIL_SMTP_PASS: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().email().optional(),
  GEMINI_API_KEY: z.string().optional(),
  BREVO_API_KEY: z.string().optional()
}).refine(
  (data) => data.NODE_ENV !== "production" || !!data.WEBHOOK_SHARED_SECRET,
  {
    message: "WEBHOOK_SHARED_SECRET is required in production. Refusing to start without it.",
    path: ["WEBHOOK_SHARED_SECRET"]
  }
);

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment configuration: ${formatted}`);
}

export const env = parsed.data;

export type UserRole = "Clerk" | "HOD" | "Principal" | "Admin";
