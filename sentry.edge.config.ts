import * as Sentry from "@sentry/nextjs";
import { version as appVersion } from "./package.json";

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
});
