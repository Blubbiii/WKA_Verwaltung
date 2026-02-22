import { NextRequest, NextResponse } from "next/server";
import { requireSuperadmin, requireAdmin } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const tenantUpdateSchema = z.object({
  name: z.string().min(1, "Firmenname ist erforderlich").optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  street: z.string().optional(),
  houseNumber: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  logoUrl: z.string().optional().or(z.literal("")),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
});

// GET /api/admin/tenants/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requireSuperadmin();
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            parks: true,
            funds: true,
            contracts: true,
            documents: true,
          },
        },
      },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json(tenant);
  } catch (error) {
    logger.error({ err: error }, "Error fetching tenant");
    return NextResponse.json(
      { error: "Fehler beim Laden des Mandanten" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/tenants/[id]
// ADMIN can update their own tenant, SUPERADMIN can update any tenant
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Try SUPERADMIN first (can edit any tenant)
    const superCheck = await requireSuperadmin();
    if (!superCheck.authorized) {
      // Fall back to ADMIN (can only edit own tenant)
      const adminCheck = await requireAdmin();
      if (!adminCheck.authorized) return adminCheck.error;

      // ADMIN can only update their own tenant
      if (adminCheck.tenantId !== id) {
        return NextResponse.json(
          { error: "Keine Berechtigung fuer diesen Mandanten" },
          { status: 403 }
        );
      }
    }

    const existingTenant = await prisma.tenant.findUnique({
      where: { id },
    });

    if (!existingTenant) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = tenantUpdateSchema.parse(body);

    // Prüfen ob neuer Slug bereits existiert
    if (validatedData.slug && validatedData.slug !== existingTenant.slug) {
      const slugExists = await prisma.tenant.findUnique({
        where: { slug: validatedData.slug },
      });

      if (slugExists) {
        return NextResponse.json(
          { error: "Ein Mandant mit diesem Slug existiert bereits" },
          { status: 400 }
        );
      }
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data: {
        ...(validatedData.name && { name: validatedData.name }),
        ...(validatedData.slug && { slug: validatedData.slug }),
        ...(validatedData.contactEmail !== undefined && {
          contactEmail: validatedData.contactEmail || null,
        }),
        ...(validatedData.contactPhone !== undefined && {
          contactPhone: validatedData.contactPhone || null,
        }),
        ...(validatedData.street !== undefined && {
          street: validatedData.street || null,
        }),
        ...(validatedData.houseNumber !== undefined && {
          houseNumber: validatedData.houseNumber || null,
        }),
        ...(validatedData.postalCode !== undefined && {
          postalCode: validatedData.postalCode || null,
        }),
        ...(validatedData.city !== undefined && {
          city: validatedData.city || null,
        }),
        ...(validatedData.status && { status: validatedData.status }),
        ...(validatedData.logoUrl !== undefined && {
          logoUrl: validatedData.logoUrl || null,
        }),
        ...(validatedData.primaryColor && { primaryColor: validatedData.primaryColor }),
        ...(validatedData.secondaryColor && { secondaryColor: validatedData.secondaryColor }),
      },
      include: {
        _count: {
          select: { users: true, parks: true },
        },
      },
    });

    return NextResponse.json(tenant);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating tenant");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren des Mandanten" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/tenants/[id] - Deaktiviert oder loescht den Mandanten
// ?hard=true => Endgueltiges Loeschen (nur wenn bereits INACTIVE)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error!;

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const hardDelete = searchParams.get("hard") === "true";

    const existingTenant = await prisma.tenant.findUnique({
      where: { id },
    });

    if (!existingTenant) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 404 }
      );
    }

    if (hardDelete) {
      // Hard-Delete: Mandant muss bereits INACTIVE sein
      if (existingTenant.status !== "INACTIVE") {
        return NextResponse.json(
          { error: "Mandant muss zuerst deaktiviert werden, bevor er endgueltig geloescht werden kann" },
          { status: 400 }
        );
      }

      try {
        await prisma.tenant.delete({ where: { id } });
      } catch (deleteError: unknown) {
        const msg = deleteError instanceof Error ? deleteError.message : "";
        if (msg.includes("Foreign key constraint")) {
          return NextResponse.json(
            { error: "Mandant kann nicht geloescht werden, da noch zugehoerige Daten existieren" },
            { status: 409 }
          );
        }
        throw deleteError;
      }

      return NextResponse.json({ success: true, hardDeleted: true });
    }

    // Soft-Delete: Mandant deaktivieren
    await prisma.tenant.update({
      where: { id },
      data: { status: "INACTIVE" },
    });

    // Alle Benutzer des Mandanten deaktivieren
    await prisma.user.updateMany({
      where: { tenantId: id },
      data: { status: "INACTIVE" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting tenant");
    return NextResponse.json(
      { error: "Fehler beim Loeschen des Mandanten" },
      { status: 500 }
    );
  }
}
