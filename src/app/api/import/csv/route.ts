/**
 * POST /api/import/csv
 *
 * Stammdaten aus einer CSV-Datei übernehmen.
 *
 * Bedienaufwand #22 (Audit 2026-07): Export gibt es in 18 Listen, Import für
 * Stammdaten in keiner. Beim Onboarding eines neuen Mandanten heisst das:
 * Kontakte und Lieferanten von Hand abtippen.
 *
 * ## Zwei Betriebsarten
 *
 * `dryRun: true` prüft nur und schreibt nichts. Die Vorschau in der Oberfläche
 * benutzt das — sonst zeigte sie eine Client-Vermutung, und der Import scheiterte
 * anschliessend an Regeln, die der Client nicht kennt (Feldlängen, Mandanten-
 * bindung, vorhandene Dubletten).
 *
 * ## Warum kein Alles-oder-nichts
 *
 * Bei 500 Zeilen aus einer fremden Excel-Datei ist eine kaputte Zeile die Regel,
 * nicht die Ausnahme. Ein Rollback über alles hiesse: eine Zeile mit fehlendem
 * Namen verhindert 499 gute. Stattdessen werden gültige Zeilen übernommen und
 * die übrigen ZEILENGENAU gemeldet — mit Zeilennummer, damit sie sich in der
 * Ursprungsdatei wiederfinden lassen.
 *
 * Das ist kein stiller Teilerfolg: die Antwort nennt beide Zahlen, und die
 * Oberfläche meldet einen Teilimport als Teilimport.
 *
 * ## Dubletten
 *
 * Bekannte Datensätze werden übersprungen und gezählt, nicht als Fehler
 * gewertet. So lässt sich eine korrigierte Datei erneut einspielen, ohne dass
 * die bereits übernommenen Zeilen ein zweites Mal landen — dieselbe Überlegung
 * wie beim Pacht-Assistenten (#21).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { IMPORT_SPECS, type CsvImportSpec } from "@/lib/import/csv-import-spec";

/** Obergrenze je Lauf. Darüber gehört der Import in einen Hintergrundauftrag. */
const MAX_ROWS = 2000;

const requestSchema = z.object({
  target: z.enum(["persons", "vendors"]),
  dryRun: z.boolean().default(false),
  /** Bereits zugeordnete Zeilen: Zielfeld → Wert. */
  rows: z.array(z.record(z.string(), z.string())).max(MAX_ROWS),
});

interface RowProblem {
  /** 1-basiert und OHNE Kopfzeile gezählt — so, wie der Benutzer zählt. */
  row: number;
  field?: string;
  message: string;
}

/** Rechte je Zielobjekt. Ein Import ist ein Anlegen, kein Sonderfall. */
const PERMISSION_BY_TARGET: Record<string, string> = {
  persons: PERMISSIONS.LEASES_CREATE,
  vendors: PERMISSIONS.VENDORS_CREATE,
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Ungültige Import-Anfrage",
        details: parsed.error.issues,
      });
    }

    const { target, dryRun, rows } = parsed.data;

    const check = await requirePermission(PERMISSION_BY_TARGET[target]);
    if (!check.authorized) return check.error;

    const spec = IMPORT_SPECS[target];

    // 1. Zeilenweise prüfen — unabhängig davon, ob geschrieben wird.
    const problems: RowProblem[] = [];
    const candidates: { index: number; data: Record<string, string> }[] = [];

    rows.forEach((row, index) => {
      const rowProblems = validateRow(row, spec, index + 1);
      if (rowProblems.length > 0) {
        problems.push(...rowProblems);
        return;
      }
      candidates.push({ index: index + 1, data: cleanRow(row, spec) });
    });

    // 2. Dubletten gegen den Bestand prüfen.
    const duplicates: RowProblem[] = [];
    const importable: typeof candidates = [];

    for (const candidate of candidates) {
      const existing = await findExisting(target, candidate.data, check.tenantId!);
      if (existing) {
        duplicates.push({
          row: candidate.index,
          message: "Bereits vorhanden — übersprungen",
        });
        continue;
      }
      importable.push(candidate);
    }

    // 3. Dubletten INNERHALB der Datei. Ohne diese Prüfung legt eine Datei mit
    //    zweimal derselben Firma zwei Datensätze an — die Bestandsprüfung oben
    //    sieht die zweite Zeile nicht, weil die erste noch nicht geschrieben ist.
    const seen = new Set<string>();
    const finalRows: typeof candidates = [];
    for (const candidate of importable) {
      const key = dedupeKey(candidate.data, spec);
      if (key && seen.has(key)) {
        duplicates.push({
          row: candidate.index,
          message: "Dublette innerhalb der Datei — übersprungen",
        });
        continue;
      }
      if (key) seen.add(key);
      finalRows.push(candidate);
    }

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        total: rows.length,
        importable: finalRows.length,
        skipped: duplicates.length,
        failed: problems.length,
        problems,
        duplicates,
      });
    }

    // 4. Schreiben. createMany statt einzelner Inserts: bei 2000 Zeilen ist der
    //    Unterschied spürbar, und alle Zeilen hier sind bereits geprüft.
    let imported = 0;
    if (finalRows.length > 0) {
      const data = finalRows.map((candidate) => ({
        ...candidate.data,
        tenantId: check.tenantId!,
      }));

      if (target === "persons") {
        const result = await prisma.person.createMany({ data: data as never, skipDuplicates: true });
        imported = result.count;
      } else {
        const result = await prisma.vendor.createMany({ data: data as never, skipDuplicates: true });
        imported = result.count;
      }
    }

    await createAuditLog({
      action: "CREATE",
      entityType: target === "persons" ? "Person" : "Vendor",
      entityId: "csv-import",
      description: `CSV-Import: ${imported} übernommen, ${duplicates.length} übersprungen, ${problems.length} fehlerhaft`,
    });

    logger.info(
      { target, imported, skipped: duplicates.length, failed: problems.length, tenantId: check.tenantId },
      "[Import] CSV-Import abgeschlossen",
    );

    return NextResponse.json({
      dryRun: false,
      total: rows.length,
      imported,
      skipped: duplicates.length,
      failed: problems.length,
      problems,
      duplicates,
    });
  } catch (error) {
    logger.error({ err: error }, "[Import] CSV-Import fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "Import fehlgeschlagen" });
  }
}

/** Prüfregeln, die ohne Datenbankzugriff auskommen. */
function validateRow(
  row: Record<string, string>,
  spec: CsvImportSpec,
  rowNumber: number,
): RowProblem[] {
  const problems: RowProblem[] = [];

  for (const field of spec.fields) {
    const value = (row[field.key] ?? "").trim();

    if (field.required && value === "") {
      problems.push({ row: rowNumber, field: field.key, message: "Pflichtfeld ist leer" });
      continue;
    }
    if (value === "") continue;

    if (field.enumValues && !field.enumValues.includes(value)) {
      problems.push({
        row: rowNumber,
        field: field.key,
        message: `Wert "${value}" nicht zulässig (erlaubt: ${field.enumValues.join(", ")})`,
      });
    }
    if (field.maxLength && value.length > field.maxLength) {
      problems.push({
        row: rowNumber,
        field: field.key,
        message: `Länger als ${field.maxLength} Zeichen`,
      });
    }
    if (field.key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      problems.push({ row: rowNumber, field: field.key, message: "Keine gültige E-Mail-Adresse" });
    }
  }

  // Eine Person braucht irgendeinen Namen. Ohne diese Prüfung entstehen
  // namenlose Datensätze, die in jeder Liste als "-" erscheinen.
  if (spec.target === "persons") {
    const hasName =
      (row.companyName ?? "").trim() !== "" ||
      (row.lastName ?? "").trim() !== "" ||
      (row.firstName ?? "").trim() !== "";
    if (!hasName) {
      problems.push({ row: rowNumber, message: "Weder Name noch Firma angegeben" });
    }
  }

  return problems;
}

/** Nur die bekannten Felder übernehmen, getrimmt, leere weglassen. */
function cleanRow(row: Record<string, string>, spec: CsvImportSpec): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const field of spec.fields) {
    const value = (row[field.key] ?? "").trim();
    if (value !== "") clean[field.key] = value;
  }
  // personType hat in der Datenbank einen Vorgabewert, aber eine Zeile mit
  // Firmenname und ohne Angabe ist offensichtlich eine juristische Person.
  if (spec.target === "persons" && !clean.personType) {
    clean.personType = clean.companyName ? "legal" : "natural";
  }
  return clean;
}

/** Schlüssel für die Dublettenprüfung innerhalb der Datei. */
function dedupeKey(data: Record<string, string>, spec: CsvImportSpec): string | null {
  for (const combination of spec.dedupeBy) {
    if (combination.every((field) => (data[field] ?? "").trim() !== "")) {
      return combination.map((field) => data[field].trim().toLowerCase()).join(" ");
    }
  }
  return null;
}

/** Dublettenprüfung gegen den Bestand. */
async function findExisting(
  target: string,
  data: Record<string, string>,
  tenantId: string,
): Promise<boolean> {
  const spec = IMPORT_SPECS[target];

  for (const combination of spec.dedupeBy) {
    if (!combination.every((field) => (data[field] ?? "").trim() !== "")) continue;

    const where: Record<string, unknown> = { tenantId };
    for (const field of combination) {
      // `mode: insensitive` — "Meier GmbH" und "MEIER GMBH" sind derselbe
      // Kontakt, und Excel-Exporte sind bei der Schreibweise nicht zimperlich.
      where[field] = { equals: data[field].trim(), mode: "insensitive" };
    }

    const hit =
      target === "persons"
        ? await prisma.person.findFirst({ where: where as never, select: { id: true } })
        : await prisma.vendor.findFirst({
            where: { ...where, deletedAt: null } as never,
            select: { id: true },
          });

    if (hit) return true;
  }
  return false;
}
