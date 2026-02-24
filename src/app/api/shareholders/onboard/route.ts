import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { sendTemplatedEmailSync } from "@/lib/email/sender";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

// Validation schema for the onboarding request
const onboardingSchema = z.object({
  personalData: z.object({
    salutation: z.string().nullable().optional(),
    firstName: z.string().min(1, "Vorname ist erforderlich"),
    lastName: z.string().min(1, "Nachname ist erforderlich"),
    email: z.string().email("Ungültige E-Mail-Adresse"),
    phone: z.string().nullable().optional(),
    street: z.string().nullable().optional(),
    houseNumber: z.string().nullable().optional(),
    postalCode: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    taxId: z.string().nullable().optional(),
  }),
  participation: z.object({
    fundId: z.string().uuid("Ungültige Gesellschafts-ID"),
    capitalContribution: z.number().positive("Kapitalanteil muss größer als 0 sein"),
    entryDate: z.string().min(1, "Beitrittsdatum ist erforderlich"),
    shareholderNumber: z.string().nullable().optional(),
  }),
  portalAccess: z.object({
    createPortalAccess: z.boolean().default(false),
    sendWelcomeEmail: z.boolean().default(true),
  }),
});

/**
 * Generate a cryptographically secure temporary password.
 */
function generateTemporaryPassword(): string {
  return randomBytes(12).toString("base64url");
}

/**
 * Recalculate all ownership percentages for shareholders in a fund.
 */
async function recalculateFundShares(
  fundId: string,
  txClient: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
) {
  const shareholders = await txClient.shareholder.findMany({
    where: { fundId, status: "ACTIVE" },
    select: { id: true, capitalContribution: true },
  });

  const totalCapital = shareholders.reduce(
    (sum, sh) => sum + (Number(sh.capitalContribution) || 0),
    0
  );

  if (totalCapital > 0) {
    for (const sh of shareholders) {
      const contribution = Number(sh.capitalContribution) || 0;
      const percentage = Math.round((contribution / totalCapital) * 100 * 100) / 100;
      await txClient.shareholder.update({
        where: { id: sh.id },
        data: {
          ownershipPercentage: percentage,
          votingRightsPercentage: percentage,
          distributionPercentage: percentage,
        },
      });
    }
  }
}

// POST /api/shareholders/onboard
// Complete onboarding: creates Person + Shareholder + optional User in one transaction
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.SHAREHOLDERS_CREATE);
    if (!check.authorized) return check.error!;

    if (!check.tenantId) {
      return NextResponse.json(
        { error: "Kein Mandant zugeordnet" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validatedData = onboardingSchema.parse(body);

    const { personalData, participation, portalAccess } = validatedData;

    // Verify the fund exists and belongs to this tenant
    const fund = await prisma.fund.findFirst({
      where: {
        id: participation.fundId,
        tenantId: check.tenantId,
      },
    });

    if (!fund) {
      return NextResponse.json(
        { error: "Gesellschaft nicht gefunden" },
        { status: 404 }
      );
    }

    // Check if a user with this email already exists (if portal access requested)
    if (portalAccess.createPortalAccess) {
      const existingUser = await prisma.user.findUnique({
        where: { email: personalData.email },
      });

      if (existingUser) {
        return NextResponse.json(
          {
            error: `Ein Benutzer mit der E-Mail-Adresse "${personalData.email}" existiert bereits.`,
          },
          { status: 409 }
        );
      }
    }

    // Prepare portal access if needed
    let temporaryPassword: string | undefined;
    let passwordHash: string | undefined;

    if (portalAccess.createPortalAccess) {
      temporaryPassword = generateTemporaryPassword();
      passwordHash = await bcrypt.hash(temporaryPassword, 12);
    }

    // Execute everything in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the Person
      const person = await tx.person.create({
        data: {
          personType: "natural",
          salutation: personalData.salutation || null,
          firstName: personalData.firstName,
          lastName: personalData.lastName,
          email: personalData.email,
          phone: personalData.phone || null,
          street: personalData.street || null,
          houseNumber: personalData.houseNumber || null,
          postalCode: personalData.postalCode || null,
          city: personalData.city || null,
          taxId: personalData.taxId || null,
          tenantId: check.tenantId!,
        },
      });

      // 2. Check for duplicate shareholder
      const existingShareholder = await tx.shareholder.findFirst({
        where: {
          fundId: participation.fundId,
          personId: person.id,
        },
      });

      if (existingShareholder) {
        throw new Error("Diese Person ist bereits Gesellschafter in dieser Gesellschaft");
      }

      // 3. Create the Shareholder
      const shareholder = await tx.shareholder.create({
        data: {
          fundId: participation.fundId,
          personId: person.id,
          shareholderNumber: participation.shareholderNumber || null,
          entryDate: new Date(participation.entryDate),
          capitalContribution: participation.capitalContribution,
          status: "ACTIVE",
        },
      });

      // 4. Recalculate fund ownership percentages
      await recalculateFundShares(participation.fundId, tx);

      // 5. Create portal user if requested
      let portalAccessCreated = false;
      let userId: string | undefined;

      if (portalAccess.createPortalAccess && passwordHash) {
        // Find the Portal-Benutzer system role
        const portalRole = await tx.role.findFirst({
          where: {
            name: "Portal-Benutzer",
            isSystem: true,
          },
        });

        if (!portalRole) {
          logger.error("System role 'Portal-Benutzer' not found in database");
          throw new Error(
            "Die Systemrolle 'Portal-Benutzer' wurde nicht gefunden. Bitte kontaktieren Sie den Administrator."
          );
        }

        // Create user account
        const newUser = await tx.user.create({
          data: {
            email: personalData.email,
            firstName: personalData.firstName,
            lastName: personalData.lastName,
            passwordHash,
            role: "VIEWER",
            tenantId: check.tenantId!,
            status: "ACTIVE",
          },
        });

        userId = newUser.id;

        // Link shareholder to user
        await tx.shareholder.update({
          where: { id: shareholder.id },
          data: { userId: newUser.id },
        });

        // Assign Portal-Benutzer role
        await tx.userRoleAssignment.create({
          data: {
            userId: newUser.id,
            roleId: portalRole.id,
            resourceType: "__global__",
            resourceIds: [],
            createdBy: check.userId,
          },
        });

        portalAccessCreated = true;
      }

      return {
        personId: person.id,
        shareholderId: shareholder.id,
        portalAccessCreated,
        userId,
      };
    });

    logger.info(
      {
        personId: result.personId,
        shareholderId: result.shareholderId,
        portalAccessCreated: result.portalAccessCreated,
        fundId: participation.fundId,
      },
      "Shareholder onboarding completed"
    );

    // Send portal invitation email if portal access was created
    let emailSent = false;
    if (result.portalAccessCreated && temporaryPassword) {
      const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login`;
      const userName =
        [personalData.firstName, personalData.lastName].filter(Boolean).join(" ") ||
        "Gesellschafter";

      try {
        const emailResult = await sendTemplatedEmailSync(
          "portal-invitation",
          {
            userName,
            email: personalData.email,
            temporaryPassword,
            loginUrl,
          },
          personalData.email,
          check.tenantId!
        );
        emailSent = emailResult.success;
        if (!emailResult.success) {
          logger.warn(
            { error: emailResult.error, to: personalData.email },
            "Failed to send portal invitation email during onboarding"
          );
        }
      } catch (emailError) {
        logger.warn(
          { err: emailError, to: personalData.email },
          "Error sending portal invitation email during onboarding"
        );
      }
    }

    return NextResponse.json(
      {
        personId: result.personId,
        shareholderId: result.shareholderId,
        portalAccessCreated: result.portalAccessCreated,
        temporaryPassword: result.portalAccessCreated ? temporaryPassword : undefined,
        emailSent,
        documentsUploaded: 0,
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

    if (error instanceof Error) {
      // Known business logic errors
      if (
        error.message.includes("bereits Gesellschafter") ||
        error.message.includes("Systemrolle") ||
        error.message.includes("E-Mail-Adresse")
      ) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    logger.error({ err: error }, "Error during shareholder onboarding");
    return NextResponse.json(
      { error: "Fehler beim Anlegen des Gesellschafters" },
      { status: 500 }
    );
  }
}
