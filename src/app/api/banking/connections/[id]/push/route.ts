/**
 * POST /api/banking/connections/[id]/push — Kontoauszug entgegennehmen
 *
 * B7 (Audit 2026-07). Das ist der Weg, über den der automatische Abruf ohne
 * Protokollimplementierung funktioniert: Bank oder Dienstleister schicken den
 * Auszug per geplantem Export hierher, und die Kette parsen → entdoppeln →
 * zuordnen → speichern läuft ohne Zutun.
 *
 * ## Auth über den Push-Token, nicht über eine Sitzung
 *
 * Der Aufrufer ist eine Maschine. Der Token gehört zur Verbindung, wird
 * timing-safe geprüft und liegt nur als Hash in der Datenbank.
 *
 * ## Derselbe Auszug wird nicht zweimal verarbeitet
 *
 * Die Prüfsumme entscheidet, bevor überhaupt geparst wird. Bei einem
 * Wiederholungslauf nach einem Fehler ist die Wiederholung der Regelfall — und
 * ein zweites Einlesen wären doppelte Buchungen.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { UPLOAD_LIMITS } from "@/lib/config/upload-limits";
import { ingestStatement, EmptyStatementError } from "@/lib/bank-import/ingest-service";
import { statementChecksum } from "@/lib/bank-import/ingest";
import { FAILURE_THRESHOLD } from "@/lib/bank-import/providers";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Vergleich in konstanter Zeit — der Token ist ein Zugang zum Kontoauszug. */
function hashesMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "hex");
  const bufferB = Buffer.from(b, "hex");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const auth = request.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

    if (!token) {
      return apiError("UNAUTHORIZED", 401, { message: "Push-Token fehlt" });
    }

    const connection = await prisma.bankConnection.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        name: true,
        bankAccountIban: true,
        provider: true,
        status: true,
        pushTokenHash: true,
        consecutiveFailures: true,
      },
    });

    // Gleiche Antwort für „gibt es nicht" und „falscher Token": sonst liesse
    // sich über die Fehlermeldung herausfinden, welche Verbindungen existieren.
    if (!connection || !connection.pushTokenHash || !hashesMatch(hashToken(token), connection.pushTokenHash)) {
      logger.warn({ connectionId: id }, "[Banking] Push mit ungültigem Token");
      return apiError("UNAUTHORIZED", 401, { message: "Ungültiger Push-Token" });
    }

    if (connection.provider !== "FILE_DROP") {
      return apiError("BAD_REQUEST", undefined, {
        message: `Diese Verbindung nutzt ${connection.provider} und nimmt keine Auszüge entgegen.`,
      });
    }
    if (connection.status === "PAUSED") {
      return apiError("BAD_REQUEST", undefined, {
        message: "Die Verbindung ist pausiert. Der Auszug wurde NICHT verarbeitet.",
      });
    }

    const formData = await request.formData().catch(() => null);
    const file = formData?.get("file") as File | null;
    const content = file ? await file.text() : await request.text();
    const fileName = file?.name ?? `push-${new Date().toISOString().slice(0, 10)}.sta`;

    if (!content.trim()) {
      return apiError("BAD_REQUEST", 400, { message: "Leerer Auszug" });
    }
    if (content.length > UPLOAD_LIMITS.bankImport) {
      return apiError("BAD_REQUEST", 400, { message: "Auszug zu groß" });
    }

    const checksum = await statementChecksum(content);

    // Vor dem Parsen prüfen: derselbe Auszug ein zweites Mal ist beim
    // Wiederholungslauf der Regelfall.
    const alreadySeen = await prisma.bankFetchRun.findFirst({
      where: { connectionId: connection.id, statementChecksum: checksum, status: "SUCCESS" },
      select: { id: true, startedAt: true, transactionsImported: true },
    });

    if (alreadySeen) {
      await prisma.bankFetchRun.create({
        data: {
          connectionId: connection.id,
          status: "SKIPPED",
          finishedAt: new Date(),
          statementChecksum: checksum,
          fileName,
          errorMessage: `Identischer Auszug wurde am ${alreadySeen.startedAt.toISOString().slice(0, 10)} bereits verarbeitet.`,
        },
      });
      return NextResponse.json({
        status: "SKIPPED",
        message: "Dieser Auszug wurde bereits verarbeitet — es wurde nichts gebucht.",
        previousRunAt: alreadySeen.startedAt,
      });
    }

    const run = await prisma.bankFetchRun.create({
      data: {
        connectionId: connection.id,
        status: "RUNNING",
        statementChecksum: checksum,
        fileName,
      },
    });

    try {
      const result = await ingestStatement({
        content,
        fileName,
        iban: connection.bankAccountIban,
        tenantId: connection.tenantId,
      });

      await prisma.$transaction([
        prisma.bankFetchRun.update({
          where: { id: run.id },
          data: {
            status: "SUCCESS",
            finishedAt: new Date(),
            transactionsFound: result.found,
            transactionsImported: result.imported,
            transactionsDuplicate: result.skipped,
            transactionsMatched: result.matched,
            importBatchId: result.batchId,
          },
        }),
        prisma.bankConnection.update({
          where: { id: connection.id },
          data: {
            lastRunAt: new Date(),
            lastSuccessAt: new Date(),
            // Nach einem Erfolg zurücksetzen — sonst blieben alte Fehler
            // ewig stehen und die Verbindung dauerhaft auf ERROR.
            consecutiveFailures: 0,
            lastError: null,
            status: "ACTIVE",
          },
        }),
      ]);

      return NextResponse.json({ status: "SUCCESS", ...result });
    } catch (error) {
      const message =
        error instanceof EmptyStatementError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unbekannter Fehler";

      const failures = connection.consecutiveFailures + 1;

      await prisma.$transaction([
        prisma.bankFetchRun.update({
          where: { id: run.id },
          data: { status: "FAILED", finishedAt: new Date(), errorMessage: message },
        }),
        prisma.bankConnection.update({
          where: { id: connection.id },
          data: {
            lastRunAt: new Date(),
            consecutiveFailures: failures,
            lastError: message,
            // Ein einzelner Fehler schaltet nichts ab; drei in Folge sind
            // kein Zufall mehr und müssen sichtbar werden.
            ...(failures >= FAILURE_THRESHOLD ? { status: "ERROR" as const } : {}),
          },
        }),
      ]);

      logger.error({ err: error, connectionId: connection.id }, "[Banking] Push fehlgeschlagen");
      return apiError("PROCESS_FAILED", 500, { message });
    }
  } catch (error) {
    logger.error({ err: error, connectionId: id }, "[Banking] Push-Endpunkt fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "Auszug konnte nicht verarbeitet werden" });
  }
}
