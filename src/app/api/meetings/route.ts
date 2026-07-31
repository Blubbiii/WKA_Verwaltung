/**
 * GET  /api/meetings — Gesellschafterversammlungen, mit Fristen- und Quorumsprüfung
 * POST /api/meetings — Versammlung anlegen, Anwesenheitsliste aus dem Anteilsverlauf
 *
 * B4 (Audit 2026-07): „`Vote`, `VoteProxy` und `Mailing` existieren jeweils
 * einzeln. Es fehlt die Klammer."
 *
 * ## Warum die Anwesenheitsliste beim Anlegen gefüllt wird
 *
 * Sie braucht den Anteilsstand ZUM VERSAMMLUNGSTAG, und den liefert der
 * Anteilsverlauf aus A8. Ihn erst beim Protokollieren zu ziehen wäre zu spät:
 * bis dahin kann ein Anteil übergegangen sein, und dann stünde in der Liste
 * eine Quote, die am Versammlungstag nicht galt.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { shareRegisterAt } from "@/lib/shareholding/distribution-split";
import {
  resolveShareholderSharesFrom,
  SHAREHOLDER_SHARES_SELECT,
} from "@/lib/shareholding/resolve-shares";
import {
  summarizeAttendance,
  checkQuorum,
  checkNoticePeriod,
  type AttendanceRow,
} from "@/lib/meetings/resolution";

const createSchema = z.object({
  fundId: z.string().uuid(),
  type: z.enum(["ORDINARY", "EXTRAORDINARY", "WRITTEN_PROCEDURE"]).default("ORDINARY"),
  scheduledAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  location: z.string().trim().max(300).nullable().optional(),
  isVirtual: z.boolean().default(false),
  noticePeriodDays: z.number().int().min(0).max(365).default(14),
  quorumPercent: z.number().min(0).max(100).nullable().optional(),
  chairperson: z.string().trim().max(200).nullable().optional(),
  minuteTaker: z.string().trim().max(200).nullable().optional(),
  notes: z.string().nullable().optional(),
  /** Tagesordnung gleich mitgeben. */
  agendaItems: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(300),
        description: z.string().nullable().optional(),
        requiresResolution: z.boolean().default(true),
        requiredMajorityPercent: z.number().min(0).max(100).default(50),
        majorityBase: z.enum(["VOTES_CAST", "CAPITAL_PRESENT", "CAPITAL_TOTAL"]).default("VOTES_CAST"),
      }),
    )
    .max(50)
    .default([]),
});

const PREFIX = "GV";
const DIGITS = 3;

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.SHAREHOLDERS_READ);
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const fundId = searchParams.get("fundId");
    const status = searchParams.get("status");

    const meetings = await prisma.shareholderMeeting.findMany({
      where: {
        tenantId: check.tenantId!,
        ...(fundId ? { fundId } : {}),
        ...(status ? { status: status as never } : {}),
      },
      include: {
        fund: { select: { id: true, name: true } },
        agendaItems: { orderBy: { position: "asc" } },
        attendance: {
          include: {
            shareholder: {
              select: {
                id: true,
                shareholderNumber: true,
                person: {
                  select: { id: true, firstName: true, lastName: true, companyName: true },
                },
              },
            },
          },
        },
      },
      orderBy: { scheduledAt: "desc" },
    });

    // Fristen- und Quorumsprüfung mitliefern. Sie sind der eigentliche Zweck
    // des Vorgangs und gehören nicht in einen separaten Aufruf.
    const withChecks = meetings.map((meeting) => {
      const rows: AttendanceRow[] = meeting.attendance.map((entry) => ({
        shareholderId: entry.shareholderId,
        presence: entry.presence,
        sharePercent: Number(entry.sharePercent),
      }));

      const attendance = summarizeAttendance(rows);
      const quorum = checkQuorum(
        attendance,
        meeting.quorumPercent === null ? null : Number(meeting.quorumPercent),
      );
      const notice = checkNoticePeriod({
        invitationSentAt: meeting.invitationSentAt,
        scheduledAt: meeting.scheduledAt,
        requiredDays: meeting.noticePeriodDays,
        waivedByAll: meeting.noticeWaivedByAll,
      });

      return { ...meeting, attendanceSummary: attendance, quorum, notice };
    });

    return NextResponse.json({ data: withChecks });
  } catch (error) {
    logger.error({ err: error }, "[Meetings] Liste konnte nicht geladen werden");
    return apiError("FETCH_FAILED", 500, { message: "Versammlungen konnten nicht geladen werden" });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.SHAREHOLDERS_UPDATE);
    if (!check.authorized) return check.error;

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe",
        details: { issues: parsed.error.issues },
      });
    }
    const data = parsed.data;
    const scheduledAt = new Date(`${data.scheduledAt}T00:00:00.000Z`);

    const fund = await prisma.fund.findFirst({
      where: { id: data.fundId, tenantId: check.tenantId! },
      select: {
        id: true,
        name: true,
        shareholders: {
          select: {
            id: true,
            entryDate: true,
            exitDate: true,
            ownershipPercentage: true,
            distributionPercentage: true,
            shareHistory: SHAREHOLDER_SHARES_SELECT,
          },
        },
      },
    });

    if (!fund) {
      return apiError("NOT_FOUND", 404, { message: "Gesellschaft nicht gefunden" });
    }

    // Anteilsstand ZUM VERSAMMLUNGSTAG. Ausdrücklich nicht „heute".
    const resolved = resolveShareholderSharesFrom(fund.shareholders);
    const register = shareRegisterAt(resolved.shares, scheduledAt);

    if (register.length === 0) {
      return apiError("BAD_REQUEST", undefined, {
        message:
          "Zum Versammlungstag ist kein Gesellschafter beteiligt. Bitte Beteiligungsquoten und Ein-/Austrittsdaten prüfen.",
      });
    }

    const meetingNumber = await nextMeetingNumber(check.tenantId!, scheduledAt);

    const meeting = await prisma.$transaction(async (tx) => {
      const created = await tx.shareholderMeeting.create({
        data: {
          tenantId: check.tenantId!,
          fundId: data.fundId,
          meetingNumber,
          type: data.type,
          scheduledAt,
          location: data.location || null,
          isVirtual: data.isVirtual,
          noticePeriodDays: data.noticePeriodDays,
          quorumPercent: data.quorumPercent ?? null,
          chairperson: data.chairperson || null,
          minuteTaker: data.minuteTaker || null,
          notes: data.notes || null,
          createdById: check.userId,
        },
      });

      if (data.agendaItems.length > 0) {
        await tx.meetingAgendaItem.createMany({
          data: data.agendaItems.map((item, index) => ({
            meetingId: created.id,
            position: index + 1,
            title: item.title,
            description: item.description || null,
            requiresResolution: item.requiresResolution,
            requiredMajorityPercent: item.requiredMajorityPercent,
            majorityBase: item.majorityBase,
          })),
        });
      }

      // Alle zum Stichtag Beteiligten als ABWESEND vorbelegen. Wer erscheint,
      // wird umgestellt — so fehlt niemand in der Liste, und der Anteil ist
      // festgehalten, bevor er sich ändern kann.
      await tx.meetingAttendance.createMany({
        data: register.map((entry) => ({
          meetingId: created.id,
          shareholderId: entry.shareholderId,
          presence: "ABSENT" as const,
          sharePercent: entry.sharePercent,
        })),
      });

      return created;
    });

    await createAuditLog({
      action: "CREATE",
      entityType: "Fund",
      entityId: data.fundId,
      newValues: {
        meetingId: meeting.id,
        meetingNumber,
        scheduledAt: data.scheduledAt,
        shareholdersOnRegister: register.length,
      },
      description: `Gesellschafterversammlung ${meetingNumber} für ${fund.name} angelegt`,
    });

    const warnings = [...resolved.warnings];
    const sumPercent = register.reduce((sum, entry) => sum + entry.sharePercent, 0);
    if (Math.abs(sumPercent - 100) > 0.011) {
      warnings.push(
        `Die Anteile zum Versammlungstag ergeben ${sumPercent.toFixed(2)} % statt 100 %. Die Beschlussfähigkeit lässt sich damit nicht sicher feststellen.`,
      );
    }

    return NextResponse.json({ meeting, attendanceCount: register.length, warnings }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "[Meetings] Anlegen fehlgeschlagen");
    return apiError("CREATE_FAILED", 500, { message: "Versammlung konnte nicht angelegt werden" });
  }
}

async function nextMeetingNumber(tenantId: string, reference: Date): Promise<string> {
  const year = reference.getUTCFullYear();
  const prefix = `${PREFIX}-${year}-`;

  const latest = await prisma.shareholderMeeting.findFirst({
    where: { tenantId, meetingNumber: { startsWith: prefix } },
    orderBy: { meetingNumber: "desc" },
    select: { meetingNumber: true },
  });

  const last = latest ? Number.parseInt(latest.meetingNumber.slice(prefix.length), 10) : 0;
  const next = Number.isFinite(last) ? last + 1 : 1;
  return `${prefix}${String(next).padStart(DIGITS, "0")}`;
}
