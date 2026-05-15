import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_SITE_NAME: z.string().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_WEDDINGS_URL: z.string().url().optional(),
  WEDDINGS_DOMAIN: z.string().optional(),
  ADMIN_PANEL_BASE_URL: z.string().url().optional(),
  DATABASE_URL: z.string().optional(),
  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD_HASH: z.string().optional(),
  ADMIN_PASSWORD_PLAIN: z.string().optional(),
  ADMIN_SESSION_SECRET: z.string().optional(),
  CSRF_SECRET: z.string().optional(),
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
  R2_BUCKET_NAME: z.string().optional(),
  R2_REGION: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export const env: AppEnv = envSchema.parse(process.env);

export function requireEnv<K extends keyof AppEnv>(key: K): string {
  const value = env[key];

  if (!value || value.length === 0) {
    throw new Error(`Missing required environment variable: ${String(key)}`);
  }

  return value;
}
