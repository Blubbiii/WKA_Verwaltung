/**
 * Watermark Types and Utilities
 *
 * This module provides types and helper functions for PDF watermarks.
 */

// Watermark types
export type WatermarkType = "DRAFT" | "CONFIDENTIAL" | "SAMPLE" | "COPY";

// Watermark configuration interface
export interface WatermarkConfig {
  /** The text to display */
  text: string;
  /** Text color in hex format */
  color: string;
  /** Opacity value between 0 and 1 */
  opacity: number;
  /** Font size in points */
  fontSize: number;
  /** Rotation angle in degrees */
  rotation: number;
}

// Watermark props for the component
export interface WatermarkProps {
  /** Predefined watermark type */
  type?: WatermarkType;
  /** Custom text (overrides type text) */
  customText?: string;
  /** Custom opacity (overrides type opacity) */
  opacity?: number;
  /** Custom color (overrides type color) */
  color?: string;
}

// Options for shouldShowWatermark
export interface WatermarkOptions {
  /** Force show watermark regardless of status */
  forceShow?: boolean;
  /** Is this a preview/sample? */
  isPreview?: boolean;
  /** Explicit watermark type to show */
  watermarkType?: WatermarkType;
}

/**
 * Default configurations for each watermark type
 */
const WATERMARK_CONFIGS: Record<WatermarkType, WatermarkConfig> = {
  DRAFT: {
    text: "ENTWURF",
    color: "#888888",
    opacity: 0.5,
    fontSize: 72,
    rotation: -45,
  },
  CONFIDENTIAL: {
    text: "VERTRAULICH",
    color: "#CC0000",
    opacity: 0.3,
    fontSize: 60,
    rotation: -45,
  },
  SAMPLE: {
    text: "MUSTER",
    color: "#888888",
    opacity: 0.5,
    fontSize: 72,
    rotation: -45,
  },
  COPY: {
    text: "KOPIE",
    color: "#888888",
    opacity: 0.3,
    fontSize: 72,
    rotation: -45,
  },
};

/**
 * Get watermark configuration for a specific type
 * @param type - The watermark type
 * @returns Watermark configuration
 */
export function getWatermarkConfig(type: WatermarkType): WatermarkConfig {
  return { ...WATERMARK_CONFIGS[type] };
}

/**
 * Get all available watermark types
 * @returns Array of watermark types
 */
export function getWatermarkTypes(): WatermarkType[] {
  return ["DRAFT", "CONFIDENTIAL", "SAMPLE", "COPY"];
}

/**
 * Determine if a watermark should be shown based on document status and options
 * @param status - The document status (e.g., "DRAFT", "SENT", "PAID")
 * @param options - Additional options to control watermark visibility
 * @returns Object with show flag and watermark type
 */
export function shouldShowWatermark(
  status: string,
  options: WatermarkOptions = {}
): { show: boolean; type: WatermarkType | null } {
  const { forceShow, isPreview, watermarkType } = options;

  // If explicit watermark type is provided, show it
  if (watermarkType) {
    return { show: true, type: watermarkType };
  }

  // If force show is enabled with preview, show SAMPLE
  if (forceShow && isPreview) {
    return { show: true, type: "SAMPLE" };
  }

  // If it's a preview, show SAMPLE watermark
  if (isPreview) {
    return { show: true, type: "SAMPLE" };
  }

  // If document is in DRAFT status, show DRAFT watermark
  if (status === "DRAFT") {
    return { show: true, type: "DRAFT" };
  }

  // If document is CANCELLED, show COPY watermark
  if (status === "CANCELLED") {
    return { show: true, type: "COPY" };
  }

  // No watermark needed
  return { show: false, type: null };
}

/**
 * Parse watermark query parameter to WatermarkType
 * @param watermarkParam - The query parameter value
 * @returns WatermarkType or undefined
 */
export function parseWatermarkParam(watermarkParam: string | null): WatermarkType | undefined {
  if (!watermarkParam) return undefined;

  const normalized = watermarkParam.toUpperCase();
  const validTypes: WatermarkType[] = ["DRAFT", "CONFIDENTIAL", "SAMPLE", "COPY"];

  if (validTypes.includes(normalized as WatermarkType)) {
    return normalized as WatermarkType;
  }

  return undefined;
}

/**
 * Get watermark label for display (e.g., in UI dropdowns)
 * @param type - The watermark type
 * @returns Human-readable label
 */
export function getWatermarkLabel(type: WatermarkType): string {
  const labels: Record<WatermarkType, string> = {
    DRAFT: "Entwurf",
    CONFIDENTIAL: "Vertraulich",
    SAMPLE: "Muster",
    COPY: "Kopie",
  };
  return labels[type];
}
