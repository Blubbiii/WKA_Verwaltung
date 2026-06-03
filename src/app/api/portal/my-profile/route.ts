import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// Validation schema for profile updates
const updateProfileSchema = z.object({
  email: z.string().email("Ungültige E-Mail-Adresse").optional(),
  phone: z.string().max(50, "Telefonnummer zu lang").optional().nullable(),
  address: z
    .object({
      street: z.string().max(200).optional().nullable(),
      postalCode: z.string().max(20).optional().nullable(),
      city: z.string().max(100).optional().nullable(),
      country: z.string().max(100).optional().nullable(),
    })
    .optional(),
  bankName: z.string().max(100, "Bankname zu lang").optional().nullable(),
  iban: z
    .string()
    .max(34, "IBAN zu lang")
    .regex(/^[A-Z]{2}[0-9A-Z]+$/, "Ungültiges IBAN-Format")
    .optional()
    .nullable()
    .or(z.literal("")),
  bic: z
    .string()
    .max(11, "BIC zu lang")
    .regex(/^[A-Z0-9]+$/, "Ungültiges BIC-Format")
    .optional()
    .nullable()
    .or(z.literal("")),
});

// GET /api/portal/my-profile - Get profile data for the current user
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return apiError("FORBIDDEN", 401, { message: "Nicht autorisiert" });
    }

    // Find the shareholder linked to this user
    const shareholder = await prisma.shareholder.findUnique({
      where: { userId: session.user.id },
      include: {
        person: true,
      },
    });

    if (!shareholder) {
      return apiError("NOT_FOUND", undefined, { message: "Kein Gesellschafterprofil verknuepft" });
    }

    const person = shareholder.person;

    // Build full name based on person type
    const name =
      person.personType === "legal"
        ? person.companyName || ""
        : `${person.salutation ? person.salutation + " " : ""}${person.firstName || ""} ${person.lastName || ""}`.trim();

    // Build address object
    const address = {
      street: person.street,
      postalCode: person.postalCode,
      city: person.city,
      country: person.country,
    };

    return NextResponse.json({
      data: {
        id: shareholder.id,
        personId: person.id,
        name,
        email: person.email,
        phone: person.phone,
        address,
        bankName: person.bankName,
        iban: person.bankIban,
        bic: person.bankBic,
        taxId: person.taxId,
        // Additional info
        shareholderNumber: shareholder.shareholderNumber,
        personType: person.personType,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching profile");
    return apiError("INTERNAL_ERROR", undefined, { message: "Interner Serverfehler" });
  }
}

// PATCH /api/portal/my-profile - Update profile data
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return apiError("FORBIDDEN", 401, { message: "Nicht autorisiert" });
    }

    // Find the shareholder linked to this user
    const shareholder = await prisma.shareholder.findUnique({
      where: { userId: session.user.id },
      include: {
        person: true,
      },
    });

    if (!shareholder) {
      return apiError("NOT_FOUND", undefined, { message: "Kein Gesellschafterprofil verknuepft" });
    }

    // Parse and validate request body
    const body = await request.json();
    const parsed = updateProfileSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Eingabedaten", details: parsed.error.flatten().fieldErrors });
    }

    const { email, phone, address, bankName, iban, bic } = parsed.data;

    // Build update object for Person model
     

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};

    if (email !== undefined) {
      updateData.email = email;
    }

    if (phone !== undefined) {
      updateData.phone = phone;
    }

    if (address !== undefined) {
      if (address.street !== undefined) updateData.street = address.street;
      if (address.postalCode !== undefined)
        updateData.postalCode = address.postalCode;
      if (address.city !== undefined) updateData.city = address.city;
      if (address.country !== undefined) updateData.country = address.country;
    }

    // PF-3 Betrugsschutz: Bankdaten landen in PendingBankUpdate (Approval-Workflow).
    // Sie werden NICHT direkt in Person geschrieben.
    const normalizedIban = iban !== undefined && iban ? iban.replace(/\s/g, "").toUpperCase() : iban === null ? null : undefined;
    const normalizedBic = bic !== undefined && bic ? bic.replace(/\s/g, "").toUpperCase() : bic === null ? null : undefined;

    const hasBankChange =
      (normalizedIban !== undefined && normalizedIban !== shareholder.person.bankIban) ||
      (normalizedBic !== undefined && normalizedBic !== shareholder.person.bankBic) ||
      (bankName !== undefined && bankName !== shareholder.person.bankName);

    let pendingBankUpdateCreated = false;
    if (hasBankChange) {
      await prisma.pendingBankUpdate.create({
        data: {
          personId: shareholder.personId,
          tenantId: session.user.tenantId!,
          requestedIban: normalizedIban !== undefined ? normalizedIban : shareholder.person.bankIban,
          requestedBic: normalizedBic !== undefined ? normalizedBic : shareholder.person.bankBic,
          requestedBankName: bankName !== undefined ? bankName : shareholder.person.bankName,
          previousIban: shareholder.person.bankIban,
          previousBic: shareholder.person.bankBic,
          previousBankName: shareholder.person.bankName,
          requestedByUserId: session.user.id,
          status: "PENDING",
        },
      });
      pendingBankUpdateCreated = true;

      // Fire-and-forget Admin-Notification (uses existing notification system)
      import("@/lib/notifications")
        .then(({ createNotification }) => {
          // Notify all tenant admins via in-app notification.
          // Email-Versand kann hier ergänzt werden, siehe TODO unten.
          return prisma.user
            .findMany({
              where: { tenantId: session.user.tenantId, status: "ACTIVE" },
              select: { id: true },
            })
            .then((users) =>
              Promise.all(
                users.map((u) =>
                  createNotification({
                    tenantId: session.user.tenantId!,
                    userId: u.id,
                    type: "SYSTEM",
                    title: "Neue Bankdaten-Änderung zur Freigabe",
                    message: `Gesellschafter hat neue Bankdaten beantragt. Bitte prüfen.`,
                    link: "/admin/bank-update-requests",
                  }).catch(() => null)
                )
              )
            );
        })
        .catch((err) => logger.warn({ err }, "Bank-update admin notification failed"));
    }

    // Non-bank fields werden direkt persistiert
    if (Object.keys(updateData).length === 0 && !pendingBankUpdateCreated) {
      return apiError("BAD_REQUEST", undefined, { message: "Keine Felder zum Aktualisieren angegeben" });
    }

    const updatedPerson = Object.keys(updateData).length > 0
      ? await prisma.person.update({
          where: { id: shareholder.personId, tenantId: session.user.tenantId },
          data: updateData,
        })
      : shareholder.person;

    // Build response with updated data
    const name =
      updatedPerson.personType === "legal"
        ? updatedPerson.companyName || ""
        : `${updatedPerson.salutation ? updatedPerson.salutation + " " : ""}${updatedPerson.firstName || ""} ${updatedPerson.lastName || ""}`.trim();

    const updatedAddress = {
      street: updatedPerson.street,
      postalCode: updatedPerson.postalCode,
      city: updatedPerson.city,
      country: updatedPerson.country,
    };

    return NextResponse.json({
      data: {
        id: shareholder.id,
        personId: updatedPerson.id,
        name,
        email: updatedPerson.email,
        phone: updatedPerson.phone,
        address: updatedAddress,
        // Bei pending bank change: zeige weiter aktuelle (noch nicht geänderte) Bankdaten
        bankName: updatedPerson.bankName,
        iban: updatedPerson.bankIban,
        bic: updatedPerson.bankBic,
        taxId: updatedPerson.taxId,
        shareholderNumber: shareholder.shareholderNumber,
        personType: updatedPerson.personType,
      },
      pendingBankUpdate: pendingBankUpdateCreated,
      message: pendingBankUpdateCreated
        ? "Profil aktualisiert. Bankdaten-Änderung wartet auf Admin-Freigabe."
        : "Profil erfolgreich aktualisiert",
    });
  } catch (error) {
    logger.error({ err: error }, "Error updating profile");
    return apiError("INTERNAL_ERROR", undefined, { message: "Interner Serverfehler" });
  }
}
