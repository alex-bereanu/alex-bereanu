const required = [
  "NEXT_PUBLIC_SITE_URL",
  "ADMIN_PANEL_BASE_URL",
  "DATABASE_URL",
  "OAUTH_STATE_SECRET",
  "GALLERY_ACCESS_SECRET",
  "CSRF_SECRET",
  "AUDIT_LOG_SECRET",
  "RATE_LIMIT_SECRET",
  "HEALTH_CHECK_SECRET",
  "MEDIA_WORKER_SECRET",
  "CRON_SECRET",
  "MEDIA_SCANNER_URL",
  "MEDIA_SCANNER_SECRET",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "ADMIN_GOOGLE_ALLOWED_EMAILS",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_BUCKET_NAME",
  "R2_PRIVATE_BUCKET_NAME",
  "R2_PUBLIC_BASE_URL",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
  "TURNSTILE_EXPECTED_HOSTNAMES",
  "OBSERVABILITY_WEBHOOK_URL",
  "OBSERVABILITY_WEBHOOK_SECRET",
  "WEB_VITALS_SAMPLE_RATE",
  "AUDIT_RETENTION_DAYS",
  "EMAIL_LOG_RETENTION_DAYS",
];

const failures = [];
for (const name of required) {
  if (!process.env[name]?.trim()) failures.push(`${name} is required`);
}

if (process.env.ADMIN_AUTH_MODE !== "google") failures.push("ADMIN_AUTH_MODE must be google");
if (process.env.ADMIN_SETUP_TOKEN) failures.push("ADMIN_SETUP_TOKEN must be unset");
if (process.env.DATABASE_URL && !/[?&]sslmode=verify-full(?:&|$)/.test(process.env.DATABASE_URL)) {
  failures.push("DATABASE_URL must use sslmode=verify-full");
}

for (const name of ["NEXT_PUBLIC_SITE_URL", "ADMIN_PANEL_BASE_URL", "R2_PUBLIC_BASE_URL", "OBSERVABILITY_WEBHOOK_URL"]) {
  const value = process.env[name];
  if (value && !value.startsWith("https://")) failures.push(`${name} must use HTTPS`);
}

if (process.env.R2_PUBLIC_BUCKET_NAME && process.env.R2_PUBLIC_BUCKET_NAME === process.env.R2_PRIVATE_BUCKET_NAME) {
  failures.push("public and private R2 buckets must be distinct");
}
if (process.env.R2_PUBLIC_BASE_URL?.includes("r2.dev")) failures.push("R2_PUBLIC_BASE_URL must use the approved public custom domain");

const secretNames = ["OAUTH_STATE_SECRET", "GALLERY_ACCESS_SECRET", "CSRF_SECRET", "AUDIT_LOG_SECRET", "RATE_LIMIT_SECRET", "HEALTH_CHECK_SECRET", "MEDIA_WORKER_SECRET", "CRON_SECRET", "MEDIA_SCANNER_SECRET", "OBSERVABILITY_WEBHOOK_SECRET"];
const configuredSecrets = secretNames.map((name) => process.env[name]).filter(Boolean);
if (new Set(configuredSecrets).size !== configuredSecrets.length) failures.push("security secrets must not be reused");

const expectedHostnames = new Set((process.env.TURNSTILE_EXPECTED_HOSTNAMES ?? "").split(",").map((value) => value.trim()).filter(Boolean));
for (const name of ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_WEDDINGS_URL"]) {
  const value = process.env[name];
  if (value && !expectedHostnames.has(new URL(value).hostname)) failures.push(`Turnstile hostnames must include ${name}`);
}
if ([...expectedHostnames].some((hostname) => hostname === "localhost" || hostname === "127.0.0.1")) {
  failures.push("production Turnstile hostnames must not include local hosts");
}

const sampleRate = Number(process.env.WEB_VITALS_SAMPLE_RATE);
if (!Number.isFinite(sampleRate) || sampleRate <= 0 || sampleRate > 1) {
  failures.push("WEB_VITALS_SAMPLE_RATE must be greater than 0 and no more than 1");
}

if (failures.length > 0) throw new Error(`Production configuration failed:\n- ${failures.join("\n- ")}`);
console.log("Production configuration verification passed without printing secret values.");
