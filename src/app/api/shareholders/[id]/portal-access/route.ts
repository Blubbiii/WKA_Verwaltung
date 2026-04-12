import { NextRequest, NextResponse, after } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { apiLogger as logger } from "@/lib/logger";
import { sendTemplatedEmailSync } from "@/lib/email/sender";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { AUTH_CONFIG } from "@/lib/config/auth-config";
import { apiError } from "@/lib/api-errors";

/**
 * Generate a cryptographically secure temporary password.
 * Format: 16 characters of base64url-safe characters.
 */
function generateTemporaryPassword(): string {
  return randomBytes(12).toString("base64url");
}

// GET /api/shareholders/[id]/portal-access
// Check portal access status for a shareholder
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.SHAREHOLDERS_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const shareholder = await prisma.shareholder.findFirst({
      where: {
        id,
        fund: {
          tenantId: check.tenantId,
        },
      },
      include: {
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            companyName: true,
            email: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            status: true,
            lastLoginAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!shareholder) {
      return apiError("NOT_FOUND", undefined, { message: "Gesellschafter nicht gefunden" });
    }

    return NextResponse.json({
      hasAccess: !!shareholder.userId && !!shareholder.user,
      user: shareholder.user
        ? {
            id: shareholder.user.id,
            email: shareholder.user.email,
            status: shareholder.user.status,
            lastLoginAt: shareholder.user.lastLoginAt,
            createdAt: shareholder.user.createdAt,
          }
        : null,
      person: {
        id: shareholder.person.id,
        firstName: shareholder.person.firstName,
        lastName: shareholder.person.lastName,
        companyName: shareholder.person.companyName,
        email: shareholder.person.email,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error checking portal access status");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Prüfen des Portal-Zugangs" });
  }
}

// POST /api/shareholders/[id]/portal-access
// Create portal user account for a shareholder
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.SHAREHOLDERS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Load shareholder with person and fund relations
    const shareholder = await prisma.shareholder.findFirst({
      where: {
        id,
        fund: {
          tenantId: check.tenantId,
        },
      },
      include: {
        person: true,
        fund: {
          include: {
            fundParks: {
              include: {
                park: {
                  select: { tenantId: true },
                },
              },
              take: 1,
            },
          },
        },
        user: {
          select: { id: true },
        },
      },
    });

    if (!shareholder) {
      return apiError("NOT_FOUND", undefined, { message: "Gesellschafter nicht gefunden" });
    }

    // Check if portal access already exists
    if (shareholder.userId && shareholder.user) {
      return apiError("CONFLICT", undefined, { message: "Dieser Gesellschafter hat bereits einen Portal-Zugang" });
    }

    // Validate that the person has an email address
    if (!shareholder.person.email) {
      return apiError("BAD_REQUEST", undefined, { message: "Die Kontaktperson hat keine E-Mail-Adresse. Bitte zuerst eine E-Mail-Adresse hinterlegen." });
    }

    // Check if a user with this email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: shareholder.person.email },
      select: { id: true },
    });

    if (existingUser) {
      return apiError("CONFLICT", undefined, { message: `Ein Benutzer mit der E-Mail-Adresse "${shareholder.person.email}" existiert bereits. Bitte verwenden Sie eine andere E-Mail-Adresse.` });
    }

    // Find the Portal-Benutzer system role
    const portalRole = await prisma.role.findFirst({
      where: {
        name: "Portal-Benutzer",
        isSystem: true,
      },
    });

    if (!portalRole) {
      logger.error("System role 'Portal-Benutzer' not found in database");
      return apiError("NOT_FOUND", 500, { message: "Die Systemrolle 'Portal-Benutzer' wurde nicht gefunden. Bitte kontaktieren Sie den Administrator." });
    }

    // Determine tenantId: use person's tenantId, or fund's tenant, or from park
    const tenantId =
      shareholder.person.tenantId ||
      shareholder.fund.tenantId ||
      shareholder.fund.fundParks[0]?.park?.tenantId;

    if (!tenantId) {
      return apiError("INTERNAL_ERROR", undefined, { message: "Mandant konnte nicht ermittelt werden" });
    }

    // Generate temporary password
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, AUTH_CONFIG.bcryptSaltRounds);

    // Determine name fields
    const firstName = shareholder.person.firstName || null;
    const lastName =
      shareholder.person.lastName ||
      shareholder.person.companyName ||
      "Portal-Benutzer";

    // Execute everything in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the user account
      const newUser = await tx.user.create({
        data: {
          email: shareholder.person.email!,
          firstName,
          lastName,
          passwordHash,
          tenantId,
          status: "ACTIVE",
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
          createdAt: true,
        },
      });

      // 2. Link shareholder to user
      await tx.shareholder.update({
        where: { id: shareholder.id },
        data: { userId: newUser.id },
      });

      // 3. Assign Portal-Benutzer role
      await tx.userRoleAssignment.create({
        data: {
          userId: newUser.id,
          roleId: portalRole.id,
          resourceType: "__global__",
          resourceIds: [],
          createdBy: check.userId,
        },
      });

      return newUser;
    });

    // Audit log (deferred: runs after response is sent)
    const newUserId = result.id;
    const newUserEmail = result.email;
    const newUserFirstName = result.firstName;
    const newUserLastName = result.lastName;
    const shareholderId = shareholder.id;
    after(async () => {
      await createAuditLog({
        action: "CREATE",
        entityType: "User",
        entityId: newUserId,
        newValues: {
          email: newUserEmail,
          firstName: newUserFirstName,
          lastName: newUserLastName,
          shareholderId,
          portalAccess: true,
        },
      });
    });

    logger.info(
      {
        shareholderId: shareholder.id,
        userId: result.id,
        email: result.email,
      },
      "Portal access created for shareholder"
    );

    // Send portal invitation email with credentials
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login`;
    const userName =
      [shareholder.person.firstName, shareholder.person.lastName].filter(Boolean).join(" ") ||
      shareholder.person.companyName ||
      "Gesellschafter";

    let emailSent = false;
    try {
      const emailResult = await sendTemplatedEmailSync(
        "portal-invitation",
        {
          userName,
          email: result.email,
          temporaryPassword,
          loginUrl,
        },
        result.email,
        tenantId
      );
      emailSent = emailResult.success;
      if (!emailResult.success) {
        logger.warn(
          { error: emailResult.error, to: result.email },
          "Failed to send portal invitation email"
        );
      }
    } catch (emailError) {
      logger.warn(
        { err: emailError, to: result.email },
        "Error sending portal invitation email"
      );
    }

    return NextResponse.json(
      {
        user: result,
        temporaryPassword,
        emailSent,
        message: emailSent
          ? "Portal-Zugang wurde erstellt. Die Zugangsdaten wurden per E-Mail versendet."
          : "Portal-Zugang wurde erstellt. Die Zugangsdaten konnten nicht per E-Mail versendet werden.",
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ err: error }, "Error creating portal access");
    return apiError("CREATE_FAILED", undefined, { message: "Fehler beim Erstellen des Portal-Zugangs" });
  }
}

// DELETE /api/shareholders/[id]/portal-access
// Remove portal access for a shareholder (unlink user, remove role assignment)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.SHAREHOLDERS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const shareholder = await prisma.shareholder.findFirst({
      where: {
        id,
        fund: {
          tenantId: check.tenantId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!shareholder) {
      return apiError("NOT_FOUND", undefined, { message: "Gesellschafter nicht gefunden" });
    }

    if (!shareholder.userId || !shareholder.user) {
      return apiError("BAD_REQUEST", undefined, { message: "Dieser Gesellschafter hat keinen Portal-Zugang" });
    }

    const userId = shareholder.userId;

    // Find the Portal-Benutzer role to remove its assignment
    const portalRole = await prisma.role.findFirst({
      where: {
        name: "Portal-Benutzer",
        isSystem: true,
      },
    });

    // Execute in a transaction
    await prisma.$transaction(async (tx) => {
      // 1. Unlink shareholder from user
      await tx.shareholder.update({
        where: { id: shareholder.id },
        data: { userId: null },
      });

      // 2. Remove Portal-Benutzer role assignment (if role exists)
      if (portalRole) {
        await tx.userRoleAssignment.deleteMany({
          where: {
            userId,
            roleId: portalRole.id,
          },
        });
      }
    });

    // Audit log (deferred: runs after response is sent)
    const revokedShareholderId = shareholder.id;
    const revokedUserId = userId;
    const revokedUserEmail = shareholder.user.email;
    after(async () => {
      await createAuditLog({
        action: "UPDATE",
        entityType: "Shareholder",
        entityId: revokedShareholderId,
        oldValues: {
          userId: revokedUserId,
          userEmail: revokedUserEmail,
          portalAccess: true,
        },
        newValues: {
          userId: null,
          portalAccess: false,
        },
      });
    });

    logger.info(
      {
        shareholderId: shareholder.id,
        userId,
        email: shareholder.user.email,
      },
      "Portal access removed for shareholder"
    );

    return NextResponse.json({
      success: true,
      message:
        "Portal-Zugang wurde entfernt. Das Benutzerkonto bleibt bestehen, ist aber nicht mehr mit dem Gesellschafter verknuepft.",
    });
  } catch (error) {
    logger.error({ err: error }, "Error removing portal access");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Entfernen des Portal-Zugangs" });
  }
}
