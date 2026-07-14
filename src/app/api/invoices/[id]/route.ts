import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth/withPermission";
import { getUserHighestHierarchy } from "@/lib/auth/permissions";
import { calculateSkontoDiscount, calculateSkontoDeadline } from "@/lib/invoices/skonto";
import { z } from "zod";
import { handleApiError } from "@/lib/api-utils";
import { apiLogger as logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache/invalidation";
import { serializePrisma } from "@/lib/serialize";
import { apiError } from "@/lib/api-errors";
import { updateWithAudit, isEntityNotFoundError } from "@/lib/audit-update";
import { headers } from "next/headers";

const invoiceUpdateSchema = z.object({
  invoiceDate: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  recipientType: z.string().optional(),
  recipientName: z.string().optional(),
  recipientAddress: z.string().optional(),
  serviceStartDate: z.string().optional().nullable(),
  serviceEndDate: z.string().optional().nullable(),
  paymentReference: z.string().optional(),
  notes: z.string().optional().nullable(),
  fundId: z.uuid().optional().nullable(),
  shareholderId: z.uuid().optional().nullable(),
  leaseId: z.uuid().optional().nullable(),
  parkId: z.uuid().optional().nullable(),
  // Skonto (early payment discount) - both optional
  skontoPercent: z.number().min(0.01).max(99.99).optional().nullable(),
  skontoDays: z.number().int().min(1).max(365).optional().nullable(),
  // E-Invoice: Leitweg-ID for public sector recipients (XRechnung)
  leitwegId: z.string().max(46).optional().nullable(),
  // F15-Compliance: Optimistic Locking PoC.
  // Client sends the `updatedAt` timestamp it originally read. If the row
  // was modified in the meantime by another user, we return 409 CONFLICT
  // instead of silently overwriting their changes ("Lost Update").
  // Header-Alternative `If-Unmodified-Since` wäre RFC-konformer, aber nur
  // 1-Sekunden-Auflösung. `expectedUpdatedAt` in ms geht sicher.
  // TODO: Nach PoC-Erfolg auf weitere PATCH-Routes ausrollen (Contract,
  // Fund, Person, Lease, Shareholder, JournalEntry).
  expectedUpdatedAt: z.iso.datetime().optional(),
});

// GET /api/invoices/[id] - Einzelne Rechnung mit Details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
      include: {
        items: {
          orderBy: { position: "asc" },
        },
        fund: {
          select: {
            id: true,
            name: true,
            legalForm: true,
            street: true,
            houseNumber: true,
            postalCode: true,
            city: true,
            address: true,
            managingDirector: true,
          },
        },
        shareholder: {
          select: {
            id: true,
            person: {
              select: {
                firstName: true,
                lastName: true,
                companyName: true,
                street: true,
                postalCode: true,
                city: true,
                bankIban: true,
                bankBic: true,
                bankName: true,
              },
            },
          },
        },
        park: {
          select: {
            id: true,
            name: true,
            billingEntityFund: {
              select: {
                id: true,
                name: true,
                legalForm: true,
                address: true,
              },
            },
          },
        },
        lease: {
          select: {
            id: true,
            lessor: {
              select: {
                firstName: true,
                lastName: true,
                companyName: true,
                street: true,
                postalCode: true,
                city: true,
                bankIban: true,
                bankBic: true,
                bankName: true,
              },
            },
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        cancelledInvoice: {
          select: { id: true, invoiceNumber: true },
        },
        cancellationInvoices: {
          select: { id: true, invoiceNumber: true, invoiceDate: true },
        },
        correctedInvoice: {
          select: { id: true, invoiceNumber: true },
        },
        correctionInvoices: {
          where: { deletedAt: null },
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            correctionType: true,
            netAmount: true,
            grossAmount: true,
            notes: true,
          },
          orderBy: { createdAt: "asc" },
        },
        settlementPeriod: {
          select: { id: true, year: true, status: true },
        },
        tenant: {
          select: {
            id: true,
            name: true,
            street: true,
            houseNumber: true,
            postalCode: true,
            city: true,
            contactEmail: true,
            contactPhone: true,
            bankName: true,
            iban: true,
            bic: true,
            taxId: true,
            vatId: true,
          },
        },
      },
    });

    if (!invoice) {
      return apiError("NOT_FOUND", undefined, { message: "Rechnung nicht gefunden" });
    }

    // Tenant-Check
    if (invoice.tenantId !== check.tenantId!) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung" });
    }

    return NextResponse.json(serializePrisma(invoice));
  } catch (error) {
    logger.error({ err: error }, "Error fetching invoice");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Rechnung" });
  }
}

// PATCH /api/invoices/[id] - Rechnung aktualisieren (nur DRAFT)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const validatedData = invoiceUpdateSchema.parse(body);

    // Prüfe ob Rechnung existiert und DRAFT ist
    const existing = await prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        status: true,
        invoiceDate: true,
        grossAmount: true,
        updatedAt: true,
      },
    });

    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Rechnung nicht gefunden" });
    }

    if (existing.tenantId !== check.tenantId!) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung" });
    }

    if (existing.status !== "DRAFT") {
      return apiError("OPERATION_NOT_ALLOWED", 400, { message: "Nur Entwürfe können bearbeitet werden" });
    }

    // F15-Compliance: Optimistic Locking Check.
    // Wenn Client `expectedUpdatedAt` mitgibt und die DB-Zeit davon abweicht,
    // hat jemand anderes den Datensatz zwischenzeitlich verändert.
    // Vergleich mit ms-Genauigkeit (getTime()), damit Timezone/String-Format
    // keine False-Positives erzeugen.
    if (validatedData.expectedUpdatedAt) {
      const expected = new Date(validatedData.expectedUpdatedAt).getTime();
      const actual = existing.updatedAt.getTime();
      if (expected !== actual) {
        return apiError("CONFLICT", 409, {
          message:
            "Rechnung wurde in der Zwischenzeit von einem anderen Benutzer geändert. Bitte neu laden und erneut speichern.",
          details: {
            expectedUpdatedAt: new Date(expected).toISOString(),
            actualUpdatedAt: existing.updatedAt.toISOString(),
          },
        });
      }
    }

    // Build Skonto update data if provided. Wir MERGEN mit den bestehenden
    // Werten statt sie zu überschreiben — sonst würde ein PATCH mit nur
    // `{skontoPercent: 3}` `skontoDays` auf null triggern und den Skonto
    // komplett löschen (Regression #F4).
    let skontoUpdateData: Record<string, unknown> = {};
    const percentTouched = Object.prototype.hasOwnProperty.call(validatedData, "skontoPercent");
    const daysTouched = Object.prototype.hasOwnProperty.call(validatedData, "skontoDays");
    if (percentTouched || daysTouched) {
      // Lade die bestehenden Skonto-Werte, um sie mit dem Delta zu mergen.
      const currentSkonto = percentTouched && daysTouched
        ? { skontoPercent: null as unknown as number | null, skontoDays: null as number | null }
        : await prisma.invoice.findUnique({
            where: { id },
            select: { skontoPercent: true, skontoDays: true },
          });

      const effectivePercent = percentTouched
        ? validatedData.skontoPercent ?? null
        : currentSkonto?.skontoPercent != null
          ? Number(currentSkonto.skontoPercent)
          : null;
      const effectiveDays = daysTouched
        ? validatedData.skontoDays ?? null
        : currentSkonto?.skontoDays ?? null;

      if (effectivePercent && effectiveDays) {
        // Beide Werte gesetzt → Skonto neu berechnen.
        const effectiveInvoiceDate = validatedData.invoiceDate
          ? new Date(validatedData.invoiceDate)
          : existing.invoiceDate;
        const grossAmount = Number(existing.grossAmount);
        const skontoDiscount = calculateSkontoDiscount(grossAmount, effectivePercent);
        const skontoDeadline = calculateSkontoDeadline(effectiveInvoiceDate, effectiveDays);

        skontoUpdateData = {
          skontoPercent: effectivePercent,
          skontoDays: effectiveDays,
          skontoDeadline,
          skontoAmount: skontoDiscount,
        };
      } else if (
        (percentTouched && validatedData.skontoPercent === null) ||
        (daysTouched && validatedData.skontoDays === null)
      ) {
        // Explizit auf null gesetzt → Skonto entfernen.
        skontoUpdateData = {
          skontoPercent: null,
          skontoDays: null,
          skontoDeadline: null,
          skontoAmount: null,
          skontoPaid: false,
        };
      } else {
        // Merge unvollständig (z.B. `{skontoPercent: 3}` ohne bestehende
        // skontoDays) — schreibe nur die geänderten Felder, lasse die anderen
        // Skonto-Werte unangetastet.
        skontoUpdateData = {
          ...(percentTouched && { skontoPercent: validatedData.skontoPercent }),
          ...(daysTouched && { skontoDays: validatedData.skontoDays }),
        };
      }
    }

    const headersList = await headers();
    const ipAddress = headersList.get("x-forwarded-for")?.split(",")[0] ?? headersList.get("x-real-ip") ?? null;
    const userAgent = headersList.get("user-agent") ?? null;

    try {
      // GoBD §147: jede Änderung an Rechnungen mit oldValues/newValues
      // in einer Transaction mit dem Update protokollieren.
      const invoice = await updateWithAudit({
        entityType: "Invoice",
        entityId: id,
        userId: check.userId,
        tenantId: check.tenantId!,
        ipAddress,
        userAgent,
        description: "Rechnung bearbeitet (DRAFT)",
        loadCurrent: (tx) =>
          tx.invoice.findFirst({
            where: { id, tenantId: check.tenantId! },
          }) as Promise<Record<string, unknown> | null>,
        applyChange: (tx) =>
          tx.invoice.update({
            // F15-Compliance: `updatedAt` in WHERE macht das Update atomar.
            // Zwischen unserem externen Check und diesem Statement könnte
            // trotzdem eine andere Transaktion die Row aktualisiert haben
            // (READ COMMITTED). Wenn ja, matcht where nicht → P2025.
            where: {
              id,
              tenantId: check.tenantId!,
              ...(validatedData.expectedUpdatedAt && {
                updatedAt: new Date(validatedData.expectedUpdatedAt),
              }),
            },
            data: {
              ...(validatedData.invoiceDate && {
                invoiceDate: new Date(validatedData.invoiceDate),
              }),
              ...(validatedData.dueDate !== undefined && {
                dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : null,
              }),
              ...(validatedData.recipientType !== undefined && {
                recipientType: validatedData.recipientType,
              }),
              ...(validatedData.recipientName !== undefined && {
                recipientName: validatedData.recipientName,
              }),
              ...(validatedData.recipientAddress !== undefined && {
                recipientAddress: validatedData.recipientAddress,
              }),
              ...(validatedData.serviceStartDate !== undefined && {
                serviceStartDate: validatedData.serviceStartDate
                  ? new Date(validatedData.serviceStartDate)
                  : null,
              }),
              ...(validatedData.serviceEndDate !== undefined && {
                serviceEndDate: validatedData.serviceEndDate
                  ? new Date(validatedData.serviceEndDate)
                  : null,
              }),
              ...(validatedData.paymentReference !== undefined && {
                paymentReference: validatedData.paymentReference,
              }),
              ...(validatedData.notes !== undefined && {
                notes: validatedData.notes,
              }),
              ...(validatedData.fundId !== undefined && {
                fundId: validatedData.fundId,
              }),
              ...(validatedData.shareholderId !== undefined && {
                shareholderId: validatedData.shareholderId,
              }),
              ...(validatedData.leaseId !== undefined && {
                leaseId: validatedData.leaseId,
              }),
              ...(validatedData.parkId !== undefined && {
                parkId: validatedData.parkId,
              }),
              ...(validatedData.leitwegId !== undefined && {
                leitwegId: validatedData.leitwegId,
                einvoiceXml: null,
                einvoiceFormat: null,
                einvoiceGeneratedAt: null,
              }),
              ...skontoUpdateData,
            },
            include: {
              items: { orderBy: { position: "asc" } },
            },
          }) as Promise<Record<string, unknown>>,
      });

      // Invalidate dashboard caches after invoice update
      invalidate.onInvoiceChange(check.tenantId!, id, 'update').catch((err) => {
        logger.warn({ err }, '[Invoices] Cache invalidation error after update');
      });

      return NextResponse.json(serializePrisma(invoice));
    } catch (err) {
      // F15-Compliance: P2025 = "Record to update not found." Kommt hier
      // typischerweise vom Optimistic-Locking-Where (`updatedAt`), weil ein
      // Concurrent-Writer die Row verändert hat.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025" &&
        validatedData.expectedUpdatedAt
      ) {
        return apiError("CONFLICT", 409, {
          message:
            "Rechnung wurde in der Zwischenzeit von einem anderen Benutzer geändert. Bitte neu laden und erneut speichern.",
        });
      }
      if (isEntityNotFoundError(err)) {
        return apiError("NOT_FOUND", 404, { message: "Rechnung nicht gefunden" });
      }
      throw err;
    }
  } catch (error) {
    return handleApiError(error, "Fehler beim Aktualisieren der Rechnung");
  }
}

// DELETE /api/invoices/[id] - Rechnung soft-löschen (AO §147, HGB §257: 10 Jahre Aufbewahrungspflicht)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:delete");
    if (!check.authorized) return check.error;

    // Zusätzliche Prüfung: Nur ADMIN oder SUPERADMIN dürfen löschen
    const hierarchy = await getUserHighestHierarchy(check.userId!);
    if (hierarchy < 80) {
      return apiError("FORBIDDEN", undefined, { message: "Nur Administratoren dürfen Rechnungen löschen" });
    }

    const { id } = await params;

    const existing = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, tenantId: true, invoiceNumber: true, deletedAt: true },
    });

    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Rechnung nicht gefunden" });
    }

    if (existing.tenantId !== check.tenantId!) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung" });
    }

    if (existing.deletedAt) {
      return apiError("OPERATION_NOT_ALLOWED", 400, { message: "Rechnung wurde bereits gelöscht" });
    }

    // Soft-delete + audit log in einer Transaktion (Datenkonsistenz)
    await prisma.$transaction(async (tx) => {
      // 1. Rechnung als gelöscht markieren (gesetzliche Aufbewahrungspflicht)
      await tx.invoice.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      // 2. Log deletion for audit trail
      await tx.auditLog.create({
        data: {
          action: "DELETE",
          entityType: "Invoice",
          entityId: id,
          oldValues: existing as unknown as Prisma.InputJsonValue,
          newValues: Prisma.JsonNull,
          tenantId: check.tenantId!,
          userId: check.userId!,
        },
      });
    });

    // Invalidate dashboard caches after invoice deletion
    invalidate.onInvoiceChange(check.tenantId!, id, 'delete').catch((err) => {
      logger.warn({ err }, '[Invoices] Cache invalidation error after delete');
    });

    return NextResponse.json({
      success: true,
      message: "Rechnung wurde als gelöscht markiert (Aufbewahrungspflicht gem. AO §147, HGB §257)",
    });
  } catch (error) {
    logger.error({ err: error }, "Error deleting invoice");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen der Rechnung" });
  }
}
