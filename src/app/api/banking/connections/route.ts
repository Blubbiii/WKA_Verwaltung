/**
 * GET  /api/banking/connections — Bankverbindungen für den automatischen Abruf
 * POST /api/banking/connections — Verbindung anlegen
 *
 * B7 (Audit 2026-07).
 *
 * ## Der Push-Token wird EINMAL angezeigt und nie gespeichert
 *
 * In der Datenbank steht nur sein Hash. Ein gespeicherter Token wäre ein
 * Zugang zum Kontoauszug, der bei jedem Datenbank-Dump mitwandert. Geht er
 * verloren, wird ein neuer erzeugt — das ist der geringere Schaden.
 *
 * ## Warum EBICS und FinTS anlegbar sind, obwohl sie nicht laufen
 *
 * Die Freischaltung bei der Bank dauert Wochen. Die Verbindung vorher zu
 * erfassen und auf `SETUP_PENDING` zu führen bildet genau diesen Zustand ab.
 * Der Abruf meldet dann, was noch fehlt — statt still nichts zu tun.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { encrypt } from "@/lib/email/encryption";
import { getProvider, type ProviderName } from "@/lib/bank-import/providers";

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  bankAccountIban: z.string().trim().min(15).max(34),
  provider: z.enum(["FILE_DROP", "EBICS", "FINTS"]).default("FILE_DROP"),
  schedule: z.string().trim().max(50).nullable().optional(),
  /** Zugangsdaten. Werden verschlüsselt abgelegt. */
  credentials: z.record(z.string(), z.unknown()).nullable().optional(),
  notes: z.string().nullable().optional(),
});

/** Token-Hash — derselbe Algorithmus wie bei der Prüfung. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function GET() {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const connections = await prisma.bankConnection.findMany({
      where: { tenantId: check.tenantId! },
      include: {
        runs: {
          orderBy: { startedAt: "desc" },
          take: 5,
          select: {
            id: true,
            status: true,
            startedAt: true,
            finishedAt: true,
            transactionsImported: true,
            transactionsDuplicate: true,
            transactionsMatched: true,
            errorMessage: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const enriched = connections.map((connection) => {
      const provider = getProvider(connection.provider as ProviderName);
      return {
        ...connection,
        // Zugangsdaten gehen NIE an den Client zurück, auch nicht
        // verschlüsselt.
        credentials: undefined,
        pushTokenHash: undefined,
        hasPushToken: connection.pushTokenHash !== null,
        providerOperational: provider.isOperational,
      };
    });

    return NextResponse.json({ data: enriched });
  } catch (error) {
    logger.error({ err: error }, "[Banking] Verbindungen konnten nicht geladen werden");
    return apiError("FETCH_FAILED", 500, {
      message: "Bankverbindungen konnten nicht geladen werden",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:create");
    if (!check.authorized) return check.error;

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe",
        details: { issues: parsed.error.issues },
      });
    }
    const data = parsed.data;

    const iban = data.bankAccountIban.replace(/\s+/g, "").toUpperCase();

    const existing = await prisma.bankConnection.findFirst({
      where: {
        tenantId: check.tenantId!,
        bankAccountIban: iban,
        provider: data.provider,
      },
      select: { id: true },
    });
    if (existing) {
      return apiError("CONFLICT", 409, {
        message: "Für dieses Konto und Verfahren gibt es bereits eine Verbindung",
      });
    }

    const provider = getProvider(data.provider);

    // Nur FILE_DROP bekommt einen Token — die anderen Verfahren holen selbst
    // ab und brauchen keinen Endpunkt.
    let pushToken: string | null = null;
    if (data.provider === "FILE_DROP") {
      pushToken = randomBytes(32).toString("base64url");
    }

    const connection = await prisma.bankConnection.create({
      data: {
        tenantId: check.tenantId!,
        name: data.name,
        bankAccountIban: iban,
        provider: data.provider,
        // FILE_DROP ist sofort einsatzbereit; EBICS und FinTS warten auf die
        // Freischaltung bei der Bank.
        status: provider.isOperational ? "ACTIVE" : "SETUP_PENDING",
        schedule: data.schedule || null,
        credentials: data.credentials ? encrypt(JSON.stringify(data.credentials)) : null,
        pushTokenHash: pushToken ? hashToken(pushToken) : null,
        notes: data.notes || null,
        createdById: check.userId,
      },
    });

    await createAuditLog({
      action: "CREATE",
      entityType: "BankConnection",
      entityId: connection.id,
      newValues: { name: data.name, provider: data.provider, iban },
      description: `Bankverbindung „${data.name}" angelegt (${data.provider})`,
    });

    const warnings: string[] = [];
    if (!provider.isOperational) {
      warnings.push(
        `${data.provider} ist in dieser Installation nicht eingerichtet. Die Verbindung steht auf „Einrichtung offen"; der Abruf meldet, was noch fehlt.`,
      );
    }

    return NextResponse.json(
      {
        connection: { ...connection, credentials: undefined, pushTokenHash: undefined },
        // EINMALIG. Danach ist er nicht mehr abrufbar — gespeichert wird nur
        // sein Hash.
        pushToken,
        pushUrl: pushToken ? `/api/banking/connections/${connection.id}/push` : null,
        warnings,
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error({ err: error }, "[Banking] Verbindung konnte nicht angelegt werden");
    return apiError("CREATE_FAILED", 500, {
      message: "Bankverbindung konnte nicht angelegt werden",
    });
  }
}
