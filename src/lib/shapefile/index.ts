/**
 * Shapefile parsing and ALKIS field-mapping utilities.
 *
 * Re-exports everything from the parser and field-mapping modules for
 * convenient single-import usage:
 *
 *   import { parseShapefile, autoDetectPlotMapping } from "@/lib/shapefile";
 */

export {
  parseShapefile,
  type ParsedShpFeature,
  type ShpParseResult,
} from "./shp-parser";

export {
  autoDetectPlotMapping,
  autoDetectOwnerMapping,
  applyPlotMapping,
  applyOwnerMapping,
  getPlotMappableFields,
  getOwnerMappableFields,
  type PlotMappableField,
  type OwnerMappableField,
  type MappedPlotData,
  type MappedOwnerData,
  type MappableFieldDescriptor,
} from "./field-mapping";
