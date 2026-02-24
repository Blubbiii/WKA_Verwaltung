/**
 * BEISPIEL: Verwendung des ResourceAccess Systems
 *
 * Diese Datei zeigt, wie das ResourceAccess-System in API-Routes und
 * Server-Komponenten verwendet werden kann.
 *
 * NICHT für Produktion - nur als Dokumentation/Referenz!
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  hasResourceAccess,
  grantResourceAccess,
  getAccessibleResourceIds,
  RESOURCE_TYPES,
  ACCESS_LEVELS,
} from "./resourceAccess";
import {
  filterByResourceAccess,
  buildResourceWhereClause,
  hasAccessToItem,
  hasWriteAccess,
} from "./resourceFilter";
import { PERMISSIONS } from "./permissions";

// =============================================================================
// BEISPIEL 1: Einfache Zugriffsprüfung
// =============================================================================

export async function beispielEinfacheZugriffsprüfung() {
  const userId = "user-123";
  const parkId = "park-456";

  // Pruefe ob User Lesezugriff auf den Park hat
  const canRead = await hasResourceAccess(
    userId,
    RESOURCE_TYPES.PARK,
    parkId,
    ACCESS_LEVELS.READ
  );

  if (!canRead) {
    return { error: "Kein Zugriff auf diesen Windpark" };
  }

  // User hat Zugriff - Daten laden...
  const park = await prisma.park.findUnique({ where: { id: parkId } });
  return park;
}

// =============================================================================
// BEISPIEL 2: Liste filtern (In-Memory)
// =============================================================================

export async function beispielListeFiltern(userId: string) {
  // Alle Parks laden
  const allParks = await prisma.park.findMany();

  // Filtern nach Zugriff
  const result = await filterByResourceAccess(
    userId,
    allParks,
    RESOURCE_TYPES.PARK,
    "id", // ID-Feld
    PERMISSIONS.PARKS_READ // Optional: Permission
  );

  // result.filteredCount / result.totalCount zeigt sichtbare Parks
  // result.hasResourceRestrictions zeigt ob Einschraenkungen aktiv sind

  return result.items;
}

// =============================================================================
// BEISPIEL 3: Prisma Query mit WHERE-Clause
// =============================================================================

export async function beispielPrismaQuery(userId: string) {
  // WHERE-Clause für Ressourcen-Filterung generieren
  const resourceWhere = await buildResourceWhereClause(
    userId,
    RESOURCE_TYPES.PARK,
    PERMISSIONS.PARKS_READ,
    "id"
  );

  // Query mit Filterung
  const parks = await prisma.park.findMany({
    where: {
      status: "ACTIVE",
      // Ressourcen-Filter hinzufügen (falls vorhanden)
      ...(resourceWhere && resourceWhere),
    },
    orderBy: { name: "asc" },
  });

  return parks;
}

// =============================================================================
// BEISPIEL 4: API-Route mit Zugriffskontrolle
// =============================================================================

export async function GET_parks_beispiel(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const userId = session.user.id;

  // Alle Parks laden (mit Tenant-Filter)
  const allParks = await prisma.park.findMany({
    where: { tenantId: session.user.tenantId },
  });

  // Nach Zugriff filtern
  const { items, hasResourceRestrictions } = await filterByResourceAccess(
    userId,
    allParks,
    RESOURCE_TYPES.PARK,
    "id",
    PERMISSIONS.PARKS_READ
  );

  return NextResponse.json({
    data: items,
    meta: {
      total: items.length,
      restricted: hasResourceRestrictions,
    },
  });
}

// =============================================================================
// BEISPIEL 5: Einzelnes Item prüfen
// =============================================================================

export async function GET_park_detail_beispiel(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const parkId = params.id;
  const userId = session.user.id;

  // Prüfen ob User Zugriff hat (Rolle ODER direkt)
  const hasAccess = await hasAccessToItem(
    userId,
    RESOURCE_TYPES.PARK,
    parkId,
    PERMISSIONS.PARKS_READ
  );

  if (!hasAccess) {
    return NextResponse.json(
      { error: "Kein Zugriff auf diesen Windpark" },
      { status: 403 }
    );
  }

  // Daten laden...
  const park = await prisma.park.findUnique({
    where: { id: parkId },
    include: { turbines: true },
  });

  return NextResponse.json({ data: park });
}

// =============================================================================
// BEISPIEL 6: Update mit Schreibzugriff prüfen
// =============================================================================

export async function PATCH_park_beispiel(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const parkId = params.id;
  const userId = session.user.id;

  // Prüfen ob User SCHREIB-Zugriff hat
  const canWrite = await hasWriteAccess(
    userId,
    RESOURCE_TYPES.PARK,
    parkId,
    PERMISSIONS.PARKS_UPDATE
  );

  if (!canWrite) {
    return NextResponse.json(
      { error: "Keine Berechtigung zum Bearbeiten" },
      { status: 403 }
    );
  }

  const body = await request.json();

  // Update durchfuehren...
  const updated = await prisma.park.update({
    where: { id: parkId },
    data: body,
  });

  return NextResponse.json({ data: updated });
}

// =============================================================================
// BEISPIEL 7: Admin gewaehrt Zugriff
// =============================================================================

export async function POST_grant_access_beispiel(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !["SUPERADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const body = await request.json();
  const { userId, parkId, level } = body;

  // Zugriff gewaehren
  const access = await grantResourceAccess(
    userId,
    RESOURCE_TYPES.PARK,
    parkId,
    level, // "READ", "WRITE", oder "ADMIN"
    session.user.id, // Wer gewaehrt den Zugriff
    {
      notes: `Gewaehrt von ${session.user.name}`,
      // Optional: Ablaufdatum
      // expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 Tage
    }
  );

  return NextResponse.json({
    message: "Zugriff gewaehrt",
    data: access,
  });
}

// =============================================================================
// BEISPIEL 8: Dropdown/Select mit erlaubten Optionen
// =============================================================================

export async function GET_parks_dropdown_beispiel(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const userId = session.user.id;

  // Nur IDs holen auf die User Zugriff hat
  const accessibleIds = await getAccessibleResourceIds(
    userId,
    RESOURCE_TYPES.PARK,
    ACCESS_LEVELS.READ
  );

  // Nur diese Parks laden (effizient!)
  const parks = await prisma.park.findMany({
    where: {
      id: { in: accessibleIds },
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data: parks });
}
