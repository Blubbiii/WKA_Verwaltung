import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { CATEGORY_LABELS } from "@/types/document-explorer";
import type { FolderNode, YearNode, CategoryNode } from "@/types/document-explorer";
import { apiError } from "@/lib/api-errors";

// GET /api/documents/explorer/tree
export async function GET() {
  try {
    const check = await requirePermission(PERMISSIONS.DOCUMENTS_READ);
    if (!check.authorized) return check.error!;

    const tenantId = check.tenantId!;

    // Load all data in parallel
    const [documents, invoices, parks] = await Promise.all([
      prisma.document.findMany({
        where: { tenantId },
        select: { id: true, parkId: true, category: true, createdAt: true },
      }),
      prisma.invoice.findMany({
        where: { tenantId, pdfUrl: { not: null } },
        select: { id: true, parkId: true, invoiceDate: true },
      }),
      prisma.park.findMany({
        where: { tenantId },
        select: { id: true, name: true, shortName: true },
      }),
    ]);

    const parkMap = new Map(parks.map((p) => [p.id, p.shortName || p.name]));

    // Group: parkId → year → category → count
    const grouped = new Map<string | null, Map<number, Map<string, number>>>();

    const ensurePath = (parkId: string | null, year: number, category: string) => {
      if (!grouped.has(parkId)) grouped.set(parkId, new Map());
      const yearMap = grouped.get(parkId)!;
      if (!yearMap.has(year)) yearMap.set(year, new Map());
      const catMap = yearMap.get(year)!;
      catMap.set(category, (catMap.get(category) ?? 0) + 1);
    };

    // Group documents
    for (const doc of documents) {
      const year = doc.createdAt.getFullYear();
      ensurePath(doc.parkId, year, doc.category);
    }

    // Group invoices as synthetic "INVOICE_PDF" category
    for (const inv of invoices) {
      const year = inv.invoiceDate.getFullYear();
      ensurePath(inv.parkId, year, "INVOICE_PDF");
    }

    // Build tree structure
    const tree: FolderNode[] = [];
    let unassigned: FolderNode | null = null;

    for (const [parkId, yearMap] of grouped) {
      const years: YearNode[] = [];
      let parkTotal = 0;

      // Sort years descending
      const sortedYears = [...yearMap.entries()].sort(([a], [b]) => b - a);

      for (const [year, catMap] of sortedYears) {
        const categories: CategoryNode[] = [];
        let yearTotal = 0;

        for (const [category, count] of catMap) {
          categories.push({
            category,
            label: CATEGORY_LABELS[category] ?? category,
            documentCount: count,
          });
          yearTotal += count;
        }

        // Sort categories alphabetically by label
        categories.sort((a, b) => a.label.localeCompare(b.label, "de"));

        years.push({ year, documentCount: yearTotal, categories });
        parkTotal += yearTotal;
      }

      const node: FolderNode = {
        parkId,
        parkName: parkId ? (parkMap.get(parkId) ?? "Unbekannter Park") : "Ohne Zuordnung",
        documentCount: parkTotal,
        years,
      };

      if (parkId === null) {
        unassigned = node;
      } else {
        tree.push(node);
      }
    }

    // Sort parks alphabetically
    tree.sort((a, b) => a.parkName.localeCompare(b.parkName, "de"));

    return NextResponse.json({ tree, unassigned });
  } catch (error) {
    logger.error({ err: error }, "Error building document explorer tree");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Ordnerstruktur" });
  }
}
