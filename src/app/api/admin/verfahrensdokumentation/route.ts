/**
 * GoBD §145 Verfahrensdokumentation - Auto-Generator
 *
 * Lädt das Markdown-Template aus docs/ und substituiert Platzhalter
 * mit aktuellen Tenant-Daten + System-Status.
 *
 * GET /api/admin/verfahrensdokumentation
 * Permission: admin:audit
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getTenantSettings } from "@/lib/tenant-settings";
import { handleApiError } from "@/lib/api-utils";
import { apiError } from "@/lib/api-errors";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "docs",
  "verfahrensdokumentation-template.md",
);

export async function GET(_request: NextRequest) {
  try {
    const check = await requirePermission("admin:audit");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return apiError("BAD_REQUEST", 400, {
        message: "Verfahrensdokumentation benötigt einen aktiven Mandanten.",
      });
    }

    const tenantId = check.tenantId;

    // Template laden
    let template: string;
    try {
      template = await readFile(TEMPLATE_PATH, "utf-8");
    } catch {
      return apiError("INTERNAL_ERROR", 500, {
        message:
          "Verfahrensdokumentation-Template fehlt unter docs/verfahrensdokumentation-template.md",
      });
    }

    // Daten parallel laden
    const [tenant, userCount, tenantCount, settings] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          name: true,
          contactEmail: true,
          address: true,
        },
      }),
      prisma.user.count({ where: { tenantId, status: "ACTIVE" } }),
      prisma.tenant.count(),
      getTenantSettings(tenantId),
    ]);

    if (!tenant) {
      return apiError("NOT_FOUND", 404, { message: "Mandant nicht gefunden." });
    }

    // Audit-Trigger-Status (best effort — leere String wenn nicht prüfbar)
    let auditTriggerStatus = "Unbekannt (Boot-Check siehe Logs)";
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count
         FROM pg_trigger
         WHERE tgname IN ('audit_logs_no_update', 'audit_logs_no_delete')`,
      );
      const count = Number(rows[0]?.count ?? 0);
      auditTriggerStatus =
        count >= 2
          ? "AKTIV (audit_logs_no_update + audit_logs_no_delete vorhanden)"
          : `FEHLT (${count}/2 Trigger gefunden) — siehe docs/audit-log-append-only.md`;
    } catch {
      // ignore — bleibt "Unbekannt"
    }

    const now = new Date();
    const fiscalYear =
      settings.fiscalYearStartMonth === 1
        ? String(now.getFullYear())
        : `${now.getFullYear()}/${now.getFullYear() + 1}`;

    const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

    const placeholders: Record<string, string> = {
      "{{TENANT_NAME}}": tenant.name ?? "—",
      "{{TENANT_ADDRESS}}": tenant.address ?? "—",
      "{{TENANT_CONTACT_EMAIL}}": tenant.contactEmail ?? "—",
      "{{USER_COUNT}}": String(userCount),
      "{{TENANT_COUNT}}": String(tenantCount),
      "{{FISCAL_YEAR}}": fiscalYear,
      "{{GENERATED_AT}}": now.toISOString(),
      "{{APP_VERSION}}": appVersion,
      "{{RETENTION_INVOICE}}": String(settings.gobdRetentionYearsInvoice),
      "{{RETENTION_CONTRACT}}": String(settings.gobdRetentionYearsContract),
      "{{AUDIT_TRIGGER_STATUS}}": auditTriggerStatus,
    };

    let rendered = template;
    for (const [key, value] of Object.entries(placeholders)) {
      rendered = rendered.split(key).join(value);
    }

    return new NextResponse(rendered, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `inline; filename="verfahrensdokumentation-${tenant.name?.replace(/[^a-z0-9]/gi, "_") ?? "tenant"}-${now.toISOString().slice(0, 10)}.md"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(
      error,
      "Fehler beim Generieren der Verfahrensdokumentation",
    );
  }
}
