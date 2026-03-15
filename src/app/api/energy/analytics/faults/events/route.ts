import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/energy/analytics/faults/events
// Paginated list of SCADA state events with status code lookup
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const { searchParams } = new URL(request.url);

    const parkId = searchParams.get("parkId");
    const yearParam = searchParams.get("year");
    const stateFilter = searchParams.get("state"); // e.g. "14" or "14.41"
    const faultOnly = searchParams.get("faultOnly") === "true";
    const search = searchParams.get("search")?.trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(10, parseInt(searchParams.get("pageSize") || "50", 10)));

    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "Ungültiges Jahr (2000-2100 erwartet)" },
        { status: 400 }
      );
    }

    const from = new Date(year, 0, 1);
    const to = new Date(year + 1, 0, 1);

    // Build turbine filter
    const turbineWhere: Record<string, unknown> = {
      park: { tenantId },
      deviceType: "WEA",
    };
    if (parkId && parkId !== "all") {
      turbineWhere.parkId = parkId;
    }

    const turbines = await prisma.turbine.findMany({
      where: turbineWhere,
      select: { id: true, designation: true, controllerType: true },
    });

    if (turbines.length === 0) {
      return NextResponse.json({ events: [], total: 0, page, pageSize });
    }

    const turbineIds = turbines.map((t) => t.id);
    const turbineMap = new Map(turbines.map((t) => [t.id, t]));

    // Build event filter
    const eventWhere: Record<string, unknown> = {
      tenantId,
      turbineId: { in: turbineIds },
      timestamp: { gte: from, lt: to },
    };

    if (faultOnly) {
      eventWhere.isFault = true;
    }

    // State filter: "14" or "14.41"
    if (stateFilter) {
      const parts = stateFilter.split(".");
      const mainState = parseInt(parts[0], 10);
      if (!isNaN(mainState)) {
        eventWhere.state = mainState;
        if (parts[1]) {
          const sub = parseInt(parts[1], 10);
          if (!isNaN(sub)) {
            eventWhere.subState = sub;
          }
        }
      }
    }

    // Count + fetch in parallel
    const [total, events] = await Promise.all([
      prisma.scadaStateEvent.count({ where: eventWhere }),
      prisma.scadaStateEvent.findMany({
        where: eventWhere,
        orderBy: { timestamp: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          timestamp: true,
          state: true,
          subState: true,
          isFault: true,
          isService: true,
          windSpeedAtEvent: true,
          turbineId: true,
        },
      }),
    ]);

    // Build status code lookup for the turbines' controller types
    const controllerTypes = [
      ...new Set(
        turbines.map((t) => t.controllerType).filter(Boolean) as string[]
      ),
    ];

    let codeLookup = new Map<
      string,
      { description: string; parentLabel: string | null }
    >();

    if (controllerTypes.length > 0) {
      const codes = await prisma.scadaStatusCode.findMany({
        where: {
          controllerType: { in: controllerTypes },
          codeType: "STATUS",
        },
        select: {
          mainCode: true,
          subCode: true,
          description: true,
          parentLabel: true,
        },
      });

      codeLookup = new Map(
        codes.map((c) => [
          `${c.mainCode}:${c.subCode}`,
          { description: c.description, parentLabel: c.parentLabel },
        ])
      );
    }

    // If search is provided, filter by description match (post-lookup)
    // We do this after fetching because the search is against the code list, not the events
    let enrichedEvents = events.map((e) => {
      const turbine = turbineMap.get(e.turbineId);
      const codeInfo = codeLookup.get(`${e.state}:${e.subState}`);

      return {
        id: e.id,
        timestamp: e.timestamp,
        state: e.state,
        subState: e.subState,
        isFault: e.isFault,
        isService: e.isService,
        windSpeed: e.windSpeedAtEvent ? Number(e.windSpeedAtEvent) : null,
        turbineDesignation: turbine?.designation || "—",
        description: codeInfo?.description || null,
        parentLabel: codeInfo?.parentLabel || null,
        label: codeInfo
          ? `(${e.state}.${e.subState}) ${codeInfo.parentLabel ? codeInfo.parentLabel + " — " : ""}${codeInfo.description}`
          : `(${e.state}.${e.subState})`,
      };
    });

    // Client-side search filter on description/label
    if (search) {
      const lowerSearch = search.toLowerCase();
      enrichedEvents = enrichedEvents.filter(
        (e) =>
          e.label.toLowerCase().includes(lowerSearch) ||
          (e.description && e.description.toLowerCase().includes(lowerSearch)) ||
          `${e.state}.${e.subState}`.includes(search)
      );
    }

    return NextResponse.json({
      events: enrichedEvents,
      total: search ? enrichedEvents.length : total,
      page,
      pageSize,
      totalPages: Math.ceil((search ? enrichedEvents.length : total) / pageSize),
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der Störungsereignisse");
    return NextResponse.json(
      { error: "Fehler beim Laden der Störungsereignisse" },
      { status: 500 }
    );
  }
}
