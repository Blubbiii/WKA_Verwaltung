/**
 * POST /api/plots/import-shp/confirm
 *
 * Execute the shapefile import: create Person records, Plot records, and
 * Lease records (with LeasePlots) inside a single Prisma transaction.
 *
 * Expects a JSON body with the parsed features, confirmed field mappings,
 * target park, and lease defaults.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  applyPlotMapping,
  applyOwnerMapping,
  type PlotMappableField,
  type OwnerMappableField,
} from "@/lib/shapefile/field-mapping";
import { apiLogger as logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Request validation schema
// ---------------------------------------------------------------------------

const featureSchema = z.object({
  index: z.number(),
  geometry: z.unknown(),
  properties: z.record(z.unknown()),
  centroid: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional()
    .nullable(),
  areaSqm: z.number().optional().nullable(),
  // Pre-computed owner group key from the wizard (ensures grouping matches
  // what the user reviewed in the owner step)
  ownerGroupKey: z.string().optional(),
});

const ownerOverrideSchema = z.object({
  name: z.string(),
  skip: z.boolean(),
});

const importConfirmSchema = z.object({
  parkId: z.string().uuid("Ungültige Park-ID").optional().or(z.literal("")),
  plotMapping: z.record(z.string().nullable()),
  ownerMapping: z.record(z.string().nullable()),
  features: z.array(featureSchema).min(1, "Keine Features zum Importieren"),
  ownerOverrides: z.record(ownerOverrideSchema).optional(),
  leaseDefaults: z.object({
    startDate: z.string().min(1, "Startdatum ist erforderlich"),
    status: z.enum(["DRAFT", "ACTIVE"]),
  }),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkippedFeature {
  plotNumber: string;
  cadastralDistrict: string;
  reason: string;
  ownerNames: string;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // -- Auth & permission check (need plots:create AND leases:create) --
    const check = await requirePermission(
      [PERMISSIONS.PLOTS_CREATE, PERMISSIONS.LEASES_CREATE],
      { requireAll: true },
    );
    if (!check.authorized) return check.error!;

    const tenantId = check.tenantId!;

    // -- Parse and validate request body --
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Ungültiger Request-Body (kein gültiges JSON)." },
        { status: 400 },
      );
    }

    const parsed = importConfirmSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: parsed.error.errors },
        { status: 400 },
      );
    }

    const { parkId: rawParkId, plotMapping, ownerMapping, features, ownerOverrides, leaseDefaults } =
      parsed.data;

    // Normalize: empty string -> undefined
    const parkId = rawParkId && rawParkId.length > 0 ? rawParkId : undefined;

    // -- Verify park belongs to tenant (only if parkId was provided) --
    if (parkId) {
      const park = await prisma.park.findFirst({
        where: { id: parkId, tenantId },
      });
      if (!park) {
        return NextResponse.json(
          { error: "Park nicht gefunden oder gehört nicht zu diesem Mandanten." },
          { status: 404 },
        );
      }
    }

    // -- Cast mappings to typed records --
    const typedPlotMapping = plotMapping as Record<
      PlotMappableField,
      string | null
    >;
    const typedOwnerMapping = ownerMapping as Record<
      OwnerMappableField,
      string | null
    >;

    // -- Execute import in a transaction --
    const result = await prisma.$transaction(
      async (tx) => {
        const skipped: SkippedFeature[] = [];
        const errors: string[] = [];

        // Track created entities
        let personsCreated = 0;
        let personsReused = 0;
        let plotsCreated = 0;
        let leasesCreated = 0;

        // ---------------------------------------------------------------
        // Phase 1: Apply mappings and separate valid / skipped features
        // ---------------------------------------------------------------

        interface ProcessedFeature {
          index: number;
          plotData: ReturnType<typeof applyPlotMapping>;
          ownerData: ReturnType<typeof applyOwnerMapping>;
          geometry: unknown;
          centroid: { lat: number; lng: number } | null;
          areaSqm: number | null;
          ownerGroupKey: string;
        }

        /**
         * Compute a fallback owner group key from owner data.
         * Priority: combined name > firstName+lastName > lastName > firstName
         * This matches the wizard's key computation.
         */
        function computeOwnerGroupKey(od: ReturnType<typeof applyOwnerMapping>): string {
          const fullName =
            od.name
            || ((od.firstName && od.lastName) ? `${od.firstName} ${od.lastName}` : null)
            || od.lastName
            || od.firstName
            || "";
          if (!fullName) return "__no_owner__";
          return fullName.trim().replace(/\s+/g, " ").toLowerCase();
        }

        let validFeatures: ProcessedFeature[] = [];

        for (const feature of features) {
          const plotData = applyPlotMapping(
            feature.properties,
            typedPlotMapping,
          );
          const ownerData = applyOwnerMapping(
            feature.properties,
            typedOwnerMapping,
          );

          // Skip multi-owner features
          if (ownerData.isMultiOwner) {
            skipped.push({
              plotNumber: plotData.plotNumber || "?",
              cadastralDistrict: plotData.cadastralDistrict || "?",
              reason:
                "Mehrere Eigentümer erkannt - manuell zuordnen",
              ownerNames: ownerData.name || "Unbekannt",
            });
            continue;
          }

          // Skip features without required plot data
          if (!plotData.cadastralDistrict && !plotData.plotNumber) {
            skipped.push({
              plotNumber: plotData.plotNumber || "?",
              cadastralDistrict: plotData.cadastralDistrict || "?",
              reason:
                "Keine Gemarkung und kein Flurstück erkannt",
              ownerNames: ownerData.name || "Unbekannt",
            });
            continue;
          }

          // Use wizard's pre-computed key if available, otherwise compute
          const groupKey = feature.ownerGroupKey || computeOwnerGroupKey(ownerData);

          validFeatures.push({
            index: feature.index,
            plotData,
            ownerData,
            geometry: feature.geometry,
            centroid: feature.centroid ?? null,
            areaSqm: feature.areaSqm ?? plotData.areaSqm ?? null,
            ownerGroupKey: groupKey,
          });
        }

        // ---------------------------------------------------------------
        // Phase 1.5: Apply owner overrides from the review step
        // ---------------------------------------------------------------

        if (ownerOverrides && Object.keys(ownerOverrides).length > 0) {
          for (const vf of validFeatures) {
            const od = vf.ownerData;
            // Use the pre-computed ownerGroupKey for override matching
            const override = ownerOverrides[vf.ownerGroupKey];

            // Skipped owner: plot still gets created, but no lease
            if (override?.skip) {
              vf.ownerGroupKey = "__no_owner__";
              continue;
            }

            // Apply name override (for person creation + grouping)
            if (override?.name) {
              const overrideName = override.name.trim();
              od.name = overrideName;
              // Try to split into first/last for person creation
              const parts = overrideName.split(/\s+/);
              if (parts.length >= 2) {
                od.firstName = parts.slice(0, -1).join(" ");
                od.lastName = parts[parts.length - 1];
              } else {
                od.firstName = null;
                od.lastName = null;
              }
              // Update group key to the overridden name
              vf.ownerGroupKey = overrideName.replace(/\s+/g, " ").toLowerCase();
            }
          }
        }

        // ---------------------------------------------------------------
        // Phase 2: Group features by owner for lease creation
        //   Uses the ownerGroupKey from each feature (pre-computed by
        //   the wizard or derived in Phase 1). This ensures grouping
        //   matches exactly what the user reviewed.
        // ---------------------------------------------------------------

        // Map from owner key -> { ownerData, featureIndices[] }
        const ownerGroups = new Map<
          string,
          {
            ownerData: ReturnType<typeof applyOwnerMapping>;
            featureIndices: number[];
          }
        >();

        for (let i = 0; i < validFeatures.length; i++) {
          const key = validFeatures[i].ownerGroupKey;
          const group = ownerGroups.get(key);
          if (group) {
            group.featureIndices.push(i);
          } else {
            ownerGroups.set(key, {
              ownerData: validFeatures[i].ownerData,
              featureIndices: [i],
            });
          }
        }

        // ---------------------------------------------------------------
        // Phase 3: Create Persons (find existing or create new)
        // ---------------------------------------------------------------

        // Map from owner key -> person ID
        const ownerToPersonId = new Map<string, string>();

        for (const [key, group] of ownerGroups) {
          // Skip the "no owner" group - plots without owner get no lease
          if (key === "__no_owner__") continue;

          const od = group.ownerData;
          let personId: string | null = null;

          // Try to find existing person (case-insensitive)
          if (od.firstName && od.lastName) {
            // Natural person lookup
            const existing = await tx.person.findFirst({
              where: {
                tenantId,
                firstName: { equals: od.firstName.trim(), mode: "insensitive" },
                lastName: { equals: od.lastName.trim(), mode: "insensitive" },
              },
              select: { id: true },
            });
            if (existing) {
              personId = existing.id;
              personsReused++;
            }
          } else if (od.name) {
            // Legal entity / company lookup
            const existing = await tx.person.findFirst({
              where: {
                tenantId,
                companyName: { equals: od.name.trim(), mode: "insensitive" },
              },
              select: { id: true },
            });
            if (existing) {
              personId = existing.id;
              personsReused++;
            }
          }

          // Create new person if not found
          if (!personId) {
            const isNatural = !!(od.firstName && od.lastName);
            const person = await tx.person.create({
              data: {
                personType: isNatural ? "natural" : "legal",
                firstName: od.firstName || null,
                lastName: od.lastName || null,
                companyName:
                  !od.firstName && !od.lastName ? od.name : null,
                street: od.street || null,
                houseNumber: od.houseNumber || null,
                postalCode: od.postalCode || null,
                city: od.city || null,
                tenantId,
              },
            });
            personId = person.id;
            personsCreated++;
          }

          ownerToPersonId.set(key, personId);
        }

        // ---------------------------------------------------------------
        // Phase 4: Create Plots
        // ---------------------------------------------------------------

        // Map from validFeatures index -> created plot ID
        const featureToPlotId = new Map<number, string>();

        for (let i = 0; i < validFeatures.length; i++) {
          const vf = validFeatures[i];
          const pd = vf.plotData;

          // Check for existing duplicate BEFORE creating (PostgreSQL aborts
          // the entire transaction on any error, so we cannot rely on
          // catching P2002 within an interactive transaction).
          const existing = await tx.plot.findFirst({
            where: {
              tenantId,
              cadastralDistrict: pd.cadastralDistrict || "Unbekannt",
              fieldNumber: pd.fieldNumber || "0",
              plotNumber: pd.plotNumber || "0",
            },
            select: { id: true },
          });

          if (existing) {
            skipped.push({
              plotNumber: pd.plotNumber || "?",
              cadastralDistrict: pd.cadastralDistrict || "?",
              reason: "Duplikat - Flurstück existiert bereits",
              ownerNames: vf.ownerData.name || "Unbekannt",
            });

            // Remove feature from its owner group so we don't create
            // a lease referencing a non-existent plot
            const group = ownerGroups.get(vf.ownerGroupKey);
            if (group) {
              group.featureIndices = group.featureIndices.filter(
                (idx) => idx !== i,
              );
            }

            // Optionally link the existing plot to this owner's lease
            featureToPlotId.set(i, existing.id);
            continue;
          }

          {
            const plot = await tx.plot.create({
              data: {
                cadastralDistrict: pd.cadastralDistrict || "Unbekannt",
                fieldNumber: pd.fieldNumber || "0",
                plotNumber: pd.plotNumber || "0",
                areaSqm: vf.areaSqm != null
                  ? new Prisma.Decimal(vf.areaSqm)
                  : null,
                county: pd.county || null,
                municipality: pd.municipality || null,
                usageType: pd.usageType || null,
                latitude: vf.centroid?.lat != null
                  ? new Prisma.Decimal(vf.centroid.lat)
                  : null,
                longitude: vf.centroid?.lng != null
                  ? new Prisma.Decimal(vf.centroid.lng)
                  : null,
                geometry: vf.geometry as Prisma.InputJsonValue,
                parkId: parkId ?? null,
                tenantId,
              },
            });

            featureToPlotId.set(i, plot.id);
            plotsCreated++;
          }
        }

        // ---------------------------------------------------------------
        // Phase 5: Create Leases (one per owner group) with LeasePlots
        // ---------------------------------------------------------------

        for (const [key, group] of ownerGroups) {
          if (key === "__no_owner__") continue;

          const personId = ownerToPersonId.get(key);
          if (!personId) continue;

          // Collect the plot IDs for this owner's features
          const plotIds = group.featureIndices
            .map((idx) => featureToPlotId.get(idx))
            .filter((id): id is string => id !== undefined);

          if (plotIds.length === 0) continue;

          await tx.lease.create({
            data: {
              lessorId: personId,
              startDate: new Date(leaseDefaults.startDate),
              status: leaseDefaults.status,
              tenantId,
              leasePlots: {
                create: plotIds.map((plotId) => ({ plotId })),
              },
            },
          });
          leasesCreated++;
        }

        return {
          personsCreated,
          personsReused,
          plotsCreated,
          leasesCreated,
          skipped,
          errors,
        };
      },
      {
        // Allow longer timeout for large imports (5 minutes)
        timeout: 300_000,
      },
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 },
      );
    }
    logger.error({ err: error }, "Error executing SHP import");
    return NextResponse.json(
      { error: "Interner Serverfehler beim Ausführen des Shapefile-Imports." },
      { status: 500 },
    );
  }
}
