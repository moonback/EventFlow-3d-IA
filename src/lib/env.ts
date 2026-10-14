import "server-only";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(12),
  CRON_SECRET: z.string().optional(),
  MAIL_DRIVER: z.enum(["file", "smtp", "disabled"]).default("file"),
  MAIL_FROM: z.string().default("EventFlow 3D <no-reply@example.com>"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage/uploads"),
  UPLOAD_MAX_MB: z.coerce.number().min(1).max(200).default(15),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("eu-west-3"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true"),
  // Assistant vocal « Eric » (Gemini Live sur Gemini Enterprise Agent Platform, identifiants Google Cloud via ADC)
  ASSISTANT_ENABLED: z.enum(["true", "false"]).default("false"),
  // "enterprise" : Gemini Enterprise Agent Platform (ADC, région GOOGLE_CLOUD_LOCATION) ;
  // "developer" : Gemini API avec GEMINI_API_KEY (essais en local, sans garantie de résidence des données)
  GEMINI_BACKEND: z.enum(["enterprise", "developer"]).default("enterprise"),
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  GOOGLE_CLOUD_LOCATION: z.string().default("eu"),
  GEMINI_LIVE_MODEL: z.string().default("gemini-3.8-live"),
  GEMINI_LIVE_VOICE: z.string().optional(),
  ASSISTANT_GATEWAY_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  ASSISTANT_MAX_SESSION_MINUTES: z.coerce.number().int().min(1).max(240).default(30),
  ASSISTANT_IDLE_SECONDS: z.coerce.number().int().min(15).max(3600).default(120),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | null = null;

/** Variables d'environnement serveur, validées au premier accès. Jamais exposées au navigateur. */
export function env(): ServerEnv {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Invalid server environment variables: ${fields}`);
    }
    cached = parsed.data;
  }
  return cached;
}
