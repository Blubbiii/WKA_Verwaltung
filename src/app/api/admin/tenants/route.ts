import { NextRequest, NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { Prisma, UserRole } from "@prisma/client";
import { sendTemplatedEmailSync } from "@/lib/email/sender";

const adminUserSchema = z
  .object({
    email: z.string().email("Ungueltige E-Mail-Adresse"),
    firstName: z.string().min(1, "Vorname ist erforderlich"),
    lastName: z.string().min(1, "Nachname ist erforderlich"),
    mode: z.enum(["password", "invitation"]),
    password: z
      .string()
      .min(8, "Passwort muss mindestens 8 Zeichen lang sein")
      .optional(),
  })
  .refine(
    (data) =>
      data.mode === "invitation" ||
      (data.password && data.password.length >= 8),
    {
      message: "Passwort ist erforderlich bei direkter Erstellung",
      path: ["password"],
    }
  );

const tenantCreateSchema = z.object({
  name: z.string().min(1, "Firmenname ist erforderlich"),
  slug: z
    .string()
    .min(1, "Slug ist erforderlich")
    .regex(
      /^[a-z0-9-]+$/,
      "Nur Kleinbuchstaben, Zahlen und Bindestriche"
    ),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  street: z.string().optional(),
  houseNumber: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  logoUrl: z.string().optional().or(z.literal("")),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  secondaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  adminUser: adminUserSchema.optional(),
});

// GET /api/admin/tenants - Liste aller Mandanten (nur für SUPERADMIN)
export async function GET(request: NextRequest) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status");

    const where = {
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { slug: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(status && { status: status as "ACTIVE" | "INACTIVE" }),
    };

    const tenants = await prisma.tenant.findMany({
      where,
      include: {
        _count: {
          select: {
            users: true,
            parks: true,
            funds: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    // Convert BigInt fields to Number for JSON serialization
    const serializedTenants = tenants.map((tenant) => ({
      ...tenant,
      storageUsedBytes: Number(tenant.storageUsedBytes),
      storageLimit: Number(tenant.storageLimit),
    }));

    return NextResponse.json({ data: serializedTenants });
  } catch (error) {
    logger.error({ err: error }, "Error fetching tenants");
    return NextResponse.json(
      { error: "Fehler beim Laden der Mandanten" },
      { status: 500 }
    );
  }
}

// POST /api/admin/tenants - Neuen Mandanten erstellen
export async function POST(request: NextRequest) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const validatedData = tenantCreateSchema.parse(body);

    // Prüfen ob Slug bereits existiert
    const existingTenant = await prisma.tenant.findUnique({
      where: { slug: validatedData.slug },
    });

    if (existingTenant) {
      return NextResponse.json(
        { error: "Ein Mandant mit diesem Slug existiert bereits" },
        { status: 400 }
      );
    }

    // Default fund categories to seed for every new tenant
    const defaultCategories = [
      {
        name: "WKA-Betreiber",
        code: "BETREIBER",
        description: "Betreibergesellschaft (GmbH, KG, etc.)",
        color: "#3b82f6",
        sortOrder: 0,
      },
      {
        name: "Netzgesellschaft",
        code: "NETZGESELLSCHAFT",
        description: "Netzgesellschaft (GbR, etc.)",
        color: "#7c3aed",
        sortOrder: 1,
      },
      {
        name: "Umspannwerk",
        code: "UMSPANNWERK",
        description: "Umspannwerk-Gesellschaft",
        color: "#f97316",
        sortOrder: 2,
      },
      {
        name: "Vermarktung",
        code: "VERMARKTUNG",
        description: "Direktvermarkter",
        color: "#14b8a6",
        sortOrder: 3,
      },
      {
        name: "Sonstige",
        code: "SONSTIGE",
        description: "Sonstige Gesellschaft",
        color: "#6b7280",
        sortOrder: 4,
      },
    ];

    // Use interactive transaction for atomic tenant + categories + optional admin user creation
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create tenant
      const tenant = await tx.tenant.create({
        data: {
          name: validatedData.name,
          slug: validatedData.slug,
          contactEmail: validatedData.contactEmail || null,
          contactPhone: validatedData.contactPhone || null,
          street: validatedData.street || null,
          houseNumber: validatedData.houseNumber || null,
          postalCode: validatedData.postalCode || null,
          city: validatedData.city || null,
          logoUrl: validatedData.logoUrl || null,
          primaryColor: validatedData.primaryColor || "#3b82f6",
          secondaryColor: validatedData.secondaryColor || "#1e40af",
          status: validatedData.status,
        },
        include: {
          _count: {
            select: { users: true, parks: true, funds: true },
          },
        },
      });

      // 2. Seed default fund categories
      await tx.fundCategory.createMany({
        data: defaultCategories.map((c) => ({
          ...c,
          tenantId: tenant.id,
          isActive: true,
        })),
        skipDuplicates: true,
      });

      // 3. Optionally create admin user
      let createdUser: {
        id: string;
        email: string;
        firstName: string | null;
        lastName: string | null;
      } | null = null;
      let invitationToken: string | null = null;

      if (validatedData.adminUser) {
        const { mode, email, firstName, lastName, password } =
          validatedData.adminUser;

        // Hash the provided password, or generate a random placeholder for invitation mode
        const passwordHash =
          mode === "password"
            ? await bcrypt.hash(password!, 12)
            : await bcrypt.hash(randomUUID(), 12);

        const user = await tx.user.create({
          data: {
            email,
            firstName,
            lastName,
            passwordHash,
            role: UserRole.ADMIN,
            status: "ACTIVE",
            tenantId: tenant.id,
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        });

        // Assign "Administrator" system role if it exists
        const adminRole = await tx.role.findFirst({
          where: { name: "Administrator", isSystem: true, tenantId: null },
        });
        if (adminRole) {
          await tx.userRoleAssignment.create({
            data: {
              userId: user.id,
              roleId: adminRole.id,
              resourceType: "__global__",
            },
          });
        }

        createdUser = user;

        // Create invitation token if mode is "invitation"
        if (mode === "invitation") {
          const token = randomUUID();
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 7);

          await tx.passwordResetToken.create({
            data: { token, userId: user.id, expiresAt },
          });

          invitationToken = token;
        }
      }

      return { tenant, createdUser, invitationToken };
    });

    // Send invitation email outside the transaction (non-transactional)
    let emailSent: boolean | null = null;

    if (result.invitationToken && result.createdUser) {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXTAUTH_URL ||
        "http://localhost:3000";
      try {
        const emailResult = await sendTemplatedEmailSync(
          "tenant-admin-invitation",
          {
            userName: `${result.createdUser.firstName} ${result.createdUser.lastName}`,
            invitationUrl: `${baseUrl}/reset-password?token=${result.invitationToken}`,
            expiresIn: "7 Tagen",
          },
          result.createdUser.email,
          result.tenant.id
        );
        emailSent = emailResult.success;
      } catch (error) {
        logger.error({ err: error }, "Failed to send invitation email");
        emailSent = false;
      }
    }

    // Convert BigInt fields to Number for JSON serialization
    const serializedTenant = {
      ...result.tenant,
      storageUsedBytes: Number(result.tenant.storageUsedBytes),
      storageLimit: Number(result.tenant.storageLimit),
    };

    return NextResponse.json(
      {
        ...serializedTenant,
        adminUser: result.createdUser || null,
        emailSent,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error:
            "Ein Benutzer mit dieser E-Mail-Adresse existiert bereits",
        },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating tenant");
    return NextResponse.json(
      { error: "Fehler beim Erstellen des Mandanten" },
      { status: 500 }
    );
  }
}
