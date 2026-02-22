import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const nodeSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name ist erforderlich"),
  type: z.enum([
    "TURBINE",
    "CABLE_JUNCTION",
    "TRANSFORMER",
    "NVP",
    "SUBSTATION",
  ]),
  posX: z.number().min(0).max(100),
  posY: z.number().min(0).max(100),
  turbineId: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});

const connectionSchema = z.object({
  id: z.string().optional(),
  fromNodeId: z.string(),
  toNodeId: z.string(),
  cableType: z.string().nullable().optional(),
  lengthM: z.number().nonnegative().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});

const saveTopologySchema = z.object({
  parkId: z.string().min(1, "Park-ID ist erforderlich"),
  nodes: z.array(nodeSchema),
  connections: z.array(connectionSchema),
});

// =============================================================================
// GET /api/energy/topology - Get topology for a park
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId");

    if (!parkId) {
      return NextResponse.json(
        { error: "parkId Parameter ist erforderlich" },
        { status: 400 }
      );
    }

    // Verify park belongs to tenant
    const park = await prisma.park.findFirst({
      where: {
        id: parkId,
        tenantId: check.tenantId!,
      },
      select: {
        id: true,
        name: true,
        shortName: true,
      },
    });

    if (!park) {
      return NextResponse.json(
        { error: "Park nicht gefunden oder keine Berechtigung" },
        { status: 404 }
      );
    }

    // Fetch nodes with turbine data
    const nodes = await prisma.networkNode.findMany({
      where: {
        tenantId: check.tenantId!,
        parkId,
      },
      include: {
        turbine: {
          select: {
            id: true,
            designation: true,
            manufacturer: true,
            model: true,
            ratedPowerKw: true,
            status: true,
            deviceType: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Fetch connections
    const connections = await prisma.networkConnection.findMany({
      where: {
        tenantId: check.tenantId!,
        fromNode: { parkId },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      nodes,
      connections,
      park,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching topology");
    return NextResponse.json(
      { error: "Fehler beim Laden der Topologie" },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST /api/energy/topology - Save topology (upsert nodes and connections)
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:create");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const validated = saveTopologySchema.parse(body);

    // Verify park belongs to tenant
    const park = await prisma.park.findFirst({
      where: {
        id: validated.parkId,
        tenantId: check.tenantId!,
      },
      select: { id: true },
    });

    if (!park) {
      return NextResponse.json(
        { error: "Park nicht gefunden oder keine Berechtigung" },
        { status: 404 }
      );
    }

    // Run full save in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Delete all existing connections for this park first (FK constraint)
      await tx.networkConnection.deleteMany({
        where: {
          tenantId: check.tenantId!,
          fromNode: { parkId: validated.parkId },
        },
      });

      // 2. Delete all existing nodes for this park
      await tx.networkNode.deleteMany({
        where: {
          tenantId: check.tenantId!,
          parkId: validated.parkId,
        },
      });

      // 3. Create all nodes (assign new IDs, build ID map for connections)
      const idMap = new Map<string, string>();
      const createdNodes = [];

      for (const node of validated.nodes) {
        const created = await tx.networkNode.create({
          data: {
            tenantId: check.tenantId!,
            parkId: validated.parkId,
            name: node.name,
            type: node.type,
            posX: node.posX,
            posY: node.posY,
            turbineId: node.turbineId ?? null,
            metadata: node.metadata ?? undefined,
          },
          include: {
            turbine: {
              select: {
                id: true,
                designation: true,
                manufacturer: true,
                model: true,
                ratedPowerKw: true,
                status: true,
                deviceType: true,
              },
            },
          },
        });

        // Map old ID (from frontend) to new ID (from database)
        if (node.id) {
          idMap.set(node.id, created.id);
        }
        createdNodes.push(created);
      }

      // 4. Create all connections using the ID map
      const createdConnections = [];

      for (const conn of validated.connections) {
        const fromId = idMap.get(conn.fromNodeId) ?? conn.fromNodeId;
        const toId = idMap.get(conn.toNodeId) ?? conn.toNodeId;

        const created = await tx.networkConnection.create({
          data: {
            tenantId: check.tenantId!,
            fromNodeId: fromId,
            toNodeId: toId,
            cableType: conn.cableType ?? null,
            lengthM: conn.lengthM ?? null,
            metadata: conn.metadata ?? undefined,
          },
        });
        createdConnections.push(created);
      }

      return {
        nodes: createdNodes,
        connections: createdConnections,
      };
    });

    return NextResponse.json(
      {
        ...result,
        park: { id: validated.parkId },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error saving topology");
    return NextResponse.json(
      { error: "Fehler beim Speichern der Topologie" },
      { status: 500 }
    );
  }
}
