export async function register() {
  // Fail-fast env validation: throws immediately if DATABASE_URL /
  // AUTH_SECRET are missing rather than surfacing later as an obscure
  // "connection refused" or "jwt has no secret" error.
  // Only runs on Node runtime (edge runtime has a narrower env surface).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/env");
  }

  // Skip Sentry instrumentation in development to avoid Turbopack HMR conflicts
  if (process.env.NODE_ENV === "development") {
    return;
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    const { checkAuditLogTrigger } = await import("./lib/audit-trigger-check");
    await checkAuditLogTrigger();

    // Permission-Catalog → DB Sync (Q1-Architektur-Investment, SSOT)
    const { syncPermissionsCatalog } = await import("./lib/auth/sync-permissions");
    await syncPermissionsCatalog();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
