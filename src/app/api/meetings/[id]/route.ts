/**
 * PATCH /api/meetings/[id] — Versammlung fortschreiben
 *
 * Deckt die drei Schritte ab, die den Vorgang tragen:
 *   1. Einladung versandt (ab hier läuft die Ladungsfrist),
 *   2. Anwesenheit erfassen,
 *   3. Beschlüsse fassen und protokollieren.
 *
 * B4 (Audit 2026-07).
 *
 * ## Warum ein protokolliertes Ergebnis nicht mehr nachgerechnet wird
 *
 * Das Ergebnis wird beim Beschliessen gerechnet und MITGESPEICHERT — Anteil,
 * Basis und der Satz fürs Protokoll. Würde es bei jedem Aufruf neu abgeleitet,
 * änderte eine spätere Korrektur der Anwesenheitsliste rückwirkend ein
 * unterzeichnetes Protokoll. Das ist bei einem Beschlussbuch das Gegenteil von
 * dem, wofür es da ist.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import {
  summarizeAttendance,
  checkQuorum,
  checkNoticePeriod,
  evaluateResolution,
  type AttendanceRow,
} from "@/lib/meetings/resolution";

const patchSchema = z.object({
  /** Einladung als versandt vermerken. */
  invitationSentAt: z.string().nullable().optional(),
  noticeWaivedByAll: z.boolean().optional(),
  chairperson: z.string().trim().max(200).nullable().optional(),
  minuteTaker: z.string().trim().max(200).nullable().optional(),
  status: z.enum(["DRAFT", "INVITED", "HELD", "MINUTED", "CANCELLED"]).optional(),
  minutesDocumentId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),

  /** Anwesenheitsliste — ganz oder teilweise. */
  attendance: z
    .array(
      z.object({
        shareholderId: z.string().uuid(),
        presence: z.enum(["PRESENT", "REPRESENTED", "ABSENT"]),
        representedByPersonId: z.string().uuid().nullable().optional(),
        proxyId: z.string().uuid().nullable().optional(),
      }),
    )
    .max(500)
    .optional(),

  /** Beschlussfassung je Tagesordnungspunkt. */
  resolutions: z
    .array(
      z.object({
        agendaItemId: z.string().uuid(),
        resolutionText: z.string().nullable().optional(),
        votesInFavor: z.number().min(0),
        votesAgainst: z.number().min(0),
        votesAbstain: z.number().min(0),
        /** Ausdrücklich vertagen statt abstimmen. */
        defer: z.boolean().default(false),
      }),
    )
    .max(50)
    .optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.SHAREHOLDERS_UPDATE);
    if (!check.authorized) return check.error;

    const { id } = await params;
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe",
        details: { issues: parsed.error.issues },
      });
    }
    const data = parsed.data;

    const meeting = await prisma.shareholderMeeting.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: { attendance: true, agendaItems: true },
    });
    if (!meeting) {
      return apiError("NOT_FOUND", 404, { message: "Versammlung nicht gefunden" });
    }

    // Ein unterzeichnetes Protokoll ist der Abschluss der Nachweiskette. Es
    // nachträglich zu ändern hiesse, den Nachweis zu entwerten.
    if (meeting.status === "MINUTED" && data.status !== "MINUTED") {
      return apiError("BAD_REQUEST", undefined, {
        message:
          "Das Protokoll ist bereits abgeschlossen. Eine Änderung würde die Nachweiskette entwerten — bitte einen berichtigenden Beschluss fassen.",
      });
    }
    if (meeting.status === "CANCELLED") {
      return apiError("BAD_REQUEST", undefined, {
        message: "Eine abgesagte Versammlung kann nicht fortgeschrieben werden",
      });
    }

    const warnings: string[] = [];

    const updated = await prisma.$transaction(async (tx) => {
      // --- Anwesenheit --------------------------------------------------
      if (data.attendance) {
        const known = new Set(meeting.attendance.map((entry) => entry.shareholderId));
        for (const entry of data.attendance) {
          if (!known.has(entry.shareholderId)) {
            // Wer zum Versammlungstag nicht beteiligt war, gehört nicht in die
            // Liste. Ihn aufzunehmen würde die Basis der Beschlussfähigkeit
            // verfälschen.
            warnings.push(
              "Ein Gesellschafter steht nicht auf der Liste zum Versammlungstag und wurde übergangen.",
            );
            continue;
          }
          await tx.meetingAttendance.update({
            where: {
              meetingId_shareholderId: {
                meetingId: id,
                shareholderId: entry.shareholderId,
              },
            },
            data: {
              presence: entry.presence,
              representedByPersonId:
                entry.presence === "REPRESENTED" ? (entry.representedByPersonId ?? null) : null,
              proxyId: entry.presence === "REPRESENTED" ? (entry.proxyId ?? null) : null,
            },
          });
        }
      }

      // --- Beschluesse ---------------------------------------------------
      if (data.resolutions && data.resolutions.length > 0) {
        // Die Basis wird EINMAL aus dem aktuellen Stand der Anwesenheitsliste
        // gebildet und für alle Beschlüsse dieses Aufrufs verwendet.
        const rows = await tx.meetingAttendance.findMany({ where: { meetingId: id } });
        const summary = summarizeAttendance(
          rows.map<AttendanceRow>((row) => ({
            shareholderId: row.shareholderId,
            presence: row.presence,
            sharePercent: Number(row.sharePercent),
          })),
        );
        const quorum = checkQuorum(
          summary,
          meeting.quorumPercent === null ? null : Number(meeting.quorumPercent),
        );
        warnings.push(...quorum.warnings);

        for (const resolution of data.resolutions) {
          const item = meeting.agendaItems.find((entry) => entry.id === resolution.agendaItemId);
          if (!item) continue;

          if (resolution.defer || !item.requiresResolution) {
            await tx.meetingAgendaItem.update({
              where: { id: item.id },
              data: {
                outcome: resolution.defer ? "DEFERRED" : "NO_RESOLUTION",
                resolutionText: resolution.resolutionText ?? item.resolutionText,
                resultStatement: resolution.defer
                  ? "Der Punkt wurde vertagt."
                  : "Zu diesem Punkt wurde kein Beschluss gefasst.",
              },
            });
            continue;
          }

          const result = evaluateResolution({
            votes: {
              inFavor: resolution.votesInFavor,
              against: resolution.votesAgainst,
              abstain: resolution.votesAbstain,
            },
            base: item.majorityBase,
            requiredPercent: Number(item.requiredMajorityPercent),
            representedPercent: summary.representedPercent,
            isQuorate: quorum.isQuorate,
          });

          warnings.push(...result.warnings);

          await tx.meetingAgendaItem.update({
            where: { id: item.id },
            data: {
              resolutionText: resolution.resolutionText ?? item.resolutionText,
              votesInFavor: resolution.votesInFavor,
              votesAgainst: resolution.votesAgainst,
              votesAbstain: resolution.votesAbstain,
              // `null` bleibt `null`: kein Ergebnis ist nicht dasselbe wie
              // Ablehnung.
              outcome: result.adopted === null ? null : result.adopted ? "ADOPTED" : "REJECTED",
              achievedPercent: result.achievedPercent,
              // Mitgespeichert, damit eine spaetere Korrektur der Liste ein
              // unterzeichnetes Protokoll nicht rueckwirkend umrechnet.
              resultStatement: result.statement,
            },
          });
        }
      }

      // --- Kopfdaten -----------------------------------------------------
      return tx.shareholderMeeting.update({
        where: { id },
        data: {
          ...(data.invitationSentAt !== undefined
            ? {
                invitationSentAt: data.invitationSentAt ? new Date(data.invitationSentAt) : null,
                // Mit der Einladung geht die Versammlung von DRAFT auf INVITED.
                ...(data.invitationSentAt && meeting.status === "DRAFT"
                  ? { status: "INVITED" as const }
                  : {}),
              }
            : {}),
          ...(data.noticeWaivedByAll !== undefined
            ? { noticeWaivedByAll: data.noticeWaivedByAll }
            : {}),
          ...(data.chairperson !== undefined ? { chairperson: data.chairperson } : {}),
          ...(data.minuteTaker !== undefined ? { minuteTaker: data.minuteTaker } : {}),
          ...(data.minutesDocumentId !== undefined
            ? { minutesDocumentId: data.minutesDocumentId }
            : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.status
            ? {
                status: data.status,
                ...(data.status === "MINUTED" ? { minutesApprovedAt: new Date() } : {}),
              }
            : {}),
        },
      });
    });

    // Der Zustand nach der Änderung — er trägt die Sätze fürs Protokoll.
    const rows = await prisma.meetingAttendance.findMany({ where: { meetingId: id } });
    const summary = summarizeAttendance(
      rows.map<AttendanceRow>((row) => ({
        shareholderId: row.shareholderId,
        presence: row.presence,
        sharePercent: Number(row.sharePercent),
      })),
    );
    const quorum = checkQuorum(
      summary,
      updated.quorumPercent === null ? null : Number(updated.quorumPercent),
    );
    const notice = checkNoticePeriod({
      invitationSentAt: updated.invitationSentAt,
      scheduledAt: updated.scheduledAt,
      requiredDays: updated.noticePeriodDays,
      waivedByAll: updated.noticeWaivedByAll,
    });

    // Beim Abschliessen des Protokolls muss die Ladungsfrist stimmen — sonst
    // steht im Beschlussbuch ein anfechtbarer Beschluss ohne Vermerk.
    if (data.status === "MINUTED" && !notice.compliant) {
      warnings.push(notice.statement);
    }

    await createAuditLog({
      action: "UPDATE",
      entityType: "Fund",
      entityId: updated.fundId,
      oldValues: { status: meeting.status },
      newValues: {
        meetingId: id,
        status: updated.status,
        representedPercent: summary.representedPercent,
        isQuorate: quorum.isQuorate,
      },
      description: `Versammlung ${updated.meetingNumber} fortgeschrieben`,
    });

    return NextResponse.json({
      meeting: updated,
      attendanceSummary: summary,
      quorum,
      notice,
      warnings: [...new Set(warnings)],
    });
  } catch (error) {
    logger.error({ err: error }, "[Meetings] Fortschreiben fehlgeschlagen");
    return apiError("UPDATE_FAILED", 500, {
      message: "Versammlung konnte nicht fortgeschrieben werden",
    });
  }
}
