import { z } from "zod";

const optionalSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(32).optional(),
);

const optionalAdminAuthMode = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.enum(["google", "password", "both"]).optional(),
);

const optionalPositiveInteger = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

const optionalUnitInterval = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.coerce.number().min(0).max(1).optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_SITE_NAME: z.string().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_WEDDINGS_URL: z.string().url().optional(),
  WEDDINGS_DOMAIN: z.string().optional(),
  ADMIN_PANEL_BASE_URL: z.string().url().optional(),
  DATABASE_URL: z.string().optional(),
  ADMIN_AUTH_MODE: optionalAdminAuthMode,
  ADMIN_SETUP_TOKEN: optionalSecret,
  OAUTH_STATE_SECRET: optionalSecret,
  GALLERY_ACCESS_SECRET: optionalSecret,
  CSRF_SECRET: optionalSecret,
  AUDIT_LOG_SECRET: optionalSecret,
  RATE_LIMIT_SECRET: optionalSecret,
  HEALTH_CHECK_SECRET: optionalSecret,
  MEDIA_WORKER_SECRET: optionalSecret,
  CRON_SECRET: optionalSecret,
  MEDIA_SCANNER_URL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().url().optional(),
  ),
  MEDIA_SCANNER_SECRET: optionalSecret,
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().optional(),
  ADMIN_GOOGLE_ALLOWED_EMAILS: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  ADMIN_NOTIFICATION_EMAIL: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_PUBLIC_BUCKET_NAME: z.string().optional(),
  R2_PRIVATE_BUCKET_NAME: z.string().optional(),
  // Deprecated compatibility value for public/site-content storage only.
  R2_BUCKET_NAME: z.string().optional(),
  R2_REGION: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  TURNSTILE_EXPECTED_HOSTNAMES: z.string().optional(),
  OBSERVABILITY_WEBHOOK_URL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().url().optional(),
  ),
  OBSERVABILITY_WEBHOOK_SECRET: optionalSecret,
  WEB_VITALS_SAMPLE_RATE: optionalUnitInterval,
  AUDIT_RETENTION_DAYS: optionalPositiveInteger,
  EMAIL_LOG_RETENTION_DAYS: optionalPositiveInteger,
  TICKET_RETENTION_DAYS: optionalPositiveInteger,
  VERCEL: z.literal("1").optional(),
});

export type AppEnv = z.infer<typeof envSchema>;
type StringEnvKey = {
  [K in keyof AppEnv]-?: Exclude<AppEnv[K], undefined> extends string ? K : never;
}[keyof AppEnv];

export const env: AppEnv = envSchema.parse(process.env);

export function requireEnv(key: StringEnvKey): string {
  const value = env[key];

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required environment variable: ${String(key)}`);
  }

  return value;
}
