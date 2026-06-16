/**
 * GET /api/audit/by-entity
 *
 * Feature A4 — Last-Edit-Strip
 *
 * Lädt die letzten N AuditLog-Einträge für eine konkrete Entity (entityType + entityId).
 * Wird vom <LastEditStrip /> auf Detail-Seiten (Rechnungen, Verträge, Buchungen …) genutzt,
 * um eine kompakte Versionshistorie als Footer-Strip + Popover anzuzeigen.
 *
 * Query-Params:
 *   - entityType (required)  z.B. "Invoice", "Contract", "JournalEntry"
 *   - entityId   (required)  UUID
 *   - limit      (optional)  default 10, max 50
 *
 * Berechtigung:  admin:audit (das ist die einzige Audit-Permission im Katalog).
 * Tenant-Scope:  non-Superadmins sehen nur Einträge ihres Mandanten.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { handleApiError } from "@/lib/api-utils";

// User-friendly Mapping für die häufigsten Aktionen.
// Frontend bekommt sowohl `action` (raw) als auch `actionLabel`.
const ACTION_LABELS: Record<string, string> = {
  CREATE: "Erstellt",
  UPDATE: "Aktualisiert",
  DELETE: "Gelöscht",
  VIEW: "Angesehen",
  EXPORT: "Exportiert",
  DOCUMENT_DOWNLOAD: "Heruntergeladen",
  LOGIN: "Angemeldet",
  LOGOUT: "Abgemeldet",
  IMPERSONATE: "Impersoniert",
};

function labelFor(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  // Fallback: Suffixe wie "_UPDATE", "_CREATE", "_DELETE" mappen.
  const upper = action.toUpperCase();
  if (upper.endsWith("_UPDATE") || upper === "UPDATE") return ACTION_LABELS.UPDATE;
  if (upper.endsWith("_CREATE") || upper === "CREATE") return ACTION_LABELS.CREATE;
  if (upper.endsWith("_DELETE") || upper === "DELETE") return ACTION_LABELS.DELETE;
  return action;
}

const querySchema = z.object({
  entityType: z.string().min(1).max(64),
  entityId: z.string().min(1).max(64),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * Schmale, frontend-freundliche Beschreibung der Änderung
 * — leitet aus oldValues/newValues ein Feldname:Wert-Diff ab.
 * Bewusst minimal: maximal 3 geänderte Felder, gekürzt.
 */
function buildDiffSummary(
  oldValues: unknown,
  newValues: unknown,
): string | undefined {
  if (
    !newValues ||
    typeof newValues !== "object" ||
    Array.isArray(newValues)
  ) {
    return undefined;
  }
  const next = newValues as Record<string, unknown>;
  const prev =
    oldValues && typeof oldValues === "object" && !Array.isArray(oldValues)
      ? (oldValues as Record<string, unknown>)
      : {};

  const changedKeys: string[] = [];
  for (const key of Object.keys(next)) {
    if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
      changedKeys.push(key);
    }
    if (changedKeys.length >= 3) break;
  }
  if (changedKeys.length === 0) return undefined;

  const parts = changedKeys.map((k) => {
    const raw = next[k];
    let val: string;
    if (raw === null || raw === undefined) val = "—";
    else if (typeof raw === "object") val = JSON.stringify(raw).slice(0, 24);
    else val = String(raw).slice(0, 24);
    return `${k}: ${val}`;
  });
  return parts.join(", ");
}

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("admin:audit");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      entityType: searchParams.get("entityType") ?? undefined,
      entityId: searchParams.get("entityId") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        details: parsed.error.flatten(),
      });
    }

    const { entityType, entityId, limit } = parsed.data;

    const entries = await prisma.auditLog.findMany({
      where: {
        entityType,
        entityId,
        ...(check.tenantId ? { tenantId: check.tenantId } : {}),
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });

    return Response.json({
      entries: entries.map((e) => ({
        id: e.id,
        action: e.action,
        actionLabel: labelFor(e.action),
        user: e.user
          ? {
              firstName: e.user.firstName,
              lastName: e.user.lastName,
              email: e.user.email,
            }
          : null,
        diff: buildDiffSummary(e.oldValues, e.newValues),
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleApiError(error, "Fehler beim Laden der Änderungshistorie");
  }
}
