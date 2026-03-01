import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

// ============================================================================
// VALIDATION
// ============================================================================

const lineSchema = z.object({
  lineNumber: z.number().int().positive(),
  account: z.string().min(1).max(20),
  accountName: z.string().max(100).optional(),
  description: z.string().max(200).optional(),
  debitAmount: z.number().min(0).optional(),
  creditAmount: z.number().min(0).optional(),
  taxKey: z.string().max(10).optional(),
  costCenter: z.string().max(50).optional(),
});

const createSchema = z.object({
  entryDate: z.string().datetime({ message: "Ungültiges Datum" }),
  description: z.string().min(1, "Beschreibung darf nicht leer sein").max(200),
  reference: z.string().max(100).optional(),
  lines: z
    .array(lineSchema)
    .min(2, "Mindestens 2 Buchungszeilen erforderlich")
    .refine(
      (lines) =>
        lines.every(
          (l) =>
            (l.debitAmount !== undefined && l.debitAmount > 0) !==
            (l.creditAmount !== undefined && l.creditAmount > 0)
        ),
      "Jede Zeile muss entweder einen Soll- oder einen Haben-Betrag (> 0) haben, nicht beides"
    ),
});

// ============================================================================
// GET /api/journal-entries
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return NextResponse.json({ error: "Mandant nicht gefunden" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status"); // "DRAFT" | "POSTED"
    const yearFilter = searchParams.get("year");
    const searchFilter = searchParams.get("search");

    const yearNum = yearFilter ? parseInt(yearFilter, 10) : null;

    const entries = await prisma.journalEntry.findMany({
      where: {
        tenantId: check.tenantId,
        deletedAt: null,
        ...(statusFilter ? { status: statusFilter as "DRAFT" | "POSTED" } : {}),
        ...(yearNum && !isNaN(yearNum)
          ? {
              entryDate: {
                gte: new Date(yearNum, 0, 1),
                lt: new Date(yearNum + 1, 0, 1),
              },
            }
          : {}),
        ...(searchFilter
          ? {
              OR: [
                { description: { contains: searchFilter, mode: "insensitive" } },
                { reference: { contains: searchFilter, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        entryDate: true,
        description: true,
        reference: true,
        status: true,
        createdAt: true,
        createdBy: { select: { firstName: true, lastName: true } },
        lines: {
          select: {
            id: true,
            lineNumber: true,
            account: true,
            accountName: true,
            debitAmount: true,
            creditAmount: true,
          },
          orderBy: { lineNumber: "asc" },
        },
      },
      orderBy: { entryDate: "desc" },
    });

    return NextResponse.json(serializePrisma(entries));
  } catch (error) {
    logger.error({ err: error }, "Error fetching journal entries");
    return NextResponse.json(
      { error: "Fehler beim Laden der Buchungen" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST /api/journal-entries
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return NextResponse.json({ error: "Mandant nicht gefunden" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Ungültige Eingabedaten" },
        { status: 400 }
      );
    }

    const { entryDate, description, reference, lines } = parsed.data;

    const entry = await prisma.journalEntry.create({
      data: {
        tenantId: check.tenantId,
        entryDate: new Date(entryDate),
        description,
        reference: reference || null,
        status: "DRAFT",
        createdById: check.userId!,
        lines: {
          create: lines.map((l) => ({
            lineNumber: l.lineNumber,
            account: l.account,
            accountName: l.accountName || null,
            description: l.description || null,
            debitAmount: l.debitAmount ?? null,
            creditAmount: l.creditAmount ?? null,
            taxKey: l.taxKey || null,
            costCenter: l.costCenter || null,
          })),
        },
      },
      include: { lines: { orderBy: { lineNumber: "asc" } } },
    });

    logger.info(
      { tenantId: check.tenantId, entryId: entry.id },
      "Journal entry created"
    );

    return NextResponse.json(serializePrisma(entry), { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error creating journal entry");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Buchung" },
      { status: 500 }
    );
  }
}
