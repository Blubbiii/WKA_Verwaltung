import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { getAllPositionTaxMappings } from "@/lib/tax/position-tax-mapping";

const createSchema = z.object({
  taxType: z.enum(["STANDARD", "REDUCED", "EXEMPT"]),
  rate: z.number().min(0).max(100),
  validFrom: z.string().min(1, "Gültig-ab-Datum erforderlich"),
  validTo: z.string().optional().nullable(),
  label: z.string().optional().nullable(),
});

// Default tax rates to seed when none exist for a tenant
const DEFAULT_TAX_RATE_CONFIGS = [
  { taxType: "STANDARD" as const, rate: 19, label: "Regelsteuersatz" },
  { taxType: "REDUCED" as const, rate: 7, label: "Ermaessigter Steuersatz" },
  { taxType: "EXEMPT" as const, rate: 0, label: "Steuerbefreit" },
];

// GET /api/admin/tax-rates
export async function GET() {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;

    // Auto-seed default rates if none exist for this tenant
    const count = await prisma.taxRateConfig.count({ where: { tenantId } });
    if (count === 0) {
      logger.info({ tenantId }, "No tax rates found, seeding defaults");
      await prisma.taxRateConfig.createMany({
        data: DEFAULT_TAX_RATE_CONFIGS.map((cfg) => ({
          taxType: cfg.taxType,
          rate: cfg.rate,
          label: cfg.label,
          validFrom: new Date("1970-01-01"),
          validTo: null,
          tenantId,
        })),
      });
    }

    const taxRates = await prisma.taxRateConfig.findMany({
      where: { tenantId },
      orderBy: [{ taxType: "asc" }, { validFrom: "desc" }],
    });

    // Also load position tax mappings (auto-seeds defaults if needed)
    const positionMappings = await getAllPositionTaxMappings(tenantId);

    return NextResponse.json({ data: taxRates, positionMappings });
  } catch (error) {
    logger.error({ err: error }, "Error fetching tax rates");
    return NextResponse.json(
      { error: "Fehler beim Laden der Steuersätze" },
      { status: 500 }
    );
  }
}

// POST /api/admin/tax-rates
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Ungültige Eingabe" },
        { status: 400 }
      );
    }

    const taxRate = await prisma.taxRateConfig.create({
      data: {
        taxType: parsed.data.taxType,
        rate: parsed.data.rate,
        validFrom: new Date(parsed.data.validFrom),
        validTo: parsed.data.validTo ? new Date(parsed.data.validTo) : null,
        label: parsed.data.label ?? null,
        tenantId: check.tenantId!,
      },
    });

    return NextResponse.json(taxRate, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error creating tax rate");
    return NextResponse.json(
      { error: "Fehler beim Erstellen des Steuersatzes" },
      { status: 500 }
    );
  }
}
