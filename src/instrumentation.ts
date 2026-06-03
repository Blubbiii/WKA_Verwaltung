export async function register() {
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
