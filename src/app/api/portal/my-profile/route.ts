import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

// Validation schema for profile updates
const updateProfileSchema = z.object({
  email: z.string().email("Ungueltige E-Mail-Adresse").optional(),
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
    .regex(/^[A-Z]{2}[0-9A-Z]+$/, "Ungueltiges IBAN-Format")
    .optional()
    .nullable()
    .or(z.literal("")),
  bic: z
    .string()
    .max(11, "BIC zu lang")
    .regex(/^[A-Z0-9]+$/, "Ungueltiges BIC-Format")
    .optional()
    .nullable()
    .or(z.literal("")),
});

// GET /api/portal/my-profile - Get profile data for the current user
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    // Find the shareholder linked to this user
    const shareholder = await prisma.shareholder.findUnique({
      where: { userId: session.user.id },
      include: {
        person: true,
      },
    });

    if (!shareholder) {
      return NextResponse.json(
        { error: "Kein Gesellschafterprofil verknuepft" },
        { status: 404 }
      );
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
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// PATCH /api/portal/my-profile - Update profile data
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    // Find the shareholder linked to this user
    const shareholder = await prisma.shareholder.findUnique({
      where: { userId: session.user.id },
      include: {
        person: true,
      },
    });

    if (!shareholder) {
      return NextResponse.json(
        { error: "Kein Gesellschafterprofil verknuepft" },
        { status: 404 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const parsed = updateProfileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Ungueltige Eingabedaten",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
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

    if (bankName !== undefined) {
      updateData.bankName = bankName;
    }

    if (iban !== undefined) {
      // Normalize IBAN: remove spaces, convert to uppercase
      updateData.bankIban = iban ? iban.replace(/\s/g, "").toUpperCase() : null;
    }

    if (bic !== undefined) {
      // Normalize BIC: remove spaces, convert to uppercase
      updateData.bankBic = bic ? bic.replace(/\s/g, "").toUpperCase() : null;
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Keine Felder zum Aktualisieren angegeben" },
        { status: 400 }
      );
    }

    // Update the person record
    const updatedPerson = await prisma.person.update({
      where: { id: shareholder.personId },
      data: updateData,
    });

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
        bankName: updatedPerson.bankName,
        iban: updatedPerson.bankIban,
        bic: updatedPerson.bankBic,
        taxId: updatedPerson.taxId,
        shareholderNumber: shareholder.shareholderNumber,
        personType: updatedPerson.personType,
      },
      message: "Profil erfolgreich aktualisiert",
    });
  } catch (error) {
    logger.error({ err: error }, "Error updating profile");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
