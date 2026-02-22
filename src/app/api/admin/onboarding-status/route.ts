import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/admin/onboarding-status
// Returns the onboarding completion status for the current tenant.
// =============================================================================

export interface OnboardingStatus {
  isComplete: boolean;
  steps: {
    company: boolean;
    park: boolean;
    fund: boolean;
    users: boolean;
  };
  tenant: {
    id: string;
    name: string;
    contactEmail: string | null;
    contactPhone: string | null;
    street: string | null;
    houseNumber: string | null;
    postalCode: string | null;
    city: string | null;
    taxId: string | null;
    vatId: string | null;
    bankName: string | null;
    iban: string | null;
    bic: string | null;
  } | null;
}

export async function GET() {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 400 }
      );
    }

    // Fetch tenant data and counts in parallel
    const [tenant, parkCount, fundCount, userCount] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: check.tenantId },
        select: {
          id: true,
          name: true,
          contactEmail: true,
          contactPhone: true,
          street: true,
          houseNumber: true,
          postalCode: true,
          city: true,
          taxId: true,
          vatId: true,
          bankName: true,
          iban: true,
          bic: true,
        },
      }),
      prisma.park.count({ where: { tenantId: check.tenantId } }),
      prisma.fund.count({ where: { tenantId: check.tenantId } }),
      prisma.user.count({ where: { tenantId: check.tenantId } }),
    ]);

    if (!tenant) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 404 }
      );
    }

    const steps = {
      company: !!(tenant.contactEmail || tenant.street),
      park: parkCount > 0,
      fund: fundCount > 0,
      users: userCount > 1, // Admin user + at least 1 more
    };

    // Minimum for operation: at least one park AND one fund
    const isComplete = steps.park && steps.fund;

    const status: OnboardingStatus = {
      isComplete,
      steps,
      tenant,
    };

    return NextResponse.json(status);
  } catch (error) {
    logger.error({ err: error }, "Error fetching onboarding status");
    return NextResponse.json(
      { error: "Fehler beim Laden des Einrichtungsstatus" },
      { status: 500 }
    );
  }
}
