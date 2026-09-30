// mandantenübergreifend: Benutzer und Rollen gehören über Mitgliedschaften mehreren Mandanten an; die Routen filtern selbst.
import { NextRequest, NextResponse } from "next/server";
import { lizenzPruefen } from "@/lib/lizenz/lizenz-db";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { superadminLage, sichtbareMandanten } from "@/lib/admin/benutzer-sicht";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { apiLogger as logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";
import { auth } from "@/lib/auth";
import { AUTH_CONFIG } from "@/lib/config/auth-config";
import { apiError } from "@/lib/api-errors";

/** Quick helper to check if current user is SUPERADMIN (without throwing) */
async function requireSuperadminCheck(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  const { isSuperadmin } = await import("@/lib/auth/permissions");
  return isSuperadmin(session.user.id);
}

const userCreateSchema = z.object({
  email: z.string().email("Ungültige E-Mail-Adresse"),
  firstName: z.string().min(1, "Vorname ist erforderlich"),
  lastName: z.string().min(1, "Nachname ist erforderlich"),
  password: z.string().min(8, "Mindestens 8 Zeichen"),
  tenantId: z.string().uuid("Ungültige Mandanten-ID"),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

// GET /api/admin/users - Liste aller Benutzer
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.USERS_READ);
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const tenantId = searchParams.get("tenantId");
    const status = searchParams.get("status");

    // Tenant isolation: customer admins see their own tenant's users. The
    // platform operator sees names only of the tenant he works in and of
    // tenants with an active support access; of all others a count
    // (support phase 2, 2026-09).
    const isSuperadmin = await requireSuperadminCheck();
    const sichtbar = isSuperadmin ? sichtbareMandanten(await superadminLage(check.tenantId!)) : [check.tenantId!];
    const mandantFilter = tenantId
      ? { in: sichtbar.includes(tenantId) ? [tenantId] : [] }
      : { in: sichtbar };

    const where = {
      tenantId: mandantFilter,
      ...(search && {
        OR: [
          { email: { contains: search, mode: "insensitive" as const } },
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(status && { status: status as "ACTIVE" | "INACTIVE" }),
    };

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        tenantId: true,
        tenant: {
          select: { id: true, name: true },
        },
        userRoleAssignments: {
          select: {
            tenantId: true,
            role: {
              select: { id: true, name: true, color: true, hierarchy: true },
            },
          },
          orderBy: { role: { hierarchy: "desc" } },
        },
        userTenantMemberships: {
          select: {
            tenantId: true,
            isPrimary: true,
            status: true,
            tenant: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    // Users of tenants without access: how many, not who.
    let verborgen: { tenantId: string; tenantName: string; anzahl: number }[] = [];
    if (isSuperadmin && !tenantId) {
      const gruppen = await prisma.user.groupBy({
        by: ["tenantId"],
        where: { tenantId: { notIn: sichtbar } },
        _count: { _all: true },
      });
      const namen = await prisma.tenant.findMany({
        where: { id: { in: gruppen.map((x) => x.tenantId) } },
        select: { id: true, name: true },
      });
      const name = new Map(namen.map((t) => [t.id, t.name]));
      verborgen = gruppen.map((x) => ({ tenantId: x.tenantId, tenantName: name.get(x.tenantId) ?? "", anzahl: x._count._all }));
    }

    return NextResponse.json({ data: users, verborgen });
  } catch (error) {
    logger.error({ err: error }, "Error fetching users");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Benutzer" });
  }
}

// POST /api/admin/users - Neuen Benutzer erstellen
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.USERS_CREATE);
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const validatedData = userCreateSchema.parse(body);

    // Only the platform operator may create users in another tenant. Before
    // (audit 2026-09) the tenant came from the body unchecked.
    if (validatedData.tenantId !== check.tenantId && !(await requireSuperadminCheck())) {
      return apiError("FORBIDDEN", 403, { message: "Benutzer nur im eigenen Mandanten anlegen" });
    }

    // Licence: every active staff user counts (portal users are created elsewhere).
    const lizenz = await lizenzPruefen(validatedData.tenantId, "benutzer");
    if (lizenz) return lizenz;

    // Prüfen ob E-Mail bereits existiert
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
      select: { id: true },
    });

    if (existingUser) {
      return apiError("ALREADY_EXISTS", 400, { message: "Ein Benutzer mit dieser E-Mail existiert bereits" });
    }

    // Prüfen ob Mandant existiert
    const tenant = await prisma.tenant.findUnique({
      where: { id: validatedData.tenantId },
    });

    if (!tenant) {
      return apiError("NOT_FOUND", undefined, { message: "Mandant nicht gefunden" });
    }

    // Passwort hashen
    const passwordHash = await bcrypt.hash(validatedData.password, AUTH_CONFIG.bcryptSaltRounds);

    const user = await prisma.user.create({
      data: {
        email: validatedData.email,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        passwordHash,
        status: validatedData.status,
        tenantId: validatedData.tenantId,
        userTenantMemberships: {
          create: { tenantId: validatedData.tenantId, isPrimary: true },
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        tenantId: true,
        tenant: { select: { id: true, name: true } },
        userRoleAssignments: {
          select: {
            role: { select: { id: true, name: true, color: true, hierarchy: true } },
          },
        },
        userTenantMemberships: {
          select: {
            tenantId: true,
            isPrimary: true,
            status: true,
            tenant: { select: { id: true, name: true } },
          },
        },
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Fehler beim Erstellen des Benutzers");
  }
}
