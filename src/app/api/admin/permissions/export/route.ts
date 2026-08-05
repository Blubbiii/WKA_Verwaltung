/**
 * Permission Matrix Export Route
 *
 * Exports the permission matrix (roles x permissions) as PDF or Excel.
 *
 * GET /api/admin/permissions/export?format=pdf|xlsx
 * Query Parameters:
 * - format: Export format (pdf or xlsx)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireSuperadmin } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { generatePermissionMatrixPdf } from "@/lib/pdf/generators/permissionMatrixPdf";
import { generateExcelMultiSheet } from "@/lib/export/excel";
import type { PermissionMatrixPdfData } from "@/lib/pdf/templates/PermissionMatrixTemplate";
import type { ColumnDef } from "@/lib/export/types";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";
import { ROLE_HIERARCHY } from "@/lib/auth/hierarchy";
import { effektiveRechte } from "@/lib/auth/effektive-rechte";
import { modulBeschriftung, sortiereModule } from "@/lib/auth/module-labels";

/*
  Die Modul-Beschriftungen standen frueher hier — 17 Stueck, waehrend es 32
  Module gibt. Fuenfzehn Ueberschriften erschienen deshalb als technischer
  Schluessel („accounting", „faults", „wirtschaftsplan") in einem sonst
  deutschen Dokument, und weil dieselben fuenfzehn auch in der Reihenfolge
  fehlten, rutschten sie unsortiert ans Ende — darunter der Buchhaltungsblock,
  mit zwanzig Zeilen der groesste im ganzen Export.

  Eine zweite, ebenfalls unvollstaendige Kopie lag in
  `api/admin/permissions/route.ts`. Beide sind jetzt durch
  `lib/auth/module-labels.ts` ersetzt, das ein Waechter gegen den
  Rechte-Katalog haelt.
*/

/**
 * Fussnoten zur Matrix.
 *
 * Sie stehen im Dokument, nicht nur hier: eine Berechtigungs-Matrix wird aus
 * dem Haus gegeben und ohne ihren Erzeuger gelesen. Was sie NICHT zeigt, muss
 * sie selbst sagen.
 */
const HINWEISE = [
  "Ein Haken bedeutet: die Rolle darf diese Handlung ausführen.",
  "Superadmin-Rollen (Rangstufe 100) umgehen die Rechteprüfung vollständig. " +
    "Ihre Haken folgen aus der Rangstufe, nicht aus einzelnen Zuweisungen — " +
    "sie lassen sich nicht entziehen.",
  "Diese Matrix bildet Rechte ab, die je Handlung geprüft werden. Einige " +
    "Verwaltungsfunktionen sind stattdessen an die Rangstufe gebunden " +
    "(Administrator ab 80, Superadmin ab 100) und erscheinen hier nicht als " +
    "eigene Zeile.",
  "Eine leere Zelle bedeutet: nicht zugewiesen. Sie ist keine ausdrückliche " +
    "Sperre.",
];

/**
 * GET /api/admin/permissions/export
 * Export permission matrix as PDF or Excel
 */
export async function GET(request: NextRequest) {
  // Check admin permission
  const check = await requireAdmin();
  if (!check.authorized) return check.error;

  const { tenantId } = check;

  if (!tenantId) {
    return apiError("BAD_REQUEST", undefined, { message: "Kein Mandant zugeordnet" });
  }

  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format")?.toLowerCase();

    if (!format || !["pdf", "xlsx"].includes(format)) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültiges Format. Erlaubt: pdf, xlsx" });
    }

    // Get tenant info
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });

    if (!tenant) {
      return apiError("NOT_FOUND", undefined, { message: "Mandant nicht gefunden" });
    }

    /*
      Superadmin-Rollen nur fuer Superadmins.

      Die Rollenseite blendet sie fuer einen normalen Admin bewusst aus
      (`hierarchy: { lt: 100 }` in `api/admin/roles`). Dieser Export tat es
      nicht: was die Oberflaeche verbarg, gab der Knopf daneben vollstaendig
      heraus — die Rechte der maechtigsten Rolle im Haus, als Tabelle.

      Beide Stellen tun jetzt dasselbe. Im Zweifel weniger zeigen: wer die
      Rolle nicht verwalten darf, braucht auch ihre Aufstellung nicht.
    */
    const darfSuperadminSehen = (await requireSuperadmin()).authorized;

    // Fetch all roles (system roles + tenant-specific)
    const roles = await prisma.role.findMany({
      where: {
        OR: [{ isSystem: true }, { tenantId }],
        ...(darfSuperadminSehen
          ? {}
          : { hierarchy: { lt: ROLE_HIERARCHY.SUPERADMIN } }),
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });

    // Fetch all permissions grouped by module
    const permissions = await prisma.permission.findMany({
      orderBy: [{ sortOrder: "asc" }, { module: "asc" }, { action: "asc" }],
    });

    // Group permissions by module
    const grouped: Record<
      string,
      {
        module: string;
        label: string;
        permissions: Array<{
          id: string;
          name: string;
          displayName: string;
          module: string;
          action: string;
        }>;
      }
    > = {};

    for (const perm of permissions) {
      if (!grouped[perm.module]) {
        grouped[perm.module] = {
          module: perm.module,
          label: modulBeschriftung(perm.module),
          permissions: [],
        };
      }

      grouped[perm.module].permissions.push({
        id: perm.id,
        name: perm.name,
        displayName: perm.displayName,
        module: perm.module,
        action: perm.action,
      });
    }

    // Sortierung und Beschriftung aus der gemeinsamen Quelle
    const groupedPermissions = sortiereModule(Object.keys(grouped)).map(
      (m) => grouped[m],
    );

    /*
      Der Superadmin-Bypass MUSS in der Matrix stehen.

      `requirePermission` gibt bei Rangstufe >= 100 frei, ohne irgendetwas zu
      pruefen (withPermission.ts). Die Superadmin-Rolle braucht die Rechte
      deshalb gar nicht zugewiesen zu bekommen — und in der Datenbank hat sie
      sie auch nicht.

      Der Export las bisher nur die Zuweisungen. Im Dokument vom 05.08.2026
      standen dadurch 61 der 188 Zeilen beim Superadmin leer, und weil genau
      diese 61 sonst auch keine Rolle hat, las sich die ganze Zeile als „das
      darf niemand". Betroffen waren unter anderem: Buchungen festschreiben,
      Buchungen stornieren, Periode sperren, Bilanz anzeigen, Jahresabschluss
      ausfuehren, GoBD Z3-Export, DATEV-Export, Audit-Logs anzeigen.

      Also genau die Zeilen, die ein Pruefer zuerst aufschlaegt — und dort
      behauptete das Dokument das Gegenteil der Wahrheit.

      Die Fussnote erklaert, woher diese Haken kommen: aus der Rangstufe, nicht
      aus Zuweisungen. Sonst sieht es aus, als koenne man sie entziehen.
    */
    const alleRechte = permissions.map((p) => p.name);
    const rolesData = roles.map((role) => {
      const befund = effektiveRechte(
        {
          hierarchy: role.hierarchy,
          zugewieseneRechte: role.permissions.map((rp) => rp.permission.name),
        },
        alleRechte,
      );
      return {
        id: role.id,
        name: role.name,
        isSystem: role.isSystem,
        color: role.color,
        hierarchy: role.hierarchy,
        umgehtPruefung: befund.umgehtPruefung,
        zugewiesen: befund.zugewiesen,
        permissionNames: befund.effektiv,
      };
    });

    // Build permission lookup per role
    const rolePermissionMap = new Map<string, Set<string>>();
    for (const role of rolesData) {
      rolePermissionMap.set(role.id, new Set(role.permissionNames));
    }

    const timestamp = new Date().toISOString().split("T")[0];

    if (format === "pdf") {
      // Generate PDF
      const pdfData: PermissionMatrixPdfData = {
        generatedAt: new Date().toISOString(),
        tenantId: tenant.id,
        tenantName: tenant.name,
        totalRoles: rolesData.length,
        totalPermissions: permissions.length,
        roles: rolesData,
        groupedPermissions,
      };

      const pdfBuffer = await generatePermissionMatrixPdf(pdfData);

      // Log export action
      await logExport(check.userId!, tenantId, "pdf", rolesData.length, permissions.length);

      // Return PDF
      const pdfResponseBody = new Uint8Array(pdfBuffer);
      return new NextResponse(pdfResponseBody, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="Berechtigungs-Matrix_${timestamp}.pdf"`,
          "Content-Length": String(pdfResponseBody.length),
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    } else {
      // Generate Excel
      // Build column definitions: Permission name + one column per role
      const columns: ColumnDef[] = [
        {
          key: "module",
          header: "Modul",
          width: 15,
          format: "text",
        },
        {
          key: "permission",
          header: "Berechtigung",
          width: 25,
          format: "text",
        },
        /*
          Die Rangstufe gehoert in die Ueberschrift.

          Ohne sie stehen beim Superadmin 188 Haken, ohne dass die Spalte
          erklaert, warum ausgerechnet dort keiner fehlt. Mit ihr sieht man den
          Grund — und die Fussnote auf dem zweiten Blatt fuehrt ihn aus.
        */
        ...rolesData.map((role) => ({
          key: `role_${role.id}`,
          header: `${role.name} (${role.isSystem ? "System, " : ""}Rang ${role.hierarchy})`,
          width: 14,
          format: "text" as const,
        })),
      ];

      // Build data rows
      const data: Record<string, unknown>[] = [];

      for (const group of groupedPermissions) {
        // Add module header row
        const moduleRow: Record<string, unknown> = {
          module: group.label,
          permission: "",
          isModuleHeader: true,
        };
        for (const role of rolesData) {
          moduleRow[`role_${role.id}`] = "";
        }
        data.push(moduleRow);

        // Add permission rows
        for (const perm of group.permissions) {
          const row: Record<string, unknown> = {
            module: "",
            permission: perm.displayName,
            isModuleHeader: false,
          };

          for (const role of rolesData) {
            const hasPermission = rolePermissionMap.get(role.id)?.has(perm.name);
            row[`role_${role.id}`] = hasPermission ? "✓" : "";
          }

          data.push(row);
        }
      }

      /*
        Zweites Blatt: woher das Dokument kommt und was es nicht zeigt.

        Die Excel-Fassung trug bisher keinerlei Angaben — kein Datum, keinen
        Mandanten, keinen Ersteller. Nur der Dateiname enthielt ein Datum, und
        Dateinamen werden umbenannt, weitergeleitet und abgelegt. Ein
        undatiertes Blatt mit Haken taugt als Nachweis nichts: es sagt nicht,
        WANN das der Stand war.

        Die PDF-Fassung hatte all das von Anfang an. Dass ausgerechnet die
        Excel-Fassung es nicht hatte, faellt niemandem auf, der beide nicht
        nebeneinander legt.

        Eigenes Blatt statt Kopfzeilen ueber der Tabelle: Zeilen vor der
        Ueberschrift zerschiessen Sortieren, Filtern und jede Auswertung, die
        jemand auf die Matrix setzt.
      */
      const ersteller = await prisma.user.findUnique({
        where: { id: check.userId! },
        select: { firstName: true, lastName: true, email: true },
      });
      const erstellerName = ersteller
        ? [ersteller.firstName, ersteller.lastName].filter(Boolean).join(" ") ||
          ersteller.email
        : "unbekannt";

      const angabenSpalten: ColumnDef[] = [
        { key: "feld", header: "Angabe", width: 26, format: "text" },
        { key: "wert", header: "Wert", width: 90, format: "text" },
      ];

      const angaben: Record<string, unknown>[] = [
        { feld: "Dokument", wert: "Berechtigungs-Matrix" },
        { feld: "Mandant", wert: tenant.name },
        {
          feld: "Erstellt am",
          wert: new Date().toLocaleString("de-DE", {
            dateStyle: "full",
            timeStyle: "short",
            timeZone: "Europe/Berlin",
          }),
        },
        { feld: "Erstellt von", wert: `${erstellerName} (${ersteller?.email ?? "—"})` },
        { feld: "Rollen", wert: String(rolesData.length) },
        { feld: "Berechtigungen", wert: String(permissions.length) },
        { feld: "Module", wert: String(groupedPermissions.length) },
        ...(darfSuperadminSehen
          ? []
          : [
              {
                feld: "Hinweis zum Umfang",
                wert:
                  "Rollen der Rangstufe 100 (Superadmin) sind nicht enthalten. " +
                  "Sie sind nur für Superadmins einsehbar.",
              },
            ]),
        { feld: "", wert: "" },
        ...HINWEISE.map((h, i) => ({ feld: i === 0 ? "Zur Lesart" : "", wert: h })),
        { feld: "", wert: "" },
        // Je Rolle: woher ihre Haken kommen.
        ...rolesData.map((r) => ({
          feld: `Rolle: ${r.name}`,
          wert: r.umgehtPruefung
            ? `Rangstufe ${r.hierarchy} — umgeht die Rechteprüfung, darf alle ` +
              `${permissions.length} Handlungen. Ausdrücklich zugewiesen sind ` +
              `${r.zugewiesen}; die übrigen Haken folgen aus der Rangstufe und ` +
              `lassen sich nicht entziehen.`
            : `Rangstufe ${r.hierarchy} — ${r.zugewiesen} von ` +
              `${permissions.length} Berechtigungen zugewiesen.`,
        })),
      ];

      const excelBuffer = await generateExcelMultiSheet([
        { name: "Matrix", data, columns },
        { name: "Angaben zum Export", data: angaben, columns: angabenSpalten },
      ]);

      // Log export action
      await logExport(check.userId!, tenantId, "xlsx", rolesData.length, permissions.length);

      // Return Excel
      const excelResponseBody = new Uint8Array(excelBuffer);
      return new NextResponse(excelResponseBody, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="Berechtigungs-Matrix_${timestamp}.xlsx"`,
          "Content-Length": String(excelResponseBody.length),
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }
  } catch (error) {
    logger.error({ err: error }, "Permission matrix export error");

    if (error instanceof Error) {
      return apiError("INTERNAL_ERROR", undefined, { message: `Fehler beim Export: ${error.message}` });
    }

    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Export der Berechtigungs-Matrix" });
  }
}

/**
 * Log the export action to audit log
 */
async function logExport(
  userId: string,
  tenantId: string,
  format: string,
  roleCount: number,
  permissionCount: number
) {
  try {
    await prisma.auditLog.create({
      data: {
        action: "EXPORT",
        entityType: "PERMISSION_MATRIX",
        userId,
        tenantId,
        newValues: {
          format,
          roleCount,
          permissionCount,
        },
      },
    });
  } catch (auditError) {
    logger.error({ err: auditError }, "Audit log error");
  }
}
