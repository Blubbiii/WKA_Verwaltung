import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { apiLogger as logger } from "@/lib/logger";
import { auth } from "@/lib/auth";

/** Quick helper to check if current user is SUPERADMIN (without throwing) */
async function requireSuperadminCheck(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === "SUPERADMIN";
}

const userCreateSchema = z.object({
  email: z.string().email("Ungültige E-Mail-Adresse"),
  firstName: z.string().min(1, "Vorname ist erforderlich"),
  lastName: z.string().min(1, "Nachname ist erforderlich"),
  password: z.string().min(8, "Mindestens 8 Zeichen"),
  role: z.enum(["SUPERADMIN", "ADMIN", "MANAGER", "VIEWER"]),
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
    const role = searchParams.get("role");
    const status = searchParams.get("status");

    // Tenant isolation: non-SUPERADMIN users can only see their own tenant's users
    const isSuperadmin = check.tenantId === undefined || (await requireSuperadminCheck());
    const effectiveTenantId = isSuperadmin ? tenantId : check.tenantId;

    const where = {
      ...(effectiveTenantId && { tenantId: effectiveTenantId }),
      ...(!isSuperadmin && !effectiveTenantId && { tenantId: check.tenantId }),
      ...(search && {
        OR: [
          { email: { contains: search, mode: "insensitive" as const } },
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(role && { role: role as "SUPERADMIN" | "ADMIN" | "MANAGER" | "VIEWER" }),
      ...(status && { status: status as "ACTIVE" | "INACTIVE" }),
    };

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        tenantId: true,
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return NextResponse.json({ data: users });
  } catch (error) {
    logger.error({ err: error }, "Error fetching users");
    return NextResponse.json(
      { error: "Fehler beim Laden der Benutzer" },
      { status: 500 }
    );
  }
}

// POST /api/admin/users - Neuen Benutzer erstellen
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.USERS_CREATE);
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const validatedData = userCreateSchema.parse(body);

    // Prüfen ob E-Mail bereits existiert
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Ein Benutzer mit dieser E-Mail existiert bereits" },
        { status: 400 }
      );
    }

    // Prüfen ob Mandant existiert
    const tenant = await prisma.tenant.findUnique({
      where: { id: validatedData.tenantId },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 404 }
      );
    }

    // Passwort hashen
    const passwordHash = await bcrypt.hash(validatedData.password, 12);

    const user = await prisma.user.create({
      data: {
        email: validatedData.email,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        passwordHash,
        role: validatedData.role,
        status: validatedData.status,
        tenantId: validatedData.tenantId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        tenantId: true,
        tenant: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating user");
    return NextResponse.json(
      { error: "Fehler beim Erstellen des Benutzers" },
      { status: 500 }
    );
  }
}
