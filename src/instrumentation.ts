export async function register() {
  // Skip Sentry instrumentation in development to avoid Turbopack HMR conflicts
  if (process.env.NODE_ENV === "development") {
    return;
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    const { checkAuditLogTrigger } = await import("./lib/audit-trigger-check");
    await checkAuditLogTrigger();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
