import * as Sentry from "@sentry/nextjs";
import { version as appVersion } from "./package.json";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  enabled: process.env.NODE_ENV === "production",

  // Ties errors to a specific build so you can see "what version broke" in issues
  release: `windparkmanager@${appVersion}`,

  tracesSampleRate: 0.1,

  environment: process.env.NODE_ENV,

  // Filter noisy / expected errors before they consume quota
  ignoreErrors: [
    // Expected client behavior
    "AbortError",
    "TimeoutError",
    // Expected validation failures (Zod + apiError)
    "VALIDATION_FAILED",
    "NOT_FOUND",
    "FORBIDDEN",
    "UNAUTHORIZED",
    // NextAuth expected cases
    "CredentialsSignin",
  ],

  // Scrub PII from error payloads (DSGVO Art. 5 Datenminimierung).
  // Removes password, token, secret, email etc. from request bodies,
  // query params and user fields before Sentry sends them.
  beforeSend(event) {
    if (event.request?.data && typeof event.request.data === "object") {
      event.request.data = scrubPii(event.request.data as Record<string, unknown>);
    }
    if (event.request?.query_string && typeof event.request.query_string === "string") {
      event.request.query_string = scrubQueryString(event.request.query_string);
    }
    // Keep user.id (for correlation) but strip email/ip_address
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
      delete event.user.username;
    }
    return event;
  },
});

const PII_KEYS = new Set([
  "password",
  "passwordConfirm",
  "newPassword",
  "oldPassword",
  "currentPassword",
  "token",
  "resetToken",
  "accessToken",
  "refreshToken",
  "secret",
  "apiKey",
  "authorization",
  "cookie",
  "email",
  "phone",
  "firstName",
  "lastName",
  "iban",
  "bic",
  "taxId",
  "vatId",
]);

function scrubPii(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (PII_KEYS.has(k)) {
      out[k] = "[Filtered]";
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = scrubPii(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function scrubQueryString(qs: string): string {
  return qs.replace(
    /(?:^|&)(password|token|secret|apiKey)=[^&]*/gi,
    (_, key) => `&${key}=[Filtered]`,
  );
}
