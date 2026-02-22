/**
 * Auto-Import Service for SCADA Data
 *
 * Provides automated, incremental SCADA data import functionality.
 * Checks for new files based on the last import timestamp and triggers
 * the existing startImport() pipeline for each location with new data.
 *
 * Key functions:
 * - checkForNewFiles(): Scans enabled locations for unimported files
 * - runAutoImport(): Executes a full auto-import cycle for a tenant
 * - getLastImportDate(): Queries the most recent measurement timestamp per location
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { prisma } from '@/lib/prisma';
import { startImport, scanAllFileTypes } from './import-service';
import type { ScadaFileType } from './import-service';
import { logger } from '@/lib/logger';

const autoImportLogger = logger.child({ module: 'scada-auto-import' });

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

/** Summary of new files found at a single location */
export interface LocationNewFiles {
  locationCode: string;
  basePath: string;
  fileTypes: Array<{
    fileType: ScadaFileType;
    newFileCount: number;
  }>;
  totalNewFiles: number;
}

/** Result of a complete auto-import run */
export interface AutoImportResult {
  locationsChecked: number;
  newFilesFound: number;
  imported: number;
  skipped: number;
  errors: string[];
  locationResults: Array<{
    locationCode: string;
    fileTypesProcessed: string[];
    filesImported: number;
    status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
  }>;
}

/** Auto-import status for a single mapping/location */
export interface AutoImportStatus {
  mappingId: string;
  locationCode: string;
  autoImportEnabled: boolean;
  autoImportInterval: string;
  autoImportPath: string | null;
  lastAutoImport: Date | null;
  lastDataTimestamp: Date | null;
  parkName: string;
}

// Default base path for SCADA data on this system
const DEFAULT_BASE_PATH = 'C:\\Enercon';

// File types to import during auto-import (prioritized order)
const AUTO_IMPORT_FILE_TYPES: ScadaFileType[] = [
  'WSD', 'UID', 'AVR', 'AVW', 'AVM', 'AVY', 'PES', 'PEW', 'PET', 'SSM', 'SWM',
  'WSR', 'WSW', 'WSM', 'WSY',
];

// ---------------------------------------------------------------
// Helper: Check directory accessibility
// ---------------------------------------------------------------

async function isDirectoryAccessible(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------
// getLastImportDate
// ---------------------------------------------------------------

/**
 * Get the most recent import date for a given tenant and location.
 * Queries ScadaImportLog for the last successful/partial import
 * with a lastProcessedDate for any file type at this location.
 *
 * @param tenantId - Tenant ID
 * @param locationCode - Enercon location code (e.g., "Loc_5842")
 * @returns The last processed date, or null if no imports exist
 */
export async function getLastImportDate(
  tenantId: string,
  locationCode: string,
): Promise<Date | null> {
  const lastLog = await prisma.scadaImportLog.findFirst({
    where: {
      tenantId,
      locationCode,
      status: { in: ['SUCCESS', 'PARTIAL'] },
      lastProcessedDate: { not: null },
    },
    orderBy: { lastProcessedDate: 'desc' },
    select: { lastProcessedDate: true },
  });

  return lastLog?.lastProcessedDate ?? null;
}

// ---------------------------------------------------------------
// checkForNewFiles
// ---------------------------------------------------------------

/**
 * Check for new (unimported) files across all enabled auto-import locations
 * for a given tenant.
 *
 * For each location:
 * 1. Looks up the base path (from mapping or default)
 * 2. Scans for all available file types
 * 3. Compares file dates against the last import timestamp
 * 4. Returns a summary of new files found
 *
 * @param tenantId - Tenant ID to check
 * @returns Array of locations with new files
 */
export async function checkForNewFiles(
  tenantId: string,
): Promise<LocationNewFiles[]> {
  // Get all unique location codes with auto-import enabled
  const enabledMappings = await prisma.scadaTurbineMapping.findMany({
    where: {
      tenantId,
      autoImportEnabled: true,
      status: 'ACTIVE',
    },
    select: {
      locationCode: true,
      autoImportPath: true,
    },
    distinct: ['locationCode'],
  });

  if (enabledMappings.length === 0) {
    autoImportLogger.info({ tenantId }, 'No auto-import enabled mappings found');
    return [];
  }

  const results: LocationNewFiles[] = [];

  for (const mapping of enabledMappings) {
    const basePath = mapping.autoImportPath || DEFAULT_BASE_PATH;
    const locationPath = path.join(basePath, mapping.locationCode);

    // Check if directory is accessible
    if (!(await isDirectoryAccessible(locationPath))) {
      autoImportLogger.warn(
        { locationCode: mapping.locationCode, locationPath },
        'Location directory not accessible, skipping',
      );
      continue;
    }

    // Get last import date for this location
    const lastImportDate = await getLastImportDate(tenantId, mapping.locationCode);

    try {
      // Scan available file types at this location
      const scanResults = await scanAllFileTypes(basePath, mapping.locationCode);

      const newFileTypes: LocationNewFiles['fileTypes'] = [];
      let totalNew = 0;

      for (const scan of scanResults) {
        // Only process file types we support in auto-import
        if (!AUTO_IMPORT_FILE_TYPES.includes(scan.fileType)) continue;

        // If no previous import, all files are "new"
        if (!lastImportDate) {
          newFileTypes.push({
            fileType: scan.fileType,
            newFileCount: scan.fileCount,
          });
          totalNew += scan.fileCount;
        } else {
          // We approximate: the scan result gives us a total file count.
          // The actual incremental filtering happens in startImport() which
          // already skips files based on lastProcessedDate. So we report
          // the total count here as an upper bound.
          // The actual import will be incremental regardless.
          newFileTypes.push({
            fileType: scan.fileType,
            newFileCount: scan.fileCount,
          });
          totalNew += scan.fileCount;
        }
      }

      if (newFileTypes.length > 0) {
        results.push({
          locationCode: mapping.locationCode,
          basePath,
          fileTypes: newFileTypes,
          totalNewFiles: totalNew,
        });
      }
    } catch (err) {
      autoImportLogger.error(
        { locationCode: mapping.locationCode, err },
        'Error scanning location for new files',
      );
    }
  }

  return results;
}

// ---------------------------------------------------------------
// runAutoImport
// ---------------------------------------------------------------

/**
 * Runs a full auto-import cycle for a tenant.
 *
 * 1. Calls checkForNewFiles() to discover locations with data
 * 2. For each location, triggers startImport() for each file type
 * 3. Logs results in ScadaAutoImportLog
 * 4. Updates lastAutoImport on the mappings
 *
 * The actual import is incremental because startImport() already
 * compares file dates against the last successful import log.
 *
 * @param tenantId - Tenant ID to import for
 * @returns Summary of the auto-import run
 */
export async function runAutoImport(
  tenantId: string,
): Promise<AutoImportResult> {
  const startTime = new Date();

  // Create auto-import log entry
  const logEntry = await prisma.scadaAutoImportLog.create({
    data: {
      tenantId,
      status: 'RUNNING',
    },
  });

  autoImportLogger.info({ tenantId, logId: logEntry.id }, 'Starting auto-import cycle');

  const result: AutoImportResult = {
    locationsChecked: 0,
    newFilesFound: 0,
    imported: 0,
    skipped: 0,
    errors: [],
    locationResults: [],
  };

  try {
    // Step 1: Check for new files
    const newFiles = await checkForNewFiles(tenantId);
    result.locationsChecked = newFiles.length;
    result.newFilesFound = newFiles.reduce((sum, loc) => sum + loc.totalNewFiles, 0);

    if (newFiles.length === 0) {
      autoImportLogger.info({ tenantId }, 'No locations with new files found');

      await prisma.scadaAutoImportLog.update({
        where: { id: logEntry.id },
        data: {
          status: 'SUCCESS',
          completedAt: new Date(),
          filesFound: 0,
          filesImported: 0,
          filesSkipped: 0,
          summary: 'Keine neuen Dateien gefunden',
        },
      });

      return result;
    }

    // Update log with files found
    await prisma.scadaAutoImportLog.update({
      where: { id: logEntry.id },
      data: {
        filesFound: result.newFilesFound,
      },
    });

    // Step 2: Import each location
    for (const location of newFiles) {
      const locationResult = {
        locationCode: location.locationCode,
        fileTypesProcessed: [] as string[],
        filesImported: 0,
        status: 'SUCCESS' as 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED',
      };

      let locationErrors = 0;
      let locationImported = 0;

      for (const fileTypeInfo of location.fileTypes) {
        const { fileType } = fileTypeInfo;

        try {
          // Check if there is already a running import for this location+fileType
          const runningImport = await prisma.scadaImportLog.findFirst({
            where: {
              tenantId,
              locationCode: location.locationCode,
              fileType,
              status: 'RUNNING',
            },
          });

          if (runningImport) {
            autoImportLogger.info(
              { locationCode: location.locationCode, fileType },
              'Import already running, skipping file type',
            );
            continue;
          }

          // Create import log entry
          const importLog = await prisma.scadaImportLog.create({
            data: {
              tenantId,
              locationCode: location.locationCode,
              fileType,
              status: 'RUNNING',
            },
          });

          autoImportLogger.info(
            { locationCode: location.locationCode, fileType, importLogId: importLog.id },
            'Starting auto-import for file type',
          );

          // Run the import (synchronously - auto-import runs in a worker)
          const importResult = await startImport({
            tenantId,
            locationCode: location.locationCode,
            fileType: fileType as ScadaFileType,
            basePath: location.basePath,
            importLogId: importLog.id,
          });

          locationResult.fileTypesProcessed.push(fileType);
          locationImported += importResult.recordsImported;
          result.imported += importResult.recordsImported;
          result.skipped += importResult.recordsSkipped;

          if (importResult.status === 'FAILED') {
            locationErrors++;
            result.errors.push(
              ...importResult.errors.map(
                (e) => `${location.locationCode}/${fileType}: ${e}`,
              ),
            );
          } else if (importResult.status === 'PARTIAL') {
            result.errors.push(
              ...importResult.errors.map(
                (e) => `${location.locationCode}/${fileType}: ${e}`,
              ),
            );
          }
        } catch (err) {
          locationErrors++;
          const errorMsg = err instanceof Error ? err.message : String(err);
          result.errors.push(
            `${location.locationCode}/${fileType}: ${errorMsg}`,
          );
          autoImportLogger.error(
            { locationCode: location.locationCode, fileType, err },
            'Auto-import failed for file type',
          );
        }
      }

      locationResult.filesImported = locationImported;

      if (locationErrors > 0 && locationImported > 0) {
        locationResult.status = 'PARTIAL';
      } else if (locationErrors > 0) {
        locationResult.status = 'FAILED';
      } else if (locationResult.fileTypesProcessed.length === 0) {
        locationResult.status = 'SKIPPED';
      }

      result.locationResults.push(locationResult);

      // Update lastAutoImport on all mappings for this location
      await prisma.scadaTurbineMapping.updateMany({
        where: {
          tenantId,
          locationCode: location.locationCode,
          autoImportEnabled: true,
        },
        data: {
          lastAutoImport: new Date(),
        },
      });
    }

    // Step 3: Determine overall status and finalize log
    const hasErrors = result.errors.length > 0;
    const hasImports = result.imported > 0;
    const overallStatus = !hasErrors
      ? 'SUCCESS'
      : hasImports
        ? 'PARTIAL'
        : 'FAILED';

    const duration = Date.now() - startTime.getTime();
    const summary =
      `${result.locationsChecked} Standort(e) geprueft, ` +
      `${result.imported} Datensaetze importiert, ` +
      `${result.skipped} uebersprungen` +
      (hasErrors ? `, ${result.errors.length} Fehler` : '') +
      ` (${Math.round(duration / 1000)}s)`;

    await prisma.scadaAutoImportLog.update({
      where: { id: logEntry.id },
      data: {
        status: overallStatus,
        completedAt: new Date(),
        filesFound: result.newFilesFound,
        filesImported: result.imported,
        filesSkipped: result.skipped,
        errors: hasErrors ? result.errors : undefined,
        summary,
      },
    });

    autoImportLogger.info(
      { tenantId, logId: logEntry.id, summary },
      'Auto-import cycle completed',
    );

    return result;
  } catch (err) {
    // Top-level error
    const errorMsg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Kritischer Fehler: ${errorMsg}`);

    await prisma.scadaAutoImportLog.update({
      where: { id: logEntry.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        filesFound: result.newFilesFound,
        filesImported: result.imported,
        filesSkipped: result.skipped,
        errors: result.errors,
        summary: `Fehler: ${errorMsg}`,
      },
    });

    autoImportLogger.error(
      { tenantId, logId: logEntry.id, err },
      'Auto-import cycle failed with critical error',
    );

    return result;
  }
}

// ---------------------------------------------------------------
// getAutoImportStatus
// ---------------------------------------------------------------

/**
 * Returns the auto-import configuration and status for all mappings
 * of a given tenant. Groups by locationCode so each location appears once.
 *
 * @param tenantId - Tenant ID
 * @returns Array of auto-import status objects
 */
export async function getAutoImportStatus(
  tenantId: string,
): Promise<AutoImportStatus[]> {
  const mappings = await prisma.scadaTurbineMapping.findMany({
    where: {
      tenantId,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      locationCode: true,
      autoImportEnabled: true,
      autoImportInterval: true,
      autoImportPath: true,
      lastAutoImport: true,
      park: { select: { name: true } },
    },
    distinct: ['locationCode'],
    orderBy: { locationCode: 'asc' },
  });

  // For each location, also get the last data timestamp
  const results: AutoImportStatus[] = [];

  for (const mapping of mappings) {
    const lastDataDate = await getLastImportDate(tenantId, mapping.locationCode);

    results.push({
      mappingId: mapping.id,
      locationCode: mapping.locationCode,
      autoImportEnabled: mapping.autoImportEnabled,
      autoImportInterval: mapping.autoImportInterval,
      autoImportPath: mapping.autoImportPath,
      lastAutoImport: mapping.lastAutoImport,
      lastDataTimestamp: lastDataDate,
      parkName: mapping.park.name,
    });
  }

  return results;
}

// ---------------------------------------------------------------
// toggleAutoImport
// ---------------------------------------------------------------

/**
 * Enable or disable auto-import for all mappings at a given location.
 *
 * @param tenantId - Tenant ID
 * @param locationCode - Location code to toggle
 * @param enabled - Whether to enable or disable
 * @param interval - Optional: auto-import interval (DAILY, HOURLY, WEEKLY)
 * @param autoImportPath - Optional: override base path
 * @returns Number of mappings updated
 */
export async function toggleAutoImport(
  tenantId: string,
  locationCode: string,
  enabled: boolean,
  interval?: string,
  autoImportPath?: string | null,
): Promise<number> {
  const updateData: Record<string, unknown> = {
    autoImportEnabled: enabled,
  };

  if (interval && ['DAILY', 'HOURLY', 'WEEKLY'].includes(interval)) {
    updateData.autoImportInterval = interval;
  }

  if (autoImportPath !== undefined) {
    updateData.autoImportPath = autoImportPath;
  }

  const result = await prisma.scadaTurbineMapping.updateMany({
    where: {
      tenantId,
      locationCode,
      status: 'ACTIVE',
    },
    data: updateData,
  });

  autoImportLogger.info(
    { tenantId, locationCode, enabled, interval, updatedCount: result.count },
    `Auto-import ${enabled ? 'enabled' : 'disabled'} for location`,
  );

  return result.count;
}
