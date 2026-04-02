/**
 * POST /api/gis/import/confirm
 *
 * Execute QGIS project import: create Plots, MapAnnotations, Persons,
 * and Leases based on the multi-layer preview data.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { applyPlotMapping, applyOwnerMapping } from "@/lib/shapefile/field-mapping";
import type { PlotMappableField, OwnerMappableField } from "@/lib/shapefile/field-mapping";
import { apiLogger as logger } from "@/lib/logger";

const featureSchema = z.object({
  id: z.number(),
  geometry: z.unknown(),
  properties: z.record(z.string(), z.unknown()),
  centroid: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),
  areaSqm: z.number().nullable().optional(),
});

const layerImportSchema = z.object({
  name: z.string(),
  type: z.enum(["PLOT", "WEA_STANDORT", "POOL_AREA", "CABLE_ROUTE", "ACCESS_ROAD", "COMPENSATION_AREA", "EXCLUSION_ZONE", "CUSTOM"]),
  features: z.array(featureSchema),
  plotMapping: z.record(z.string(), z.string().nullable()).optional(),
  ownerMapping: z.record(z.string(), z.string().nullable()).optional(),
  areaType: z.enum(["WEA_STANDORT", "POOL", "WEG", "AUSGLEICH", "KABEL"]).optional(),
  style: z.object({
    color: z.string().optional(),
    fillColor: z.string().optional(),
    fillOpacity: z.number().optional(),
    weight: z.number().optional(),
    dashArray: z.string().optional(),
  }).optional(),
});

const confirmSchema = z.object({
  parkId: z.string().min(1, "Park ist erforderlich"),
  layers: z.array(layerImportSchema).min(1),
  ownerEdits: z.record(z.string(), z.object({
    name: z.string(),
    skip: z.boolean(),
    matchedPersonId: z.string().optional(),
  })).optional(),
  leaseStartDate: z.string().optional(),
  leaseStatus: z.enum(["DRAFT", "ACTIVE"]).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.PLOTS_CREATE);
    if (!check.authorized) return check.error!;

    const tenantId = check.tenantId!;
    const body = await request.json();
    const data = confirmSchema.parse(body);

    // Verify park belongs to tenant
    const park = await prisma.park.findFirst({
      where: { id: data.parkId, tenantId },
      select: { id: true, name: true },
    });
    if (!park) {
      return NextResponse.json({ error: "Park nicht gefunden" }, { status: 404 });
    }

    let plotsCreated = 0;
    let annotationsCreated = 0;
    let personsCreated = 0;
    let personsReused = 0;
    let leasesCreated = 0;
    const skipped: { name: string; reason: string }[] = [];
    const errors: string[] = [];

    await prisma.$transaction(async (tx) => {
      // Person cache for deduplication
      const personCache = new Map<string, string>(); // name → personId

      for (const layer of data.layers) {
        const isPlotType = layer.type === "PLOT" || layer.type === "WEA_STANDORT";
        const isAnnotationType = !isPlotType;

        if (isAnnotationType) {
          // Create MapAnnotations for non-plot layers
          for (const feature of layer.features) {
            if (!feature.geometry) continue;

            // Determine annotation type
            const annotationType = (layer.type === "POOL_AREA" ? "POOL_AREA"
              : layer.type === "CABLE_ROUTE" ? "CABLE_ROUTE"
              : layer.type === "ACCESS_ROAD" ? "ACCESS_ROAD"
              : layer.type === "COMPENSATION_AREA" ? "COMPENSATION_AREA"
              : layer.type === "EXCLUSION_ZONE" ? "EXCLUSION_ZONE"
              : "CUSTOM") as "CABLE_ROUTE" | "COMPENSATION_AREA" | "ACCESS_ROAD" | "EXCLUSION_ZONE" | "POOL_AREA" | "CUSTOM";

            // Use first property value or layer name as annotation name
            const name = String(
              feature.properties["name"] || feature.properties["Name"] ||
              feature.properties["bezeichnung"] || feature.properties["Bezeichnung"] ||
              `${layer.name} ${feature.id + 1}`
            );

            // Check if updating existing annotation (QGIS roundtrip)
            const wpmId = feature.properties["_wpmId"] as string | undefined;
            if (wpmId) {
              const existingAnno = await tx.mapAnnotation.findFirst({
                where: { id: wpmId, tenantId },
              });
              if (existingAnno) {
                await tx.mapAnnotation.update({
                  where: { id: wpmId },
                  data: {
                    geometry: feature.geometry as Prisma.InputJsonValue,
                    style: layer.style ? (layer.style as Prisma.InputJsonValue) : undefined,
                    name,
                  },
                });
                annotationsCreated++;
                continue;
              }
            }

            await tx.mapAnnotation.create({
              data: {
                tenantId,
                parkId: data.parkId,
                name,
                type: annotationType,
                geometry: feature.geometry as Prisma.InputJsonValue,
                style: layer.style ? (layer.style as Prisma.InputJsonValue) : undefined,
                description: feature.properties["beschreibung"]
                  ? String(feature.properties["beschreibung"])
                  : undefined,
                createdById: check.userId!,
              },
            });
            annotationsCreated++;
          }
          continue;
        }

        // Plot-type layers — create Plots with optional Owners and Leases
        const plotMapping = (layer.plotMapping || {}) as Record<PlotMappableField, string | null>;
        const ownerMapping = (layer.ownerMapping || {}) as Record<OwnerMappableField, string | null>;

        for (const feature of layer.features) {
          if (!feature.geometry) {
            skipped.push({ name: `Feature ${feature.id}`, reason: "Keine Geometrie" });
            continue;
          }

          // Apply field mapping
          const plotData = applyPlotMapping(feature.properties, plotMapping);

          if (!plotData.cadastralDistrict || !plotData.plotNumber) {
            skipped.push({
              name: `Feature ${feature.id}`,
              reason: "Gemarkung oder Flurstücknummer fehlt",
            });
            continue;
          }

          // Check for existing plot — update if _wpmId present or duplicate found
          const wpmId = feature.properties["_wpmId"] as string | undefined;
          let existingPlot = wpmId
            ? await tx.plot.findFirst({ where: { id: wpmId, tenantId } })
            : await tx.plot.findFirst({
                where: {
                  tenantId,
                  cadastralDistrict: plotData.cadastralDistrict,
                  fieldNumber: plotData.fieldNumber || "0",
                  plotNumber: plotData.plotNumber,
                },
              });

          if (existingPlot) {
            // Update existing plot geometry (QGIS roundtrip: re-import edited data)
            await tx.plot.update({
              where: { id: existingPlot.id },
              data: {
                geometry: feature.geometry as Prisma.InputJsonValue,
                areaSqm: plotData.areaSqm ?? feature.areaSqm ?? undefined,
                latitude: feature.centroid?.lat,
                longitude: feature.centroid?.lng,
              },
            });
            plotsCreated++; // count as processed
            continue;
          }

          // Create new Plot
          const newPlot = await tx.plot.create({
            data: {
              tenantId,
              parkId: data.parkId,
              cadastralDistrict: plotData.cadastralDistrict,
              fieldNumber: plotData.fieldNumber || "0",
              plotNumber: plotData.plotNumber,
              areaSqm: plotData.areaSqm ?? feature.areaSqm ?? undefined,
              county: plotData.county,
              municipality: plotData.municipality,
              usageType: plotData.usageType,
              geometry: feature.geometry as Prisma.InputJsonValue,
              latitude: feature.centroid?.lat,
              longitude: feature.centroid?.lng,
            },
          });

          // Create PlotArea if layer type specifies one
          if (layer.areaType) {
            await tx.plotArea.create({
              data: {
                plotId: newPlot.id,
                areaType: layer.areaType,
                areaSqm: plotData.areaSqm ?? feature.areaSqm ?? 0,
              },
            });
          } else if (layer.type === "WEA_STANDORT") {
            await tx.plotArea.create({
              data: {
                plotId: newPlot.id,
                areaType: "WEA_STANDORT",
                areaSqm: plotData.areaSqm ?? feature.areaSqm ?? 0,
              },
            });
          }

          plotsCreated++;

          // Owner handling
          const ownerData = applyOwnerMapping(feature.properties, ownerMapping);
          const ownerName = ownerData.name || [ownerData.firstName, ownerData.lastName].filter(Boolean).join(" ");

          if (!ownerName || ownerName.trim().length < 2) continue;

          // Check owner edits
          const ownerKey = ownerName.trim().toLowerCase();
          const ownerEdit = data.ownerEdits?.[ownerKey];

          if (ownerEdit?.skip) continue;

          let personId: string;

          if (ownerEdit?.matchedPersonId) {
            personId = ownerEdit.matchedPersonId;
            personsReused++;
          } else if (personCache.has(ownerKey)) {
            personId = personCache.get(ownerKey)!;
            personsReused++;
          } else {
            // Try to find existing person by name
            const existingPerson = await tx.person.findFirst({
              where: {
                tenantId,
                OR: [
                  { companyName: { contains: ownerName, mode: "insensitive" } },
                  {
                    AND: [
                      { firstName: { contains: ownerData.firstName || "", mode: "insensitive" } },
                      { lastName: { contains: ownerData.lastName || ownerName, mode: "insensitive" } },
                    ],
                  },
                ],
              },
            });

            if (existingPerson) {
              personId = existingPerson.id;
              personsReused++;
            } else {
              // Create new person
              const isLegal = /gmbh|gbr|kg|ag|eg|ohg|mbh|ug|stiftung|verein|genossenschaft|erbengemeinschaft/i.test(ownerName);

              const newPerson = await tx.person.create({
                data: {
                  tenantId,
                  personType: isLegal ? "legal" : "natural",
                  firstName: isLegal ? undefined : ownerData.firstName || undefined,
                  lastName: isLegal ? undefined : ownerData.lastName || ownerName,
                  companyName: isLegal ? ownerName : undefined,
                  street: ownerData.street || undefined,
                  houseNumber: ownerData.houseNumber || undefined,
                  postalCode: ownerData.postalCode || undefined,
                  city: ownerData.city || undefined,
                },
              });
              personId = newPerson.id;
              personsCreated++;
            }

            personCache.set(ownerKey, personId);
          }

          // Create Lease if requested
          if (data.leaseStartDate && personId) {
            const lease = await tx.lease.create({
              data: {
                tenantId,
                lessorId: personId,
                startDate: new Date(data.leaseStartDate),
                status: data.leaseStatus || "DRAFT",
              },
            });

            await tx.leasePlot.create({
              data: {
                leaseId: lease.id,
                plotId: newPlot.id,
              },
            });

            leasesCreated++;
          }
        }
      }
    });

    logger.info({
      parkId: data.parkId,
      plotsCreated,
      annotationsCreated,
      personsCreated,
      personsReused,
      leasesCreated,
      skipped: skipped.length,
    }, "GIS import completed");

    return NextResponse.json({
      plotsCreated,
      annotationsCreated,
      personsCreated,
      personsReused,
      leasesCreated,
      skipped,
      errors,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    logger.error({ err: error }, "Error executing GIS import");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Fehler beim Import" },
      { status: 500 }
    );
  }
}
