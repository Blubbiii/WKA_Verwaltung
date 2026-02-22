/**
 * Database Backup Utility for WindparkManager
 *
 * Provides functions to:
 * - Create PostgreSQL backups using pg_dump
 * - List available backups from the local filesystem
 * - Delete backup files
 * - Upload/download backups to/from S3-compatible storage (MinIO)
 *
 * In production (Docker), backups are stored in /backups/{daily,weekly,monthly}/
 * In development, this falls back to a local ./backups directory.
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { logger } from "@/lib/logger";

const execAsync = promisify(exec);

const backupLogger = logger.child({ module: "backup" });

// =============================================================================
// CONFIGURATION
// =============================================================================

function getBackupConfig() {
  const isDocker = process.env.BACKUP_DIR || process.env.PGHOST === "postgres";

  return {
    // PostgreSQL connection
    pgHost: process.env.PGHOST || "localhost",
    pgPort: process.env.PGPORT || "5432",
    pgUser: process.env.PGUSER || process.env.POSTGRES_USER || "wpm",
    pgPassword: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || "",
    pgDatabase: process.env.PGDATABASE || process.env.POSTGRES_DB || "windparkmanager",

    // Backup storage
    backupDir: process.env.BACKUP_DIR || (isDocker ? "/backups" : path.join(process.cwd(), "backups")),

    // Retention
    retentionDaily: parseInt(process.env.BACKUP_RETENTION_DAILY || "7", 10),
    retentionWeekly: parseInt(process.env.BACKUP_RETENTION_WEEKLY || "4", 10),
    retentionMonthly: parseInt(process.env.BACKUP_RETENTION_MONTHLY || "3", 10),

    // S3/MinIO
    s3Enabled: process.env.BACKUP_S3_ENABLED === "true",
    s3Bucket: process.env.BACKUP_S3_BUCKET || "wpm-backups",
    s3Endpoint: process.env.BACKUP_S3_ENDPOINT || process.env.S3_ENDPOINT || "",
    s3AccessKey: process.env.BACKUP_S3_ACCESS_KEY || process.env.S3_ACCESS_KEY || "",
    s3SecretKey: process.env.BACKUP_S3_SECRET_KEY || process.env.S3_SECRET_KEY || "",
    s3Region: process.env.S3_REGION || "eu-central-1",
  };
}

// =============================================================================
// TYPES
// =============================================================================

export interface BackupInfo {
  id: string;
  fileName: string;
  filePath: string;
  type: "daily" | "weekly" | "monthly" | "manual";
  sizeBytes: number;
  createdAt: string;
  status: "success" | "failed" | "in_progress";
  category: string; // subdirectory: daily, weekly, monthly
  metadata?: BackupMetadata;
}

interface BackupMetadata {
  fileName: string;
  type: string;
  database: string;
  host: string;
  createdAt: string;
  sizeBytes: number;
  durationSeconds: number;
  pgVersion: string;
}

export interface BackupResult {
  success: boolean;
  backup?: BackupInfo;
  error?: string;
  durationMs?: number;
}

// =============================================================================
// S3 CLIENT (lazy initialization)
// =============================================================================

let s3Client: S3Client | null = null;

function getS3Client(): S3Client | null {
  const config = getBackupConfig();

  if (!config.s3Enabled || !config.s3Endpoint) {
    return null;
  }

  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: config.s3Endpoint,
      region: config.s3Region,
      credentials: {
        accessKeyId: config.s3AccessKey,
        secretAccessKey: config.s3SecretKey,
      },
      forcePathStyle: true,
    });
  }

  return s3Client;
}

// =============================================================================
// LIST BACKUPS
// =============================================================================

/**
 * List all available backup files from the local filesystem.
 * Scans daily/, weekly/, monthly/ subdirectories.
 */
export async function listBackups(): Promise<BackupInfo[]> {
  const config = getBackupConfig();
  const backups: BackupInfo[] = [];

  const categories = ["daily", "weekly", "monthly"] as const;

  for (const category of categories) {
    const dir = path.join(config.backupDir, category);

    try {
      await fs.access(dir);
    } catch {
      // Directory does not exist, skip
      continue;
    }

    try {
      const files = await fs.readdir(dir);
      const dumpFiles = files.filter((f) => f.endsWith(".dump"));

      for (const fileName of dumpFiles) {
        const filePath = path.join(dir, fileName);

        try {
          const stat = await fs.stat(filePath);

          // Determine type from filename
          let type: BackupInfo["type"] = category;
          if (fileName.includes("_manual")) {
            type = "manual";
          }

          // Try to read metadata
          let metadata: BackupMetadata | undefined;
          const metaPath = `${filePath}.meta`;
          try {
            const metaContent = await fs.readFile(metaPath, "utf-8");
            metadata = JSON.parse(metaContent);
          } catch {
            // Metadata file may not exist
          }

          backups.push({
            id: `backup-${Buffer.from(filePath).toString("base64url")}`,
            fileName,
            filePath,
            type,
            sizeBytes: stat.size,
            createdAt: metadata?.createdAt || stat.mtime.toISOString(),
            status: "success",
            category,
            metadata,
          });
        } catch (err) {
          backupLogger.warn({ fileName, err }, "Failed to stat backup file");
        }
      }
    } catch (err) {
      backupLogger.warn({ dir, err }, "Failed to read backup directory");
    }
  }

  // Sort by creation date, newest first
  backups.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return backups;
}

// =============================================================================
// CREATE BACKUP
// =============================================================================

/**
 * Create a database backup using pg_dump.
 * Stores the backup in the appropriate category directory.
 *
 * @param type - Backup category: daily, weekly, monthly, or manual (stored in daily/)
 */
export async function createBackup(
  type: "daily" | "weekly" | "monthly" | "manual" = "manual"
): Promise<BackupResult> {
  const config = getBackupConfig();
  const startTime = Date.now();

  // Determine storage category (manual backups go into daily/)
  const category = type === "manual" ? "daily" : type;
  const targetDir = path.join(config.backupDir, category);

  // Ensure directory exists
  await fs.mkdir(targetDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `wpm_backup_${timestamp}_${type}.dump`;
  const filePath = path.join(targetDir, fileName);

  backupLogger.info(
    { type, fileName, targetDir },
    "[BACKUP] Creating database backup"
  );

  try {
    // Build pg_dump command
    const env = {
      ...process.env,
      PGPASSWORD: config.pgPassword,
    };

    const pgDumpCmd = [
      "pg_dump",
      `-h ${config.pgHost}`,
      `-p ${config.pgPort}`,
      `-U ${config.pgUser}`,
      `-d ${config.pgDatabase}`,
      "-Fc", // Custom format with compression
      "--no-owner",
      "--no-acl",
      `-f "${filePath}"`,
    ].join(" ");

    await execAsync(pgDumpCmd, {
      env,
      timeout: 300000, // 5 minute timeout
    });

    // Verify the file was created and is not empty
    const stat = await fs.stat(filePath);
    if (stat.size === 0) {
      throw new Error("pg_dump produced an empty file");
    }

    const durationMs = Date.now() - startTime;

    // Write metadata file
    const metadata: BackupMetadata = {
      fileName,
      type,
      database: config.pgDatabase,
      host: config.pgHost,
      createdAt: new Date().toISOString(),
      sizeBytes: stat.size,
      durationSeconds: Math.round(durationMs / 1000),
      pgVersion: "pg_dump (PostgreSQL) 16",
    };

    await fs.writeFile(
      `${filePath}.meta`,
      JSON.stringify(metadata, null, 2),
      "utf-8"
    );

    const backup: BackupInfo = {
      id: `backup-${Buffer.from(filePath).toString("base64url")}`,
      fileName,
      filePath,
      type,
      sizeBytes: stat.size,
      createdAt: metadata.createdAt,
      status: "success",
      category,
      metadata,
    };

    // Upload to S3 if enabled
    await uploadToS3(filePath, `${category}/${fileName}`);

    backupLogger.info(
      {
        fileName,
        sizeBytes: stat.size,
        durationMs,
      },
      "[BACKUP] Backup created successfully"
    );

    return {
      success: true,
      backup,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    backupLogger.error(
      { err: error, fileName, durationMs },
      "[BACKUP] Failed to create backup"
    );

    // Clean up partial file
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore cleanup errors
    }

    return {
      success: false,
      error: errorMessage,
      durationMs,
    };
  }
}

// =============================================================================
// DELETE BACKUP
// =============================================================================

/**
 * Delete a backup file by its ID (base64-encoded path).
 */
export async function deleteBackup(backupId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Decode the file path from the ID
    const filePath = Buffer.from(
      backupId.replace("backup-", ""),
      "base64url"
    ).toString("utf-8");

    // Security check: ensure the path is within the backup directory
    const config = getBackupConfig();
    const resolvedPath = path.resolve(filePath);
    const resolvedBackupDir = path.resolve(config.backupDir);

    if (!resolvedPath.startsWith(resolvedBackupDir)) {
      backupLogger.warn(
        { filePath, backupDir: config.backupDir },
        "[BACKUP] Attempted path traversal in backup delete"
      );
      return { success: false, error: "Ungueltiger Backup-Pfad" };
    }

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return { success: false, error: "Backup-Datei nicht gefunden" };
    }

    const fileName = path.basename(filePath);
    const category = path.basename(path.dirname(filePath));

    // Delete the backup file
    await fs.unlink(filePath);

    // Delete metadata file if it exists
    try {
      await fs.unlink(`${filePath}.meta`);
    } catch {
      // Metadata file may not exist
    }

    // Also delete from S3 if enabled
    await deleteFromS3(`${category}/${fileName}`);

    backupLogger.info({ fileName }, "[BACKUP] Backup deleted");

    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    backupLogger.error({ err: error }, "[BACKUP] Failed to delete backup");
    return { success: false, error: errorMessage };
  }
}

// =============================================================================
// S3 OPERATIONS
// =============================================================================

/**
 * Upload a backup file to S3/MinIO.
 */
async function uploadToS3(localPath: string, s3Key: string): Promise<void> {
  const client = getS3Client();
  if (!client) return;

  const config = getBackupConfig();

  try {
    const fileContent = await fs.readFile(localPath);

    await client.send(
      new PutObjectCommand({
        Bucket: config.s3Bucket,
        Key: s3Key,
        Body: fileContent,
        ContentType: "application/octet-stream",
        Metadata: {
          "backup-type": path.basename(path.dirname(s3Key)),
          "created-at": new Date().toISOString(),
        },
      })
    );

    // Also upload metadata if it exists
    try {
      const metaContent = await fs.readFile(`${localPath}.meta`);
      await client.send(
        new PutObjectCommand({
          Bucket: config.s3Bucket,
          Key: `${s3Key}.meta`,
          Body: metaContent,
          ContentType: "application/json",
        })
      );
    } catch {
      // Metadata file may not exist
    }

    backupLogger.info(
      { s3Key, bucket: config.s3Bucket },
      "[BACKUP] Uploaded to S3"
    );
  } catch (error) {
    backupLogger.error(
      { err: error, s3Key },
      "[BACKUP] Failed to upload to S3"
    );
    // Non-fatal: local backup still exists
  }
}

/**
 * Delete a backup from S3/MinIO.
 */
async function deleteFromS3(s3Key: string): Promise<void> {
  const client = getS3Client();
  if (!client) return;

  const config = getBackupConfig();

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: config.s3Bucket,
        Key: s3Key,
      })
    );

    // Also delete metadata
    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.s3Bucket,
          Key: `${s3Key}.meta`,
        })
      );
    } catch {
      // Ignore
    }

    backupLogger.info(
      { s3Key, bucket: config.s3Bucket },
      "[BACKUP] Deleted from S3"
    );
  } catch (error) {
    backupLogger.error(
      { err: error, s3Key },
      "[BACKUP] Failed to delete from S3"
    );
  }
}

/**
 * List backup files stored in S3/MinIO.
 */
export async function listS3Backups(): Promise<
  Array<{ key: string; size: number; lastModified: string }>
> {
  const client = getS3Client();
  if (!client) return [];

  const config = getBackupConfig();

  try {
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: config.s3Bucket,
        Prefix: "",
      })
    );

    return (result.Contents || [])
      .filter((obj) => obj.Key?.endsWith(".dump"))
      .map((obj) => ({
        key: obj.Key || "",
        size: obj.Size || 0,
        lastModified: obj.LastModified?.toISOString() || "",
      }));
  } catch (error) {
    backupLogger.error({ err: error }, "[BACKUP] Failed to list S3 backups");
    return [];
  }
}

/**
 * Download a backup from S3/MinIO to the local filesystem.
 */
export async function downloadFromS3(
  s3Key: string
): Promise<{ success: boolean; localPath?: string; error?: string }> {
  const client = getS3Client();
  if (!client) {
    return { success: false, error: "S3 is not configured" };
  }

  const config = getBackupConfig();
  const localPath = path.join(config.backupDir, "s3_download", path.basename(s3Key));

  try {
    // Ensure download directory exists
    await fs.mkdir(path.dirname(localPath), { recursive: true });

    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.s3Bucket,
        Key: s3Key,
      })
    );

    if (!response.Body) {
      return { success: false, error: "Empty response from S3" };
    }

    // Stream response body to file
    const chunks: Uint8Array[] = [];
    const stream = response.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    await fs.writeFile(localPath, Buffer.concat(chunks));

    backupLogger.info(
      { s3Key, localPath },
      "[BACKUP] Downloaded from S3"
    );

    return { success: true, localPath };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    backupLogger.error({ err: error, s3Key }, "[BACKUP] Failed to download from S3");
    return { success: false, error: errorMessage };
  }
}

// =============================================================================
// RETENTION
// =============================================================================

/**
 * Apply the retention policy to local backups.
 * Keeps only the configured number of backups per category.
 */
export async function applyRetention(): Promise<{
  deleted: string[];
  kept: Record<string, number>;
}> {
  const config = getBackupConfig();
  const deleted: string[] = [];
  const kept: Record<string, number> = {};

  const retentionMap: Record<string, number> = {
    daily: config.retentionDaily,
    weekly: config.retentionWeekly,
    monthly: config.retentionMonthly,
  };

  for (const [category, maxKeep] of Object.entries(retentionMap)) {
    const dir = path.join(config.backupDir, category);

    try {
      await fs.access(dir);
    } catch {
      kept[category] = 0;
      continue;
    }

    try {
      const files = await fs.readdir(dir);
      const dumpFiles = files.filter((f) => f.endsWith(".dump"));

      // Get file stats for sorting
      const fileStats = await Promise.all(
        dumpFiles.map(async (f) => {
          const filePath = path.join(dir, f);
          const stat = await fs.stat(filePath);
          return { fileName: f, filePath, mtime: stat.mtime.getTime() };
        })
      );

      // Sort by modification time, newest first
      fileStats.sort((a, b) => b.mtime - a.mtime);

      kept[category] = Math.min(fileStats.length, maxKeep);

      // Delete files beyond the retention limit
      const toDelete = fileStats.slice(maxKeep);

      for (const file of toDelete) {
        try {
          await fs.unlink(file.filePath);
          deleted.push(file.fileName);

          // Delete metadata file
          try {
            await fs.unlink(`${file.filePath}.meta`);
          } catch {
            // Ignore
          }

          // Delete from S3
          await deleteFromS3(`${category}/${file.fileName}`);

          backupLogger.info(
            { fileName: file.fileName, category },
            "[BACKUP] Retention: deleted old backup"
          );
        } catch (err) {
          backupLogger.warn(
            { fileName: file.fileName, err },
            "[BACKUP] Retention: failed to delete"
          );
        }
      }
    } catch (err) {
      backupLogger.error({ dir, err }, "[BACKUP] Retention: failed to process directory");
      kept[category] = 0;
    }
  }

  return { deleted, kept };
}

// =============================================================================
// UTILITY
// =============================================================================

/**
 * Get backup configuration summary (for admin display, no secrets).
 */
export function getBackupConfigSummary() {
  const config = getBackupConfig();

  return {
    backupDir: config.backupDir,
    retentionDaily: config.retentionDaily,
    retentionWeekly: config.retentionWeekly,
    retentionMonthly: config.retentionMonthly,
    s3Enabled: config.s3Enabled,
    s3Bucket: config.s3Enabled ? config.s3Bucket : undefined,
    s3Endpoint: config.s3Enabled ? config.s3Endpoint : undefined,
    pgHost: config.pgHost,
    pgDatabase: config.pgDatabase,
  };
}

/**
 * Check if pg_dump is available in the environment.
 */
export async function checkPgDumpAvailable(): Promise<boolean> {
  try {
    await execAsync("pg_dump --version");
    return true;
  } catch {
    return false;
  }
}
