/**
 * Meilisearch Indexer
 * Indexes entities into Meilisearch for full-text search.
 *
 * Field notes (verified against prisma/schema.prisma):
 * - Park: uses `city` (no `municipality` field exists)
 * - AuditLog: no `description` field — action + entityType are indexed
 * - Invoice: `recipientName` is a direct scalar field on the model
 * - Turbine: has `model` and `manufacturer` fields
 */
import { prisma } from "@/lib/prisma";
import { getMeilisearchClient, INDICES } from "./client";
import { logger } from "@/lib/logger";
import type { MeiliDocument, MeiliInvoice, MeiliPark, MeiliTurbine, MeiliAuditLog } from "./types";

// =============================================================================
// Index Setup
// =============================================================================

export async function ensureIndices(): Promise<void> {
  const client = getMeilisearchClient();
  if (!client) return;

  // Documents index
  await client.index(INDICES.DOCUMENTS).updateSettings({
    searchableAttributes: ["title", "description", "fileName", "tags", "category", "parkName", "fundName"],
    filterableAttributes: ["tenantId", "category", "parkName"],
    sortableAttributes: ["createdAt"],
  });

  // Invoices index
  await client.index(INDICES.INVOICES).updateSettings({
    searchableAttributes: ["invoiceNumber", "recipientName", "status", "invoiceType"],
    filterableAttributes: ["tenantId", "status", "invoiceType"],
    sortableAttributes: ["invoiceDate"],
  });

  // Parks index
  await client.index(INDICES.PARKS).updateSettings({
    searchableAttributes: ["name", "shortName", "city", "description"],
    filterableAttributes: ["tenantId"],
  });

  // Turbines index
  await client.index(INDICES.TURBINES).updateSettings({
    searchableAttributes: ["designation", "model", "manufacturer", "parkName"],
    filterableAttributes: ["tenantId"],
  });

  // Audit logs index
  await client.index(INDICES.AUDIT_LOGS).updateSettings({
    searchableAttributes: ["action", "entityType", "userName"],
    filterableAttributes: ["tenantId"],
    sortableAttributes: ["createdAt"],
  });

  logger.info("[Meilisearch] Indices configured");
}

// =============================================================================
// Single Entity Indexing
// =============================================================================

export async function indexDocument(documentId: string, tenantId: string): Promise<void> {
  const client = getMeilisearchClient();
  if (!client) return;

  const doc = await prisma.document.findFirst({
    where: { id: documentId, tenantId },
    select: {
      id: true, title: true, description: true, fileName: true,
      tags: true, category: true, createdAt: true,
      park: { select: { name: true } },
      fund: { select: { name: true } },
    },
  });
  if (!doc) return;

  const record: MeiliDocument = {
    id: doc.id,
    title: doc.title,
    description: doc.description ?? undefined,
    fileName: doc.fileName,
    tags: doc.tags,
    category: doc.category,
    parkName: doc.park?.name,
    fundName: doc.fund?.name,
    tenantId,
    createdAt: doc.createdAt.toISOString(),
  };

  await client.index(INDICES.DOCUMENTS).addDocuments([record]);
}

export async function indexInvoice(invoiceId: string, tenantId: string): Promise<void> {
  const client = getMeilisearchClient();
  if (!client) return;

  const inv = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId },
    select: {
      id: true, invoiceNumber: true, recipientName: true, status: true,
      invoiceType: true, grossAmount: true, invoiceDate: true,
    },
  });
  if (!inv) return;

  const record: MeiliInvoice = {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber ?? undefined,
    recipientName: inv.recipientName ?? undefined,
    grossAmount: inv.grossAmount ? Number(inv.grossAmount) : undefined,
    status: inv.status,
    invoiceType: inv.invoiceType,
    tenantId,
    invoiceDate: inv.invoiceDate?.toISOString(),
  };

  await client.index(INDICES.INVOICES).addDocuments([record]);
}

export async function indexPark(parkId: string, tenantId: string): Promise<void> {
  const client = getMeilisearchClient();
  if (!client) return;

  const park = await prisma.park.findFirst({
    where: { id: parkId, tenantId },
    select: { id: true, name: true, shortName: true, city: true, description: true },
  });
  if (!park) return;

  const record: MeiliPark = {
    id: park.id,
    name: park.name,
    shortName: park.shortName ?? undefined,
    city: park.city ?? undefined,
    description: park.description ?? undefined,
    tenantId,
  };

  await client.index(INDICES.PARKS).addDocuments([record]);
}

export async function indexTurbine(turbineId: string, tenantId: string): Promise<void> {
  const client = getMeilisearchClient();
  if (!client) return;

  const turbine = await prisma.turbine.findFirst({
    where: { id: turbineId },
    select: {
      id: true, designation: true, model: true, manufacturer: true,
      park: { select: { name: true, tenantId: true } },
    },
  });
  // Verify it belongs to the correct tenant via park relation
  if (!turbine || turbine.park?.tenantId !== tenantId) return;

  const record: MeiliTurbine = {
    id: turbine.id,
    designation: turbine.designation,
    model: turbine.model ?? undefined,
    manufacturer: turbine.manufacturer ?? undefined,
    parkName: turbine.park?.name,
    tenantId,
  };

  await client.index(INDICES.TURBINES).addDocuments([record]);
}

export async function indexAuditLog(auditLogId: string, tenantId: string): Promise<void> {
  const client = getMeilisearchClient();
  if (!client) return;

  const log = await prisma.auditLog.findFirst({
    where: { id: auditLogId, tenantId },
    select: {
      id: true, action: true, entityType: true, createdAt: true,
      user: { select: { firstName: true, lastName: true } },
    },
  });
  if (!log) return;

  const userName = [log.user?.firstName, log.user?.lastName].filter(Boolean).join(" ") || undefined;

  const record: MeiliAuditLog = {
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    userName,
    tenantId,
    createdAt: log.createdAt.toISOString(),
  };

  await client.index(INDICES.AUDIT_LOGS).addDocuments([record]);
}

export async function removeFromIndex(indexName: string, id: string): Promise<void> {
  const client = getMeilisearchClient();
  if (!client) return;
  await client.index(indexName).deleteDocument(id);
}

// =============================================================================
// Bulk Re-Index
// =============================================================================

export async function reindexAll(tenantId: string): Promise<{ indexed: number; errors: number }> {
  const client = getMeilisearchClient();
  if (!client) return { indexed: 0, errors: 0 };

  await ensureIndices();

  let indexed = 0;
  let errors = 0;

  // Documents
  try {
    const docs = await prisma.document.findMany({
      where: { tenantId },
      select: {
        id: true, title: true, description: true, fileName: true,
        tags: true, category: true, createdAt: true,
        park: { select: { name: true } },
        fund: { select: { name: true } },
      },
    });
    const records: MeiliDocument[] = docs.map((doc) => ({
      id: doc.id, title: doc.title, description: doc.description ?? undefined,
      fileName: doc.fileName, tags: doc.tags, category: doc.category,
      parkName: doc.park?.name, fundName: doc.fund?.name,
      tenantId, createdAt: doc.createdAt.toISOString(),
    }));
    if (records.length > 0) await client.index(INDICES.DOCUMENTS).addDocuments(records);
    indexed += records.length;
  } catch (err) {
    logger.error({ err }, "[Meilisearch] Re-index error: documents");
    errors++;
  }

  // Invoices
  try {
    const invs = await prisma.invoice.findMany({
      where: { tenantId },
      select: {
        id: true, invoiceNumber: true, recipientName: true, status: true,
        invoiceType: true, grossAmount: true, invoiceDate: true,
      },
    });
    const records: MeiliInvoice[] = invs.map((inv) => ({
      id: inv.id, invoiceNumber: inv.invoiceNumber ?? undefined,
      recipientName: inv.recipientName ?? undefined,
      grossAmount: inv.grossAmount ? Number(inv.grossAmount) : undefined,
      status: inv.status, invoiceType: inv.invoiceType, tenantId,
      invoiceDate: inv.invoiceDate?.toISOString(),
    }));
    if (records.length > 0) await client.index(INDICES.INVOICES).addDocuments(records);
    indexed += records.length;
  } catch (err) {
    logger.error({ err }, "[Meilisearch] Re-index error: invoices");
    errors++;
  }

  // Parks
  try {
    const parks = await prisma.park.findMany({
      where: { tenantId },
      select: { id: true, name: true, shortName: true, city: true, description: true },
    });
    const records: MeiliPark[] = parks.map((p) => ({
      id: p.id, name: p.name, shortName: p.shortName ?? undefined,
      city: p.city ?? undefined, description: p.description ?? undefined, tenantId,
    }));
    if (records.length > 0) await client.index(INDICES.PARKS).addDocuments(records);
    indexed += records.length;
  } catch (err) {
    logger.error({ err }, "[Meilisearch] Re-index error: parks");
    errors++;
  }

  // Turbines (joined via park for tenantId)
  try {
    const turbines = await prisma.turbine.findMany({
      where: { park: { tenantId } },
      select: {
        id: true, designation: true, model: true, manufacturer: true,
        park: { select: { name: true } },
      },
    });
    const records: MeiliTurbine[] = turbines.map((t) => ({
      id: t.id, designation: t.designation, model: t.model ?? undefined,
      manufacturer: t.manufacturer ?? undefined, parkName: t.park?.name, tenantId,
    }));
    if (records.length > 0) await client.index(INDICES.TURBINES).addDocuments(records);
    indexed += records.length;
  } catch (err) {
    logger.error({ err }, "[Meilisearch] Re-index error: turbines");
    errors++;
  }

  // Audit logs (last 10k, most recent first)
  try {
    const logs = await prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 10000,
      select: {
        id: true, action: true, entityType: true, createdAt: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    const records: MeiliAuditLog[] = logs.map((l) => ({
      id: l.id, action: l.action, entityType: l.entityType,
      userName: [l.user?.firstName, l.user?.lastName].filter(Boolean).join(" ") || undefined,
      tenantId, createdAt: l.createdAt.toISOString(),
    }));
    if (records.length > 0) await client.index(INDICES.AUDIT_LOGS).addDocuments(records);
    indexed += records.length;
  } catch (err) {
    logger.error({ err }, "[Meilisearch] Re-index error: audit_logs");
    errors++;
  }

  logger.info({ indexed, errors, tenantId }, "[Meilisearch] Re-index complete");
  return { indexed, errors };
}
