import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { parseStatusCodeXlsx } from "@/lib/scada/status-code-parser";

// POST /api/admin/scada-codes/import — Import XLSX code list
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const controllerTypeOverride = formData.get("controllerType") as
      | string
      | null;

    if (!file) {
      return NextResponse.json(
        { error: "Keine Datei hochgeladen" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = parseStatusCodeXlsx(buffer);

    // Use override if provided, otherwise use detected controller type
    const controllerType =
      controllerTypeOverride?.trim() || result.controllerType;
    if (!controllerType) {
      return NextResponse.json(
        {
          error:
            "Steuerungstyp konnte nicht ermittelt werden. Bitte manuell angeben.",
        },
        { status: 400 }
      );
    }

    if (result.codes.length === 0) {
      return NextResponse.json(
        {
          error: `Keine Codes in der Datei gefunden. Erkannter Steuerungstyp: ${result.controllerType || "keiner"}. Bitte prüfen Sie ob es sich um eine ServiceOrderDocuments.XLSX handelt.`,
        },
        { status: 400 }
      );
    }

    // Replace all codes for this controller type (transaction)
    await prisma.$transaction(async (tx) => {
      await tx.scadaStatusCode.deleteMany({
        where: { controllerType },
      });

      await tx.scadaStatusCode.createMany({
        data: result.codes.map((code) => ({
          controllerType,
          codeType: code.codeType,
          mainCode: code.mainCode,
          subCode: code.subCode,
          description: code.description,
          parentLabel: code.parentLabel,
          timeKey: code.timeKey,
          messageType: code.messageType,
        })),
      });
    });

    logger.info(
      { controllerType, count: result.codes.length },
      "SCADA status codes imported"
    );

    return NextResponse.json({
      imported: result.codes.length,
      controllerType,
      detectedControllerType: result.controllerType,
    });
  } catch (error) {
    logger.error({ err: error }, "Error importing SCADA status codes");
    return NextResponse.json(
      { error: "Fehler beim Importieren der Statuscodes" },
      { status: 500 }
    );
  }
}
