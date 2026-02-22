/**
 * Generic Export API Route
 *
 * Exports data as Excel (XLSX) or CSV files.
 *
 * Supported types: shareholders, parks, turbines, invoices, contracts, persons, funds, leases, plots
 *
 * Query Parameters:
 * - format: 'xlsx' | 'csv' (default: 'xlsx')
 * - fundId: Filter by fund ID (optional)
 * - parkId: Filter by park ID (optional)
 * - status: Filter by status (optional)
 * - startDate: Filter from date (optional, for invoices)
 * - endDate: Filter until date (optional, for invoices)
 *
 * Examples:
 * - GET /api/export/shareholders?format=xlsx&fundId=123
 * - GET /api/export/invoices?format=csv&parkId=456
 * - GET /api/export/parks?format=xlsx
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/withPermission';
import { prisma } from '@/lib/prisma';
import { generateExcel } from '@/lib/export/excel';
import { generateCsvBuffer } from '@/lib/export/csv';
import { getColumnsForType, getEntityDisplayName } from '@/lib/export/columns';
import type { ExportEntityType, ExportFormat } from '@/lib/export/types';
import { apiLogger as logger } from "@/lib/logger";

/**
 * Supported export types
 */
const SUPPORTED_TYPES: ExportEntityType[] = [
  'shareholders',
  'parks',
  'turbines',
  'invoices',
  'contracts',
  'persons',
  'funds',
  'leases',
  'plots',
];

/**
 * Map export type to the required export permission.
 * Each export type requires the corresponding module's :export permission.
 */
const EXPORT_PERMISSION_MAP: Record<string, string> = {
  shareholders: 'shareholders:export',
  parks: 'parks:export',
  turbines: 'turbines:export',
  invoices: 'invoices:export',
  contracts: 'contracts:export',
  persons: 'shareholders:export', // persons are managed under shareholders module
  funds: 'funds:export',
  leases: 'leases:export',
  plots: 'plots:export',
};

/**
 * Build a filename for the export
 */
function buildFilename(type: string, format: ExportFormat): string {
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const displayName = getEntityDisplayName(type).replace(/\s+/g, '_');
  return `${displayName}_Export_${timestamp}.${format}`;
}

/**
 * Get MIME type for export format
 */
function getMimeType(format: ExportFormat): string {
  switch (format) {
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'csv':
      return 'text/csv; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Fetch data based on entity type and filters
 */
async function fetchData(
  type: ExportEntityType,
  tenantId: string,
  filters: {
    fundId?: string;
    parkId?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<Record<string, unknown>[]> {
  const { fundId, parkId, status, startDate, endDate } = filters;

  switch (type) {
    case 'shareholders':
      return prisma.shareholder.findMany({
        where: {
          fund: { tenantId },
          ...(fundId && { fundId }),
          ...(status && { status: status as 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' }),
        },
        include: {
          person: true,
          fund: { select: { id: true, name: true } },
        },
        orderBy: [{ status: 'asc' }, { ownershipPercentage: 'desc' }],
      });

    case 'parks':
      return prisma.park.findMany({
        where: {
          tenantId,
          ...(status && { status: status as 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' }),
        },
        include: {
          _count: { select: { turbines: true } },
        },
        orderBy: { name: 'asc' },
      });

    case 'turbines':
      return prisma.turbine.findMany({
        where: {
          park: { tenantId },
          ...(parkId && { parkId }),
          ...(status && { status: status as 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' }),
        },
        include: {
          park: { select: { id: true, name: true } },
        },
        orderBy: [{ park: { name: 'asc' } }, { designation: 'asc' }],
      });

    case 'invoices':
      return prisma.invoice.findMany({
        where: {
          tenantId,
          ...(fundId && { fundId }),
          ...(parkId && { parkId }),
          ...(status && { status: status as 'DRAFT' | 'SENT' | 'PAID' | 'CANCELLED' }),
          ...(startDate && { invoiceDate: { gte: startDate } }),
          ...(endDate && { invoiceDate: { lte: endDate } }),
        },
        include: {
          fund: { select: { id: true, name: true } },
          park: { select: { id: true, name: true } },
        },
        orderBy: { invoiceDate: 'desc' },
      });

    case 'contracts':
      return prisma.contract.findMany({
        where: {
          tenantId,
          ...(fundId && { fundId }),
          ...(parkId && { parkId }),
          ...(status && { status: status as 'DRAFT' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'TERMINATED' }),
        },
        include: {
          partner: true,
          park: { select: { id: true, name: true } },
          fund: { select: { id: true, name: true } },
        },
        orderBy: [{ status: 'asc' }, { endDate: 'asc' }],
      });

    case 'persons':
      return prisma.person.findMany({
        where: {
          tenantId,
          ...(status && { status: status as 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' }),
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });

    case 'funds':
      return prisma.fund.findMany({
        where: {
          tenantId,
          ...(status && { status: status as 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' }),
        },
        include: {
          _count: {
            select: { shareholders: true, fundParks: true },
          },
        },
        orderBy: { name: 'asc' },
      });

    case 'leases':
      return prisma.lease.findMany({
        where: {
          tenantId,
          ...(status && { status: status as 'DRAFT' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'TERMINATED' }),
        },
        include: {
          lessor: true,
          leasePlots: {
            include: { plot: true },
          },
        },
        orderBy: [{ status: 'asc' }, { endDate: 'asc' }],
      });

    case 'plots':
      return prisma.plot.findMany({
        where: {
          tenantId,
          ...(parkId && { parkId }),
          ...(status && { status: status as 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' }),
        },
        include: {
          park: { select: { id: true, name: true } },
        },
        orderBy: [
          { cadastralDistrict: 'asc' },
          { fieldNumber: 'asc' },
          { plotNumber: 'asc' },
        ],
      });

    default:
      throw new Error(`Unsupported export type: ${type}`);
  }
}

/**
 * GET /api/export/[type]
 *
 * Export data as Excel or CSV file.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    // Resolve params (Next.js 15+ async params)
    const resolvedParams = await params;
    const type = resolvedParams.type as ExportEntityType;

    // Validate export type
    if (!SUPPORTED_TYPES.includes(type)) {
      return NextResponse.json(
        {
          error: `Ungueltiger Export-Typ: ${type}`,
          supportedTypes: SUPPORTED_TYPES,
        },
        { status: 400 }
      );
    }

    // Check permission for this specific export type
    const requiredPermission = EXPORT_PERMISSION_MAP[type];
    if (!requiredPermission) {
      return NextResponse.json(
        { error: `Keine Berechtigung fuer Export-Typ: ${type}` },
        { status: 403 }
      );
    }

    const check = await requirePermission(requiredPermission);
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') || 'xlsx') as ExportFormat;
    const fundId = searchParams.get('fundId') || undefined;
    const parkId = searchParams.get('parkId') || undefined;
    const status = searchParams.get('status') || undefined;
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');

    // Validate format
    if (!['xlsx', 'csv'].includes(format)) {
      return NextResponse.json(
        { error: `Ungueltiges Format: ${format}. Unterstuetzte Formate: xlsx, csv` },
        { status: 400 }
      );
    }

    // Parse dates
    const startDate = startDateStr ? new Date(startDateStr) : undefined;
    const endDate = endDateStr ? new Date(endDateStr) : undefined;

    // Fetch data from database
    const data = await fetchData(type, check.tenantId, {
      fundId,
      parkId,
      status,
      startDate,
      endDate,
    });

    // Check if any data was found
    if (data.length === 0) {
      return NextResponse.json(
        { error: 'Keine Daten gefunden' },
        { status: 404 }
      );
    }

    // Get column definitions for this type
    const columns = getColumnsForType(type);

    // Generate export file
    let fileBuffer: Buffer;
    const sheetName = getEntityDisplayName(type);

    if (format === 'xlsx') {
      fileBuffer = generateExcel(data, columns, sheetName);
    } else {
      fileBuffer = generateCsvBuffer(data, columns);
    }

    // Build response with file download
    const filename = buildFilename(type, format);
    const mimeType = getMimeType(format);

    // Log export in audit log
    try {
      await prisma.auditLog.create({
        data: {
          action: 'EXPORT',
          entityType: type,
          userId: check.userId,
          tenantId: check.tenantId,
          newValues: {
            format,
            rowCount: data.length,
            filters: { fundId, parkId, status, startDate, endDate },
          },
        },
      });
    } catch (auditError) {
      // Don't fail the export if audit logging fails
      logger.error({ err: auditError }, 'Audit log error');
    }

    // Return file as download
    // Convert Buffer to Uint8Array for NextResponse compatibility
    const responseBody = new Uint8Array(fileBuffer);
    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(responseBody.length),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Export-Row-Count': String(data.length),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Export error');

    if (error instanceof Error) {
      return NextResponse.json(
        { error: `Export fehlgeschlagen: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Export fehlgeschlagen' },
      { status: 500 }
    );
  }
}
