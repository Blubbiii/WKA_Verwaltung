import { NextRequest, NextResponse } from "next/server";
import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { startImport, isValidFileType, type ScadaFileType } from "@/lib/scada/import-service";
import { apiLogger as logger } from "@/lib/logger";

// All supported SCADA file extensions
const SCADA_EXTENSIONS = new Set([
  "wsd", "uid",
  "avr", "avw", "avm", "avy",
  "ssm", "swm",
  "pes", "pew", "pet",
  "wsr", "wsw", "wsm", "wsy",
]);

// Max upload: 500 MB total (SCADA archives can be large)
const MAX_TOTAL_SIZE = 500 * 1024 * 1024;

// =============================================================================
// POST /api/energy/scada/upload
// Accepts multipart form data with SCADA files, saves to temp, starts import
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:create");
    if (!check.authorized) return check.error;

    const formData = await request.formData();
    const locationCode = formData.get("locationCode") as string | null;

    if (!locationCode || !locationCode.startsWith("Loc_")) {
      return NextResponse.json(
        { error: "locationCode ist erforderlich und muss mit 'Loc_' beginnen" },
        { status: 400 }
      );
    }

    // Collect all uploaded files
    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === "files" && value instanceof File) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: "Keine Dateien hochgeladen" },
        { status: 400 }
      );
    }

    // Validate total size
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      return NextResponse.json(
        { error: `Gesamtgröße (${Math.round(totalSize / 1024 / 1024)} MB) überschreitet das Limit von 500 MB` },
        { status: 400 }
      );
    }

    // Group files by detected file type
    const filesByType = new Map<ScadaFileType, File[]>();
    const invalidFiles: string[] = [];

    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!SCADA_EXTENSIONS.has(ext)) {
        invalidFiles.push(file.name);
        continue;
      }
      const fileType = ext.toUpperCase() as ScadaFileType;
      if (!isValidFileType(fileType)) {
        invalidFiles.push(file.name);
        continue;
      }
      const group = filesByType.get(fileType) ?? [];
      group.push(file);
      filesByType.set(fileType, group);
    }

    if (filesByType.size === 0) {
      return NextResponse.json(
        {
          error: "Keine gültigen SCADA-Dateien gefunden",
          invalidFiles,
          supportedExtensions: Array.from(SCADA_EXTENSIONS).map((e) => `.${e}`),
        },
        { status: 400 }
      );
    }

    // Save files to temp directory and start imports per file type
    const uploadId = crypto.randomUUID();
    const tempBase = path.join(os.tmpdir(), "scada-uploads", uploadId);
    const importJobs: Array<{ fileType: string; importId: string; fileCount: number }> = [];

    for (const [fileType, typeFiles] of filesByType) {
      // Save files to temp dir: /tmp/scada-uploads/{uuid}/{fileType}/
      const typeDir = path.join(tempBase, fileType);
      await fs.mkdir(typeDir, { recursive: true });

      const savedPaths: string[] = [];
      for (const file of typeFiles) {
        // file.name may contain relative path from folder picker (e.g. "Loc_3196/00000000.avm")
        const safeName = path.basename(file.name);
        const filePath = path.join(typeDir, safeName);
        const buffer = Buffer.from(await file.arrayBuffer());
        await fs.writeFile(filePath, buffer);
        savedPaths.push(filePath);
      }

      // Check for running import
      const running = await prisma.scadaImportLog.findFirst({
        where: {
          tenantId: check.tenantId!,
          locationCode,
          fileType,
          status: "RUNNING",
        },
      });

      if (running) {
        // Skip this file type — already importing
        importJobs.push({ fileType, importId: running.id, fileCount: typeFiles.length });
        continue;
      }

      // Create import log
      const log = await prisma.scadaImportLog.create({
        data: {
          tenantId: check.tenantId!,
          locationCode,
          fileType,
          status: "RUNNING",
          filesTotal: typeFiles.length,
        },
      });

      // Fire-and-forget: start import with explicit file paths
      startImport({
        tenantId: check.tenantId!,
        locationCode,
        fileType: fileType as ScadaFileType,
        basePath: tempBase, // not used when filePaths is set
        importLogId: log.id,
        filePaths: savedPaths,
        cleanupDir: typeDir,
      }).catch(async (err: unknown) => {
        logger.error({ err }, `SCADA-Upload-Import fehlgeschlagen (Log: ${log.id})`);
        await prisma.scadaImportLog.update({
          where: { id: log.id },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            errorDetails: { message: String(err) },
          },
        });
      });

      importJobs.push({ fileType, importId: log.id, fileCount: typeFiles.length });
    }

    return NextResponse.json(
      {
        uploadId,
        imports: importJobs,
        totalFiles: files.length,
        invalidFiles: invalidFiles.length > 0 ? invalidFiles : undefined,
      },
      { status: 202 }
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    logger.error({ err: error, errMsg, errStack }, "Fehler beim SCADA-Upload");
    return NextResponse.json(
      { error: "Fehler beim Hochladen der SCADA-Dateien", details: errMsg },
      { status: 500 }
    );
  }
}
