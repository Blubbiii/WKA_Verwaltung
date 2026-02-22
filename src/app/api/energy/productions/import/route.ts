import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { ProductionDataSource, ProductionStatus, Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

interface ImportRow {
  turbineId: string;
  year: number;
  month: number;
  productionKwh: number;
  operatingHours?: number;
  availabilityPct?: number;
}

interface ImportRowResult {
  row: number;
  success: boolean;
  turbineId?: string;
  turbineDesignation?: string;
  year?: number;
  month?: number;
  error?: string;
  action?: "created" | "updated" | "skipped";
}

interface ImportResult {
  success: boolean;
  totalRows: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  createdCount: number;
  updatedCount: number;
  results: ImportRowResult[];
  errors: ImportRowResult[];
}

// Column mapping from the CSV wizard
interface ColumnMapping {
  turbineId: string | null;
  turbineName: string | null;
  year: string | null;
  month: string | null;
  production: string | null;
  operatingHours: string | null;
  availabilityPct: string | null;
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

// Wizard-based request (from CSV import UI)
const wizardRequestSchema = z.object({
  action: z.enum(["validate", "import"]),
  mapping: z.object({
    turbineId: z.string().nullable(),
    turbineName: z.string().nullable(),
    year: z.string().nullable(),
    month: z.string().nullable(),
    production: z.string().nullable(),
    operatingHours: z.string().nullable(),
    availabilityPct: z.string().nullable(),
  }),
  data: z.array(z.record(z.any())).min(1).max(5000),
});

// Direct API request (programmatic)
const importRowSchema = z.object({
  turbineId: z.string().uuid("Ungueltige Turbinen-ID"),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  productionKwh: z.number().nonnegative(),
  operatingHours: z.number().nonnegative().optional(),
  availabilityPct: z.number().min(0).max(100).optional(),
});

const directImportSchema = z.object({
  data: z.array(importRowSchema).min(1).max(1000),
  options: z.object({
    updateExisting: z.boolean().default(false),
    skipErrors: z.boolean().default(true),
    source: z.enum(["CSV_IMPORT", "EXCEL_IMPORT", "SCADA"]).default("CSV_IMPORT"),
    defaultStatus: z.enum(["DRAFT", "CONFIRMED"]).default("DRAFT"),
  }).optional(),
});

// =============================================================================
// HELPER: Resolve raw CSV rows to typed ImportRows using column mapping
// =============================================================================

async function resolveRows(
  rawRows: Record<string, any>[],
  mapping: ColumnMapping,
  tenantId: string
): Promise<{
  resolved: ImportRow[];
  validationResults: Array<{
    rowIndex: number;
    status: "success" | "warning" | "error";
    messages: string[];
    data: Record<string, any>;
  }>;
}> {
  // Load all tenant turbines for name/ID resolution
  const allTurbines = await prisma.turbine.findMany({
    where: { park: { tenantId } },
    select: { id: true, designation: true },
  });

  // Build lookup maps (case-insensitive)
  const turbineByDesignation = new Map(
    allTurbines.map((t) => [t.designation.toLowerCase().trim(), t])
  );
  const turbineById = new Map(allTurbines.map((t) => [t.id, t]));

  // Also try to match by partial name (e.g. "WKA-001" matching "Enercon E-82 Nr. 1")
  // and by the raw turbineId column value against designation
  const turbineByAnyIdentifier = (idValue: string | null, nameValue: string | null) => {
    // Try exact name match first
    if (nameValue) {
      const found = turbineByDesignation.get(nameValue.toLowerCase().trim());
      if (found) return found;
    }

    // Try ID as UUID
    if (idValue) {
      const found = turbineById.get(idValue);
      if (found) return found;
    }

    // Try ID value against designation (e.g. CSV has "WKA-001" as ID)
    if (idValue) {
      const found = turbineByDesignation.get(idValue.toLowerCase().trim());
      if (found) return found;
    }

    // Try partial matching: find turbine whose designation contains the search value
    const searchVal = (nameValue || idValue || "").toLowerCase().trim();
    if (searchVal) {
      for (const t of allTurbines) {
        if (t.designation.toLowerCase().includes(searchVal) || searchVal.includes(t.designation.toLowerCase())) {
          return t;
        }
      }
    }

    return null;
  };

  const resolved: ImportRow[] = [];
  const validationResults: Array<{
    rowIndex: number;
    status: "success" | "warning" | "error";
    messages: string[];
    data: Record<string, any>;
  }> = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const messages: string[] = [];
    let status: "success" | "warning" | "error" = "success";

    // Extract values via mapping
    const turbineIdRaw = mapping.turbineId ? String(row[mapping.turbineId] ?? "").trim() : null;
    const turbineNameRaw = mapping.turbineName ? String(row[mapping.turbineName] ?? "").trim() : null;
    const yearRaw = mapping.year ? row[mapping.year] : null;
    const monthRaw = mapping.month ? row[mapping.month] : null;
    const productionRaw = mapping.production ? row[mapping.production] : null;
    const operatingHoursRaw = mapping.operatingHours ? row[mapping.operatingHours] : null;
    const availabilityPctRaw = mapping.availabilityPct ? row[mapping.availabilityPct] : null;

    // Resolve turbine
    const turbine = turbineByAnyIdentifier(turbineIdRaw, turbineNameRaw);
    if (!turbine) {
      messages.push(`Anlage nicht gefunden: ${turbineNameRaw || turbineIdRaw || "(leer)"}`);
      status = "error";
    }

    // Validate year
    const year = Number(yearRaw);
    if (isNaN(year) || year < 2000 || year > 2100) {
      messages.push(`Ungueltiges Jahr: ${yearRaw}`);
      status = "error";
    }

    // Validate month
    const month = Number(monthRaw);
    if (isNaN(month) || month < 1 || month > 12) {
      messages.push(`Ungueltiger Monat: ${monthRaw}`);
      status = "error";
    }

    // Validate production
    const production = Number(typeof productionRaw === "string" ? productionRaw.replace(",", ".") : productionRaw);
    if (isNaN(production) || production < 0) {
      messages.push(`Ungueltige Produktion: ${productionRaw}`);
      status = "error";
    } else if (production > 50000000) {
      messages.push("Sehr hohe Produktionsmenge - bitte pruefen");
      if (status === "success") status = "warning";
    }

    // Parse operating hours (optional)
    let operatingHours: number | undefined;
    if (operatingHoursRaw !== null && operatingHoursRaw !== undefined && operatingHoursRaw !== "") {
      operatingHours = Number(typeof operatingHoursRaw === "string" ? operatingHoursRaw.replace(",", ".") : operatingHoursRaw);
      if (isNaN(operatingHours) || operatingHours < 0) {
        messages.push(`Ungueltige Betriebsstunden: ${operatingHoursRaw}`);
        if (status === "success") status = "warning";
        operatingHours = undefined;
      }
    }

    // Parse availability percentage (optional)
    let availabilityPct: number | undefined;
    if (availabilityPctRaw !== null && availabilityPctRaw !== undefined && availabilityPctRaw !== "") {
      availabilityPct = Number(typeof availabilityPctRaw === "string" ? availabilityPctRaw.replace(",", ".") : availabilityPctRaw);
      if (isNaN(availabilityPct) || availabilityPct < 0 || availabilityPct > 100) {
        messages.push(`Ungueltige Verfuegbarkeit: ${availabilityPctRaw} (erwartet 0-100)`);
        if (status === "success") status = "warning";
        availabilityPct = undefined;
      }
    }

    if (status === "success") {
      messages.push("OK");
    }

    validationResults.push({ rowIndex: i, status, messages, data: row });

    if (status !== "error" && turbine) {
      resolved.push({
        turbineId: turbine.id,
        year,
        month,
        productionKwh: production,
        operatingHours,
        availabilityPct,
      });
    }
  }

  return { resolved, validationResults };
}

// =============================================================================
// HELPER: Execute bulk import
// =============================================================================

async function executeImport(
  rows: ImportRow[],
  tenantId: string,
  options: { updateExisting: boolean; skipErrors: boolean; source: string; defaultStatus: string }
): Promise<ImportResult> {
  const result: ImportResult = {
    success: true,
    totalRows: rows.length,
    successCount: 0,
    errorCount: 0,
    skippedCount: 0,
    createdCount: 0,
    updatedCount: 0,
    results: [],
    errors: [],
  };

  const uniqueTurbineIds = [...new Set(rows.map((r) => r.turbineId))];

  const turbines = await prisma.turbine.findMany({
    where: { id: { in: uniqueTurbineIds }, park: { tenantId } },
    select: { id: true, designation: true },
  });
  const turbineMap = new Map(turbines.map((t) => [t.id, t]));
  const validTurbineIds = new Set(turbines.map((t) => t.id));

  // Load existing for duplicate check (unique constraint: turbineId + year + month + tenantId)
  const existingProductions = await prisma.turbineProduction.findMany({
    where: {
      tenantId,
      OR: rows.map((r) => ({
        turbineId: r.turbineId,
        year: r.year,
        month: r.month,
      })),
    },
    select: { id: true, turbineId: true, year: true, month: true, status: true },
  });
  const existingMap = new Map(
    existingProductions.map((p) => [`${p.turbineId}-${p.year}-${p.month}`, p])
  );

  const toCreate: Prisma.TurbineProductionCreateManyInput[] = [];
  const toUpdate: Array<{ id: string; data: Prisma.TurbineProductionUpdateInput }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowResult: ImportRowResult = {
      row: i + 1,
      success: false,
      turbineId: row.turbineId,
      year: row.year,
      month: row.month,
    };

    if (!validTurbineIds.has(row.turbineId)) {
      rowResult.error = `Turbine nicht gefunden: ${row.turbineId}`;
      result.errors.push(rowResult);
      result.errorCount++;
      if (!options.skipErrors) break;
      continue;
    }

    const turbine = turbineMap.get(row.turbineId)!;
    rowResult.turbineDesignation = turbine.designation;

    const existingKey = `${row.turbineId}-${row.year}-${row.month}`;
    const existing = existingMap.get(existingKey);

    if (existing) {
      if (!options.updateExisting) {
        rowResult.action = "skipped";
        rowResult.error = `Eintrag existiert bereits fuer ${turbine.designation} ${row.month}/${row.year}`;
        result.results.push(rowResult);
        result.skippedCount++;
        continue;
      }

      if (existing.status === "INVOICED") {
        rowResult.error = `Bereits abgerechneter Eintrag: ${turbine.designation} ${row.month}/${row.year}`;
        result.errors.push(rowResult);
        result.errorCount++;
        if (!options.skipErrors) break;
        continue;
      }

      toUpdate.push({
        id: existing.id,
        data: {
          productionKwh: row.productionKwh,
          operatingHours: row.operatingHours ?? null,
          availabilityPct: row.availabilityPct ?? null,
          source: options.source as ProductionDataSource,
        },
      });

      rowResult.success = true;
      rowResult.action = "updated";
      result.results.push(rowResult);
      result.updatedCount++;
    } else {
      toCreate.push({
        turbineId: row.turbineId,
        year: row.year,
        month: row.month,
        productionKwh: row.productionKwh,
        operatingHours: row.operatingHours ?? null,
        availabilityPct: row.availabilityPct ?? null,
        source: options.source as ProductionDataSource,
        status: options.defaultStatus as ProductionStatus,
        tenantId,
      });

      rowResult.success = true;
      rowResult.action = "created";
      result.results.push(rowResult);
      result.createdCount++;
    }
  }

  // Execute DB transactions
  await prisma.$transaction(async (tx) => {
    if (toCreate.length > 0) {
      await tx.turbineProduction.createMany({ data: toCreate, skipDuplicates: true });
    }
    for (const update of toUpdate) {
      await tx.turbineProduction.update({ where: { id: update.id }, data: update.data });
    }
  });

  result.successCount = result.createdCount + result.updatedCount;
  result.success = result.errorCount === 0 || options.skipErrors;

  return result;
}

// =============================================================================
// POST /api/energy/productions/import
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:create");
    if (!check.authorized) return check.error;

    const body = await request.json();

    // Detect request format: wizard (action-based) vs direct (schema-based)
    if (body.action && body.mapping) {
      // =====================================================================
      // WIZARD FORMAT: { action, mapping, data }
      // =====================================================================
      const validated = wizardRequestSchema.parse(body);
      const { action, mapping, data: rawRows } = validated;

      const { resolved, validationResults } = await resolveRows(
        rawRows,
        mapping as ColumnMapping,
        check.tenantId!
      );

      if (action === "validate") {
        return NextResponse.json({ validationResults });
      }

      // action === "import"
      if (resolved.length === 0) {
        return NextResponse.json(
          { success: false, error: "Keine gueltigen Zeilen zum Importieren", imported: 0, skipped: 0, errors: rawRows.length, details: ["Alle Zeilen enthalten Fehler"] },
          { status: 400 }
        );
      }

      const importResult = await executeImport(resolved, check.tenantId!, {
        updateExisting: false,
        skipErrors: true,
        source: "CSV_IMPORT",
        defaultStatus: "DRAFT",
      });

      // Map to the format the frontend expects
      return NextResponse.json({
        imported: importResult.createdCount + importResult.updatedCount,
        skipped: importResult.skippedCount,
        errors: importResult.errorCount,
        details: importResult.errors.map((e) => e.error || "Unbekannter Fehler"),
      }, { status: importResult.errorCount > 0 ? 207 : 201 });

    } else {
      // =====================================================================
      // DIRECT FORMAT: { data: ImportRow[], options }
      // =====================================================================
      const validated = directImportSchema.parse(body);
      const rows = validated.data;
      const options = validated.options || {
        updateExisting: false,
        skipErrors: true,
        source: "CSV_IMPORT" as const,
        defaultStatus: "DRAFT" as const,
      };

      const result = await executeImport(rows, check.tenantId!, {
        updateExisting: options.updateExisting,
        skipErrors: options.skipErrors,
        source: options.source,
        defaultStatus: options.defaultStatus,
      });

      const statusCode = result.errorCount > 0 && !options.skipErrors
        ? 400
        : result.errorCount > 0
          ? 207
          : 201;

      return NextResponse.json(result, { status: statusCode });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validierungsfehler im Import-Format", details: error.errors },
        { status: 400 }
      );
    }

    logger.error({ err: error }, "Error importing productions");
    return NextResponse.json(
      { success: false, error: "Fehler beim Import der Produktionsdaten", details: error instanceof Error ? error.message : "Unbekannter Fehler" },
      { status: 500 }
    );
  }
}
