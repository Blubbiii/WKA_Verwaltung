import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import {
  listBackups,
  createBackup,
  deleteBackup,
  applyRetention,
  listS3Backups,
  getBackupConfigSummary,
  checkPgDumpAvailable,
} from "@/lib/backup";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";
import { ListObjectsV2Command, type ListObjectsV2CommandOutput } from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET } from "@/lib/storage";
import { cache } from "@/lib/cache";
import { runTusGarbageCollection } from "@/lib/tus/gc";

const backupActionSchema = z.object({
  action: z.enum(["create", "applyRetention", "searchOrphans", "clearCache", "deleteTemp", "export"]),
  type: z.enum(["daily", "weekly", "monthly", "manual"]).optional(),
  format: z.string().optional(),
  tables: z.array(z.string().min(1)).optional(),
});

// Category display names for document storage stats
const categoryDisplayNames: Record<string, string> = {
  CONTRACT: "Verträge",
  PROTOCOL: "Protokolle",
  REPORT: "Berichte",
  INVOICE: "Rechnungen",
  PERMIT: "Genehmigungen",
  CORRESPONDENCE: "Korrespondenz",
  OTHER: "Sonstige",
};

/**
 * GET /api/admin/backup
 * Returns backup list, storage stats, backup config, and retention info
 */
export async function GET(request: NextRequest) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const source = searchParams.get("source"); // "local" | "s3" | undefined (both)

    // Fetch real backup file listing
    const localBackups = source !== "s3" ? await listBackups() : [];
    const s3Backups = source !== "local" ? await listS3Backups() : [];

    // Fetch real document statistics from database
    const documentStats = await prisma.document.groupBy({
      by: ["category"],
      _count: { id: true },
      _sum: { fileSizeBytes: true },
    });

    // Calculate totals
    const totalDocuments = await prisma.document.count();
    const totalSize = await prisma.document.aggregate({
      _sum: { fileSizeBytes: true },
    });

    // Format storage by category
    const storageByCategory = documentStats.map((stat) => ({
      category: stat.category,
      categoryDisplay: categoryDisplayNames[stat.category] || stat.category,
      count: stat._count.id,
      sizeBytes: Number(stat._sum.fileSizeBytes || 0),
    }));

    // Calculate average file size
    const totalSizeBytes = Number(totalSize._sum.fileSizeBytes || 0);
    const averageFileSizeBytes =
      totalDocuments > 0 ? Math.round(totalSizeBytes / totalDocuments) : 0;

    // Calculate total backup size
    const totalBackupSizeBytes = localBackups.reduce(
      (sum, b) => sum + b.sizeBytes,
      0
    );

    // Get backup config (no secrets)
    const backupConfig = getBackupConfigSummary();

    // Check if pg_dump is available
    const pgDumpAvailable = await checkPgDumpAvailable();

    const response = {
      backups: localBackups,
      s3Backups,
      storageStats: {
        totalUsedBytes: totalSizeBytes,
        totalBackupSizeBytes,
        documentCount: totalDocuments,
        averageFileSizeBytes,
        backupCount: localBackups.length,
      },
      storageByCategory,
      config: backupConfig,
      pgDumpAvailable,
      retention: {
        daily: backupConfig.retentionDaily,
        weekly: backupConfig.retentionWeekly,
        monthly: backupConfig.retentionMonthly,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error({ err: error }, "Error fetching backup data");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Backup-Daten" });
  }
}

/**
 * POST /api/admin/backup
 * Handles various backup/storage actions
 */
export async function POST(request: NextRequest) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = backupActionSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { action } = parsed.data;

    switch (action) {
      case "create": {
        const type = parsed.data.type ?? "manual";
        logger.info({ type }, "[BACKUP] Creating database backup...");

        // Check if pg_dump is available
        const pgDumpAvailable = await checkPgDumpAvailable();
        if (!pgDumpAvailable) {
          return apiError("INTERNAL_ERROR", 503, { message: "pg_dump ist nicht verfügbar. Backups können nur in der Docker-Umgebung erstellt werden." });
        }

        const result = await createBackup(type);

        if (!result.success) {
          return apiError("INTERNAL_ERROR", 500, {
            message: result.error || "Backup-Erstellung fehlgeschlagen",
          });
        }

        logger.info(
          {
            fileName: result.backup?.fileName,
            sizeBytes: result.backup?.sizeBytes,
            durationMs: result.durationMs,
          },
          "[BACKUP] Backup created successfully"
        );

        return NextResponse.json({
          success: true,
          backup: result.backup,
          durationMs: result.durationMs,
          message: "Backup erfolgreich erstellt",
        });
      }

      case "applyRetention": {
        logger.info("[BACKUP] Applying retention policy...");

        const result = await applyRetention();

        logger.info(
          { deleted: result.deleted.length, kept: result.kept },
          "[BACKUP] Retention policy applied"
        );

        return NextResponse.json({
          success: true,
          deleted: result.deleted,
          kept: result.kept,
          message: `Retention angewendet: ${result.deleted.length} Backup(s) gelöscht`,
        });
      }

      case "searchOrphans": {
        logger.info("[STORAGE] Searching for orphaned files...");

        // Two orphan classes:
        //  A) S3 objects with no matching document.fileUrl (dead files
        //     leaking storage — this is what "orphan" typically means)
        //  B) DB documents whose fileUrl points to a missing S3 object
        //     (broken references — user-facing 404s)

        // Collect all S3 keys via paginated ListObjectsV2
        const s3Keys = new Set<string>();
        let continuationToken: string | undefined = undefined;
        try {
          do {
            const resp: ListObjectsV2CommandOutput = await s3Client.send(
              new ListObjectsV2Command({
                Bucket: S3_BUCKET,
                ContinuationToken: continuationToken,
                MaxKeys: 1000,
              })
            );
            for (const obj of resp.Contents ?? []) {
              if (obj.Key) s3Keys.add(obj.Key);
            }
            continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
          } while (continuationToken);
        } catch (err) {
          logger.error({ err }, "[STORAGE] Failed to list S3 objects");
          return apiError("STORAGE_FAILED", 500, {
            message: "S3/MinIO konnte nicht gelistet werden",
          });
        }

        // Collect all referenced fileUrls (== s3Keys) from DB. Documents
        // store the s3Key directly in fileUrl (see /api/upload).
        const docs = await prisma.document.findMany({
          select: { id: true, fileUrl: true },
          where: { fileUrl: { not: "" } },
        });
        const dbKeys = new Set(docs.map((d) => d.fileUrl).filter(Boolean));

        // A) S3 keys not referenced by any document
        const orphanedS3Keys: string[] = [];
        for (const k of s3Keys) {
          if (!dbKeys.has(k)) orphanedS3Keys.push(k);
        }

        // B) DB references pointing to missing S3 objects
        const brokenDocRefs = docs.filter((d) => d.fileUrl && !s3Keys.has(d.fileUrl));

        logger.info(
          {
            s3ObjectCount: s3Keys.size,
            dbDocumentCount: docs.length,
            orphanedS3: orphanedS3Keys.length,
            brokenDocRefs: brokenDocRefs.length,
          },
          "[STORAGE] Orphan search completed"
        );

        return NextResponse.json({
          success: true,
          // Legacy field kept for the existing UI
          orphanedCount: orphanedS3Keys.length,
          // Detailed breakdown for future UI
          s3ObjectCount: s3Keys.size,
          dbDocumentCount: docs.length,
          orphanedS3Sample: orphanedS3Keys.slice(0, 10),
          brokenDocRefsSample: brokenDocRefs.slice(0, 10).map((d) => ({
            id: d.id,
            fileUrl: d.fileUrl,
          })),
          message:
            `${orphanedS3Keys.length} S3-Objekt(e) ohne DB-Referenz, ` +
            `${brokenDocRefs.length} DB-Referenzen ohne S3-Objekt`,
        });
      }

      case "clearCache": {
        logger.info("[STORAGE] Clearing application cache...");

        // We clear per tenant + global via the wrapper's delPattern. That
        // wipes wpm:{tenantId}:* and wpm:global:* — the exact key scheme
        // used by cache.set()/cache.get(). Redis fallback (memory cache) is
        // handled by the same call.
        let clearedGlobal = false;
        let clearedTenants = 0;
        try {
          clearedGlobal = await cache.delPattern("*");
        } catch (err) {
          logger.warn({ err }, "[STORAGE] Cache clear global failed");
        }

        try {
          const tenants = await prisma.tenant.findMany({
            select: { id: true },
          });
          for (const t of tenants) {
            const ok = await cache.clearTenant(t.id);
            if (ok) clearedTenants++;
          }
        } catch (err) {
          logger.warn({ err }, "[STORAGE] Cache clear per-tenant failed");
        }

        const stats = await cache.getStats().catch(() => null);

        logger.info(
          { clearedGlobal, clearedTenants, statsAfter: stats },
          "[STORAGE] Cache cleared"
        );

        return NextResponse.json({
          success: true,
          clearedGlobal,
          clearedTenants,
          usingMemoryFallback: stats?.usingMemoryFallback ?? true,
          message:
            `Cache geleert — global: ${clearedGlobal ? "ok" : "fehlgeschlagen"}, ` +
            `${clearedTenants} Mandanten-Cache(s) gelöscht` +
            (stats?.usingMemoryFallback ? " (In-Memory-Fallback aktiv)" : ""),
        });
      }

      case "deleteTemp": {
        logger.info("[STORAGE] Deleting temporary files...");

        // Delegate to the tus GC which handles the two directories the
        // uploader actually uses:
        //   1. TUS_UPLOAD_DIR — in-flight chunk store
        //   2. TUS_SCADA_STAGING_DIR — post-upload per-session tree
        // Both respect a 24h TTL so in-flight uploads are NOT killed.
        const gcResult = await runTusGarbageCollection();

        // Additionally sweep the legacy /app/tmp path if present (older
        // uploaders may still write there).
        const fs = await import("fs/promises");
        const path = await import("path");
        const legacyTempDir = path.join(process.cwd(), "tmp");
        let legacyDeleted = 0;
        try {
          const files = await fs.readdir(legacyTempDir);
          const cutoff = Date.now() - 24 * 60 * 60 * 1000;
          for (const file of files) {
            try {
              const filePath = path.join(legacyTempDir, file);
              const stat = await fs.lstat(filePath);
              if (!stat.isFile()) continue;
              if (stat.mtimeMs > cutoff) continue; // fresh — likely in use
              await fs.unlink(filePath);
              legacyDeleted++;
            } catch {
              // Skip files that cannot be deleted
            }
          }
        } catch {
          // legacy tmp dir may not exist — normal
        }

        const total =
          gcResult.tusExpiredCount +
          gcResult.scadaSessionsRemoved +
          legacyDeleted;

        logger.info(
          {
            tusExpired: gcResult.tusExpiredCount,
            scadaSessions: gcResult.scadaSessionsRemoved,
            legacyDeleted,
            errors: gcResult.errors,
          },
          "[STORAGE] Temp cleanup done"
        );

        return NextResponse.json({
          success: true,
          // Legacy field kept for the existing UI
          deletedCount: total,
          // Detailed breakdown
          tusExpiredCount: gcResult.tusExpiredCount,
          scadaSessionsRemoved: gcResult.scadaSessionsRemoved,
          legacyDeleted,
          errors: gcResult.errors,
          message:
            `Bereinigt: ${gcResult.tusExpiredCount} tus-Uploads, ` +
            `${gcResult.scadaSessionsRemoved} SCADA-Sessions, ` +
            `${legacyDeleted} Legacy-Temp-Dateien (alles > 24h alt)`,
        });
      }

      case "export": {
        const { format, tables } = parsed.data;

        if (!tables || tables.length === 0) {
          return apiError("BAD_REQUEST", undefined, { message: "Keine Tabellen ausgewaehlt" });
        }

        logger.info(
          { format, tables },
          "[EXPORT] Starting export"
        );

        // Generate download URL (export handler is separate)
        const downloadUrl = `/api/admin/backup/download/export_${Date.now()}.${format}`;

        logger.info(
          { downloadUrl },
          "[EXPORT] Export completed"
        );

        return NextResponse.json({
          success: true,
          downloadUrl,
          message: "Export erfolgreich gestartet",
        });
      }

      default:
        return apiError("BAD_REQUEST", undefined, { message: "Unbekannte Aktion" });
    }
  } catch (error) {
    logger.error({ err: error }, "Error processing backup action");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler bei der Verarbeitung" });
  }
}

/**
 * DELETE /api/admin/backup?id=xxx
 * Deletes a specific backup file
 */
export async function DELETE(request: NextRequest) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const backupId = searchParams.get("id");

    if (!backupId) {
      return apiError("MISSING_FIELD", undefined, { message: "Backup-ID fehlt" });
    }

    const result = await deleteBackup(backupId);

    if (!result.success) {
      return apiError("NOT_FOUND", undefined, { message: result.error || "Backup konnte nicht gelöscht werden" });
    }

    logger.info({ backupId }, "[BACKUP] Backup deleted via API");

    return NextResponse.json({
      success: true,
      message: "Backup erfolgreich gelöscht",
    });
  } catch (error) {
    logger.error({ err: error }, "Error deleting backup");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen des Backups" });
  }
}
