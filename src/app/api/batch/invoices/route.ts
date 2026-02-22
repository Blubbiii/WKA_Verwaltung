import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { processBatch } from "@/lib/batch/batch-operations";
import { createAuditLog } from "@/lib/audit";

const batchInvoiceSchema = z.object({
  action: z.enum(["approve", "send", "cancel"]),
  invoiceIds: z.array(z.string().uuid()).min(1).max(100),
});

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = batchInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Anfrage", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { action, invoiceIds } = parsed.data;

    // Verify all invoices belong to the user's tenant
    const invoices = await prisma.invoice.findMany({
      where: { id: { in: invoiceIds }, tenantId: check.tenantId },
      select: { id: true, status: true },
    });

    const foundIds = new Set(invoices.map((i) => i.id));
    const missingIds = invoiceIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      return NextResponse.json(
        { error: `Rechnungen nicht gefunden: ${missingIds.join(", ")}` },
        { status: 404 }
      );
    }

    const result = await processBatch(invoiceIds, async (id) => {
      const invoice = invoices.find((i) => i.id === id)!;

      switch (action) {
        case "approve": {
          if (invoice.status !== "DRAFT") {
            throw new Error(
              `Rechnung hat Status ${invoice.status}, nur DRAFT kann freigegeben werden`
            );
          }
          await prisma.invoice.update({
            where: { id },
            data: { status: "SENT", sentAt: new Date() },
          });
          break;
        }

        case "send": {
          if (invoice.status !== "DRAFT" && invoice.status !== "SENT") {
            throw new Error(
              `Rechnung hat Status ${invoice.status}, kann nicht versendet werden`
            );
          }
          await prisma.invoice.update({
            where: { id },
            data: { status: "SENT", sentAt: new Date() },
          });
          break;
        }

        case "cancel": {
          if (invoice.status === "CANCELLED") {
            throw new Error("Rechnung ist bereits storniert");
          }
          await prisma.invoice.update({
            where: { id },
            data: { status: "CANCELLED" },
          });
          break;
        }
      }

      await createAuditLog({
        action: "UPDATE",
        entityType: "Invoice",
        entityId: id,
        newValues: { batchAction: action },
        description: `Batch ${action}: Rechnung`,
      });
    });

    return NextResponse.json({
      action,
      ...result,
      message: `${result.success.length} von ${result.totalProcessed} Rechnungen erfolgreich verarbeitet`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Interner Serverfehler",
      },
      { status: 500 }
    );
  }
}
