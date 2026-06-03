import * as Sentry from "@sentry/nextjs";
import { version as appVersion } from "./package.json";
import { maskEmail, maskIp } from "./src/lib/observability/pii";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  enabled: process.env.NODE_ENV === "production",

  release: `windparkmanager@${appVersion}`,

  tracesSampleRate: 0.1,

  environment: process.env.NODE_ENV,

  ignoreErrors: [
    "AbortError",
    "TimeoutError",
    "VALIDATION_FAILED",
    "NOT_FOUND",
    "FORBIDDEN",
    "UNAUTHORIZED",
    "CredentialsSignin",
  ],

  beforeSend(event) {
    if (event.user) {
      if (event.user.email) event.user.email = maskEmail(event.user.email);
      if (event.user.ip_address) event.user.ip_address = maskIp(event.user.ip_address);
      delete event.user.username;
    }
    return event;
  },
});
