import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const deleteSchema = z.object({
  confirmation: z.literal("DELETE_MY_ACCOUNT"),
});

// POST /api/portal/my-account/delete — DSGVO Art. 17 Loeschrecht
// Anonymizes personal data and deactivates the user account
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Bestaetigung erforderlich: { confirmation: 'DELETE_MY_ACCOUNT' }" },
        { status: 400 }
      );
    }

    const userId = session.user.id;

    // Prevent admin from deleting themselves
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Benutzer nicht gefunden" }, { status: 404 });
    }

    if (user.role === "ADMIN") {
      return NextResponse.json(
        { error: "Administratoren koennen ihr Konto nicht selbst loeschen. Bitte kontaktieren Sie einen anderen Administrator." },
        { status: 403 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // Find linked shareholder + person
      const shareholder = await tx.shareholder.findUnique({
        where: { userId },
        select: { id: true, personId: true },
      });

      // Anonymize person data if exists
      if (shareholder) {
        await tx.person.update({
          where: { id: shareholder.personId },
          data: {
            firstName: "Geloescht",
            lastName: "Geloescht",
            companyName: null,
            email: `deleted-${userId}@anonymized.local`,
            phone: null,
            street: null,
            postalCode: null,
            city: null,
            country: "Geloescht",
            bankName: null,
            bankIban: null,
            bankBic: null,
            taxId: null,
          },
        });

        // Deactivate shareholder
        await tx.shareholder.update({
          where: { id: shareholder.id },
          data: { status: "INACTIVE" },
        });
      }

      // Delete sessions
      await tx.session.deleteMany({ where: { userId } });

      // Delete OAuth accounts
      await tx.account.deleteMany({ where: { userId } });

      // Anonymize user record (keep for audit trail integrity)
      await tx.user.update({
        where: { id: userId },
        data: {
          firstName: "Geloescht",
          lastName: "Benutzer",
          email: `deleted-${userId}@anonymized.local`,
          emailVerified: null,
          avatarUrl: null,
        },
      });

      // Create audit log entry
      const tenant = await tx.tenant.findFirst({ where: { status: "ACTIVE" } });
      await tx.auditLog.create({
        data: {
          tenantId: tenant?.id,
          userId,
          action: "ACCOUNT_DELETED",
          entityType: "User",
          entityId: userId,
          oldValues: { reason: "DSGVO Art. 17 - Antrag auf Loeschung" },
          ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
        },
      });
    });

    logger.info({ userId }, "User account deleted (Art. 17 DSGVO)");

    return NextResponse.json({
      message: "Ihr Konto wurde erfolgreich geloescht. Alle personenbezogenen Daten wurden anonymisiert.",
    });
  } catch (error) {
    logger.error({ err: error }, "Error deleting user account (Art. 17)");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
