/**
 * POST /api/admin/archive/verify - Run integrity verification
 *
 * Verifies the hash chain integrity for the tenant's archive.
 * Permission: admin:manage
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/withPermission";
import {
  verifyChainIntegrity,
  saveVerificationResult,
} from "@/lib/archive/gobd-archive";
import { createAuditLog } from "@/lib/audit";
import { apiLogger as logger } from "@/lib/logger";

const verifyBodySchema = z.object({
  scope: z.enum(["FULL", "YEAR"]),
  year: z.number().int().min(2000).max(2100).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = verifyBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Eingabedaten", details: parsed.error.errors },
        { status: 400 }
      );
    }

    const { scope, year } = parsed.data;

    // Validate that year is provided when scope is YEAR
    if (scope === "YEAR" && !year) {
      return NextResponse.json(
        { error: "Jahr erforderlich bei Prüfungsumfang 'YEAR'" },
        { status: 400 }
      );
    }

    // Determine date range
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    let scopeLabel = "FULL";

    if (scope === "YEAR" && year) {
      startDate = new Date(year, 0, 1);
      endDate = new Date(year, 11, 31, 23, 59, 59, 999);
      scopeLabel = `YEAR_${year}`;
    }

    // Run verification
    const result = await verifyChainIntegrity(
      check.tenantId!,
      startDate,
      endDate
    );

    // Save verification result
    const verificationLog = await saveVerificationResult(
      check.tenantId!,
      check.userId!,
      scopeLabel,
      result
    );

    // Audit log
    await createAuditLog({
      action: "VIEW",
      entityType: "ArchiveVerification",
      entityId: verificationLog.id,
      newValues: {
        scope: scopeLabel,
        passed: result.passed,
        totalDocuments: result.totalDocuments,
        validDocuments: result.validDocuments,
        invalidDocuments: result.invalidDocuments,
      },
      description: `GoBD-Integritaetsprüfung: ${scopeLabel} - ${result.passed ? "BESTANDEN" : "FEHLGESCHLAGEN"}`,
    });

    return NextResponse.json({
      verificationId: verificationLog.id,
      scope: scopeLabel,
      result: {
        passed: result.passed,
        totalDocuments: result.totalDocuments,
        validDocuments: result.validDocuments,
        invalidDocuments: result.invalidDocuments,
        errors: result.errors,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error running archive verification");
    return NextResponse.json(
      { error: "Fehler bei der Integritaetsprüfung" },
      { status: 500 }
    );
  }
}
