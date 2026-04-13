import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable in production
  enabled: process.env.NODE_ENV === "production",

  // Ties errors to a specific build (injected at build time via NEXT_PUBLIC_APP_VERSION)
  release: process.env.NEXT_PUBLIC_APP_VERSION
    ? `windparkmanager@${process.env.NEXT_PUBLIC_APP_VERSION}`
    : undefined,

  // Performance monitoring
  tracesSampleRate: 0.1, // 10% of transactions

  // Session replay (optional, disable for now)
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // Environment
  environment: process.env.NODE_ENV,

  // Filter out noisy errors
  ignoreErrors: [
    "ResizeObserver loop",
    "Network request failed",
    "Load failed",
    "ChunkLoadError",
    "AbortError",
    "NotAllowedError",
    // Ignore expected auth redirects
    "NEXT_REDIRECT",
    // Browser extensions noise
    /Extension context invalidated/,
    /chrome-extension:/,
  ],

  // Scrub PII from client-side error payloads
  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
      delete event.user.username;
    }
    return event;
  },
});
