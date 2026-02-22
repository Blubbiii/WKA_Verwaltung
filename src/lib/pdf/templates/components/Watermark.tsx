import { View, Text, StyleSheet } from "@react-pdf/renderer";
import {
  type WatermarkProps,
  type WatermarkType,
  getWatermarkConfig,
} from "../../utils/watermark";

/**
 * Watermark Component for React-PDF
 *
 * Renders a diagonal watermark text across the page.
 * The watermark is positioned fixed so it appears on every page.
 *
 * Usage:
 *   <Watermark type="DRAFT" />
 *   <Watermark type="CONFIDENTIAL" opacity={0.2} />
 *   <Watermark customText="ARCHIVIERT" color="#0000FF" opacity={0.3} />
 */

// Base styles for the watermark container
const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    // Ensure watermark is above all content
    zIndex: 9999,
    // Prevent watermark from capturing any interactions
    pointerEvents: "none",
  },
  textWrapper: {
    // Transform origin for rotation
    transformOrigin: "center center",
  },
  text: {
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    // Letter spacing for better readability
    letterSpacing: 4,
  },
});

interface WatermarkComponentProps extends WatermarkProps {
  /** Page width in points (for A4: 595.28) */
  pageWidth?: number;
  /** Page height in points (for A4: 841.89) */
  pageHeight?: number;
}

export function Watermark({
  type = "DRAFT",
  customText,
  opacity,
  color,
  pageWidth = 595.28, // A4 width in points
  pageHeight = 841.89, // A4 height in points
}: WatermarkComponentProps) {
  // Get default config for the type
  const config = getWatermarkConfig(type);

  // Apply custom overrides
  const finalText = customText ?? config.text;
  const finalOpacity = opacity ?? config.opacity;
  const finalColor = color ?? config.color;
  const fontSize = config.fontSize;
  const rotation = config.rotation;

  // Calculate center position
  const centerX = pageWidth / 2;
  const centerY = pageHeight / 2;

  // Estimate text width (approximate)
  const textWidth = finalText.length * fontSize * 0.6;
  const textHeight = fontSize * 1.2;

  return (
    <View style={styles.container} fixed>
      <View
        style={[
          styles.textWrapper,
          {
            // Position at center of page
            position: "absolute",
            left: centerX - textWidth / 2,
            top: centerY - textHeight / 2,
            // Apply rotation
            transform: `rotate(${rotation}deg)`,
            // Set width to accommodate text
            width: textWidth,
          },
        ]}
      >
        <Text
          style={[
            styles.text,
            {
              fontSize: fontSize,
              color: finalColor,
              opacity: finalOpacity,
            },
          ]}
        >
          {finalText}
        </Text>
      </View>
    </View>
  );
}

// Export types for external use
export type { WatermarkProps, WatermarkType };
